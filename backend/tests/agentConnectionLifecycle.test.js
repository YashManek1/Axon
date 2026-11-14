import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("../config/queue.js", async () => {
  const { default: Redis } = await import("ioredis-mock");
  return { redisConnection: new Redis() };
});
vi.mock("../metrics.js", () => ({ agentConnected: { inc: vi.fn(), dec: vi.fn() } }));

import Agent from "../models/agent.js";
import { redisConnection } from "../config/queue.js";
import { agentConnected } from "../metrics.js";
import { attachAgentConnection } from "../services/agentConnectionLifecycle.js";
import {
  claimTelemetryOwner,
  recordHeartbeat,
  getAgentTelemetry,
} from "../services/agentTelemetryBuffer.js";
import { flushAgentTelemetry } from "../workers/telemetryFlushWorker.js";

async function fixture({ legacy = false } = {}) {
  const raw = {
    _id: new mongoose.Types.ObjectId(),
    orgId: new mongoose.Types.ObjectId(),
    name: "test-server", hardwareUuid: crypto.randomUUID(),
    apiKey: `synthetic-hash-${crypto.randomUUID()}`, status: "offline", decommissionedAt: null,
    ...(legacy ? {} : { tokenVersion: 0 }),
  };
  await Agent.collection.insertOne(raw);
  return raw;
}

function connection(agent, id = crypto.randomUUID()) {
  const handlers = {};
  const socket = {
    id, agentId: String(agent._id), orgId: String(agent.orgId),
    authGeneration: 0, authApiKeyHash: null, connected: true,
    on: vi.fn((event, handler) => { handlers[event] = handler; }),
    disconnect: vi.fn(() => {
      socket.connected = false;
      return handlers.disconnect?.();
    }),
    handlers,
  };
  return socket;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await redisConnection.flushdb();
});

describe("agent connection credential lifecycle", () => {
  it("claims a current connection and releases only that generation", async () => {
    const agent = await fixture();
    const socket = connection(agent);
    await expect(attachAgentConnection(socket)).resolves.toBe(true);
    expect(await Agent.findById(agent._id).lean()).toMatchObject({
      status: "online",
      socketId: socket.id,
      connectionGeneration: 1,
    });
    await socket.disconnect();
    expect(await Agent.findById(agent._id).lean()).toMatchObject({
      status: "offline",
      socketId: null,
      connectionGeneration: 1,
    });
    expect(agentConnected.inc).toHaveBeenCalledTimes(1);
    expect(agentConnected.dec).toHaveBeenCalledTimes(1);
  });

  it.each(["rotation", "decommission"])("refuses a handshake snapshot after %s", async (change) => {
    const agent = await fixture({ legacy: true });
    const socket = connection(agent);
    await Agent.updateOne({ _id: agent._id }, {
      $inc: { tokenVersion: 1 },
      ...(change === "decommission" ? { $set: { decommissionedAt: new Date() } } : {}),
    });
    await expect(attachAgentConnection(socket)).resolves.toBe(false);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(await Agent.findById(agent._id).lean()).toMatchObject({ status: "offline", tokenVersion: 1 });
    expect(agentConnected.inc).not.toHaveBeenCalled();
  });

  it("accepts legacy version zero and creates the durable connection generation", async () => {
    const agent = await fixture({ legacy: true });
    const socket = connection(agent);
    expect(await attachAgentConnection(socket)).toBe(true);
    expect(await Agent.collection.findOne({ _id: agent._id })).toMatchObject({
      connectionGeneration: 1,
    });
    expect(await Agent.collection.findOne({ _id: agent._id })).not.toHaveProperty("tokenVersion");
    await Agent.updateOne({ _id: agent._id }, { $inc: { tokenVersion: 1 }, $set: { status: "offline", socketId: null } });
    await socket.disconnect();
    expect((await Agent.findById(agent._id)).tokenVersion).toBe(1);
  });

  it("cleans up when disconnect happens while the claim is pending", async () => {
    const agent = await fixture();
    const socket = connection(agent);
    const original = Agent.findOneAndUpdate.bind(Agent);
    vi.spyOn(Agent, "findOneAndUpdate").mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      await socket.disconnect();
      return result;
    });
    expect(await attachAgentConnection(socket)).toBe(false);
    expect(await Agent.findById(agent._id).lean()).toMatchObject({ status: "offline", socketId: null });
    expect(agentConnected.inc).not.toHaveBeenCalled();
  });

  it("an old disconnect cannot clear a replacement connection", async () => {
    const agent = await fixture();
    const first = connection(agent);
    const second = connection(agent);
    await attachAgentConnection(first);
    await attachAgentConnection(second);
    await first.disconnect();
    expect(await Agent.findById(agent._id).lean()).toMatchObject({
      status: "online",
      socketId: second.id,
      connectionGeneration: 2,
    });
    await second.disconnect();
  });

  it("rejects a Mongo claim when Redis already has a newer generation", async () => {
    const agent = await fixture();
    const socket = connection(agent);
    await claimTelemetryOwner(String(agent._id), {
      socketId: "newer-socket",
      tokenVersion: 0,
      connectionGeneration: 99,
    });

    await expect(attachAgentConnection(socket)).resolves.toBe(false);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(agentConnected.inc).not.toHaveBeenCalled();
    expect(await Agent.findById(agent._id).lean()).toMatchObject({
      status: "offline",
      socketId: null,
      connectionGeneration: 1,
    });
    await expect(
      redisConnection.hgetall(`agent:telemetry:${agent._id}`),
    ).resolves.toMatchObject({
      socketId: "newer-socket",
      connectionGeneration: "99",
      status: "ONLINE",
    });
  });

  it("handles claim and release database errors without rejecting callbacks", async () => {
    const agent = await fixture();
    const rejected = connection(agent);
    vi.spyOn(Agent, "findOneAndUpdate").mockRejectedValueOnce(new Error("synthetic DB outage"));
    await expect(attachAgentConnection(rejected)).resolves.toBe(false);
    const accepted = connection(agent);
    expect(await attachAgentConnection(accepted)).toBe(true);
    vi.spyOn(Agent, "updateOne").mockRejectedValueOnce(new Error("synthetic cleanup outage"));
    await expect(accepted.disconnect()).resolves.toBeUndefined();
    expect(agentConnected.dec).toHaveBeenCalledTimes(1);
  });

  it("stale telemetry cannot restore a rotated or decommissioned server", async () => {
    for (const decommissioned of [false, true]) {
      const agent = await fixture();
      const socket = connection(agent);
      await attachAgentConnection(socket);
      const identity = {
        socketId: socket.id,
        tokenVersion: 0,
        connectionGeneration: socket.agent.connectionGeneration,
      };
      await recordHeartbeat(String(agent._id), {
        os: "linux",
        arch: "x64",
        cpuLoad: 1,
        ramTotal: 100,
        ramUsed: 50,
      }, identity);
      await Agent.updateOne({ _id: agent._id }, {
        $inc: { tokenVersion: 1 },
        $set: { status: "offline", socketId: null, ...(decommissioned ? { decommissionedAt: new Date() } : {}) },
      });
      const result = await flushAgentTelemetry();
      expect(result).not.toHaveProperty("error");
      expect(await Agent.findById(agent._id).lean()).toMatchObject({
        status: "offline",
        socketId: null,
        tokenVersion: 1,
        connectionGeneration: identity.connectionGeneration,
      });
      expect(await getAgentTelemetry(String(agent._id), {
        socketId: null,
        tokenVersion: 1,
        connectionGeneration: identity.connectionGeneration,
      })).toBeNull();
      await socket.disconnect();
    }
  });
});
