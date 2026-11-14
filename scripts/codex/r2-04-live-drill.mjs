import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const backendRequire = createRequire(new URL("../../backend/package.json", import.meta.url));
const mongoose = backendRequire("mongoose");

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("Arguments must be supplied as --name value pairs");
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function requireIsolatedEndpoints() {
  const redisUrl = new URL(process.env.REDIS_URI || "");
  const mongoUrl = new URL(process.env.MONGO_URI || "");
  assert.equal(redisUrl.pathname, "/15", "R2-04 drill requires isolated Redis database 15");
  assert.equal(
    mongoUrl.pathname,
    "/axon_r204_acceptance",
    "R2-04 drill requires the axon_r204_acceptance Mongo database",
  );
}

class DrillSocket extends EventEmitter {
  constructor({ id, agentId, orgId }) {
    super();
    this.id = id;
    this.agentId = String(agentId);
    this.orgId = String(orgId);
    this.authGeneration = 0;
    this.connected = true;
    this.data = {};
    this.disconnected = false;
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
  }
}

function identity(socket) {
  return {
    socketId: socket.id,
    tokenVersion: socket.authGeneration,
    connectionGeneration: socket.agent.connectionGeneration,
  };
}

async function createRawAgent(Agent, { suffix, orgId, connectionGeneration }) {
  const _id = new mongoose.Types.ObjectId();
  const document = {
    _id,
    name: `r204-${suffix}`,
    orgId,
    apiKey: `r204-api-${suffix}-${_id}`,
    hardwareUuid: `r204-hardware-${suffix}-${_id}`,
    decommissionedAt: null,
    tokenVersion: 0,
    status: "offline",
    socketId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (connectionGeneration !== undefined) {
    document.connectionGeneration = connectionGeneration;
  }
  await Agent.collection.insertOne(document);
  return _id;
}

async function closeRuntime({ redisConnection, scheduledJobsQueue, immediateJobsQueue }) {
  await Promise.allSettled([scheduledJobsQueue.close(), immediateJobsQueue.close()]);
  if (redisConnection.status !== "end") {
    await redisConnection.quit();
  }
  await mongoose.disconnect();
}

async function loadRuntime() {
  const [{ default: Agent }, lifecycle, telemetry, locks, queue] = await Promise.all([
    import("../../backend/models/agent.js"),
    import("../../backend/services/agentConnectionLifecycle.js"),
    import("../../backend/services/agentTelemetryBuffer.js"),
    import("../../backend/services/distributedLock.js"),
    import("../../backend/config/queue.js"),
  ]);
  return { Agent, ...lifecycle, ...telemetry, ...locks, ...queue };
}

async function seed(statePath, reportPath) {
  const startedAt = new Date().toISOString();
  const runtime = await loadRuntime();
  const { Agent, attachAgentConnection, getAgentTelemetry } = runtime;
  await mongoose.connect(process.env.MONGO_URI);

  const orgId = new mongoose.Types.ObjectId();
  const primaryAgentId = await createRawAgent(Agent, {
    suffix: "restart",
    orgId,
    connectionGeneration: 0,
  });
  const socket = new DrillSocket({
    id: `r204-seed-${primaryAgentId}`,
    agentId: primaryAgentId,
    orgId,
  });

  try {
    assert.equal(await attachAgentConnection(socket), true, "initial connection must attach");
    assert.equal(socket.agent.connectionGeneration, 1, "first connection must claim generation 1");
    const owner = await getAgentTelemetry(primaryAgentId, identity(socket));
    assert.equal(owner?.socketId, socket.id, "Redis must contain the generation-1 owner");

    const state = {
      version: 1,
      orgId: String(orgId),
      primaryAgentId: String(primaryAgentId),
      firstSocketId: socket.id,
      seededGeneration: 1,
      seededAt: new Date().toISOString(),
    };
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await writeFile(
      reportPath,
      `${JSON.stringify({ phase: "seed", status: "passed", startedAt, finishedAt: new Date().toISOString(), checks: ["mongo_generation_1", "redis_owner_generation_1"] }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write("R2-04 seed passed: Mongo and Redis recorded generation 1.\n");
  } finally {
    await closeRuntime(runtime);
  }
}

async function verify(statePath, reportPath) {
  const startedAt = new Date().toISOString();
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const runtime = await loadRuntime();
  const {
    Agent,
    attachAgentConnection,
    claimTelemetryOwner,
    recordHeartbeat,
    markAgentOffline,
    getAgentTelemetry,
    acquireJobLock,
    releaseJobLock,
    redisConnection,
  } = runtime;
  await mongoose.connect(process.env.MONGO_URI);

  const orgId = new mongoose.Types.ObjectId(state.orgId);
  const primaryAgentId = new mongoose.Types.ObjectId(state.primaryAgentId);
  const telemetryKey = (agentId) => `agent:telemetry:${agentId}`;
  const activePoolKey = "agent:active:pool";
  const cleanupAgentIds = [primaryAgentId];
  const cleanupRedisAgentIds = [String(primaryAgentId)];
  const lockResource = `r204-overlap-${primaryAgentId}`;
  const checks = [];

  try {
    const restoredOwner = await getAgentTelemetry(primaryAgentId);
    assert.equal(restoredOwner?.socketId, state.firstSocketId, "Redis restart must restore the AOF-backed owner");
    assert.equal(Number(restoredOwner.connectionGeneration), 1);
    checks.push("redis_restart_restored_scoped_owner");

    const secondSocket = new DrillSocket({
      id: `r204-second-${primaryAgentId}`,
      agentId: primaryAgentId,
      orgId,
    });
    assert.equal(await attachAgentConnection(secondSocket), true);
    assert.equal(secondSocket.agent.connectionGeneration, 2);
    const secondIdentity = identity(secondSocket);
    checks.push("mongo_generation_advanced_after_restart");

    const staleIdentity = {
      socketId: state.firstSocketId,
      tokenVersion: 0,
      connectionGeneration: 1,
    };
    await recordHeartbeat(primaryAgentId, { os: "stale-owner", arch: "x64" }, staleIdentity);
    await markAgentOffline(primaryAgentId, staleIdentity);
    await recordHeartbeat(primaryAgentId, { os: "current-owner", arch: "x64" }, secondIdentity);
    const fencedTelemetry = await getAgentTelemetry(primaryAgentId, secondIdentity);
    assert.equal(fencedTelemetry?.status, "ONLINE");
    assert.equal(fencedTelemetry?.os, "current-owner");
    checks.push("stale_owner_cannot_mutate_current_telemetry");

    await redisConnection.del(telemetryKey(primaryAgentId));
    await redisConnection.zrem(activePoolKey, String(primaryAgentId));
    const thirdSocket = new DrillSocket({
      id: `r204-third-${primaryAgentId}`,
      agentId: primaryAgentId,
      orgId,
    });
    assert.equal(await attachAgentConnection(thirdSocket), true);
    assert.equal(thirdSocket.agent.connectionGeneration, 3);
    assert.equal((await getAgentTelemetry(primaryAgentId, identity(thirdSocket)))?.socketId, thirdSocket.id);
    checks.push("scoped_redis_loss_recovers_from_mongo_generation");

    const aheadAgentId = await createRawAgent(Agent, {
      suffix: "redis-ahead",
      orgId,
      connectionGeneration: 4,
    });
    cleanupAgentIds.push(aheadAgentId);
    cleanupRedisAgentIds.push(String(aheadAgentId));
    assert.equal(
      await claimTelemetryOwner(aheadAgentId, {
        socketId: "r204-ahead-owner",
        tokenVersion: 0,
        connectionGeneration: 99,
      }),
      true,
    );
    const rejectedSocket = new DrillSocket({
      id: `r204-rejected-${aheadAgentId}`,
      agentId: aheadAgentId,
      orgId,
    });
    assert.equal(await attachAgentConnection(rejectedSocket), false, "Redis-ahead owner must fail closed");
    assert.equal((await Agent.findById(aheadAgentId).lean()).connectionGeneration, 5);
    await redisConnection.del(telemetryKey(aheadAgentId));
    await redisConnection.zrem(activePoolKey, String(aheadAgentId));
    const recoveredSocket = new DrillSocket({
      id: `r204-recovered-${aheadAgentId}`,
      agentId: aheadAgentId,
      orgId,
    });
    assert.equal(await attachAgentConnection(recoveredSocket), true);
    assert.equal(recoveredSocket.agent.connectionGeneration, 6);
    checks.push("redis_ahead_fails_closed_then_scoped_reset_recovers_monotonically");

    const legacyAgentId = await createRawAgent(Agent, { suffix: "legacy", orgId });
    cleanupAgentIds.push(legacyAgentId);
    cleanupRedisAgentIds.push(String(legacyAgentId));
    const legacySocket = new DrillSocket({
      id: `r204-legacy-${legacyAgentId}`,
      agentId: legacyAgentId,
      orgId,
    });
    assert.equal(await attachAgentConnection(legacySocket), true);
    assert.equal(legacySocket.agent.connectionGeneration, 1);
    checks.push("legacy_agent_migrates_to_generation_1");

    const firstLease = await acquireJobLock(lockResource, "r204-owner-1", 1);
    assert.equal(firstLease.acquired, true);
    const overlapLease = await acquireJobLock(lockResource, "r204-owner-2", 1);
    assert.equal(overlapLease.acquired, false, "overlapping lease must be rejected");
    assert.equal(overlapLease.existingWorker, "r204-owner-1");
    await new Promise((resolve) => setTimeout(resolve, 1_250));
    const successorLease = await acquireJobLock(lockResource, "r204-owner-2", 1);
    assert.equal(successorLease.acquired, true, "successor may acquire only after expiry");
    assert.ok(successorLease.fencingToken > firstLease.fencingToken, "fencing token must increase");
    await releaseJobLock(lockResource, "r204-owner-2");
    checks.push("ttl_overlap_rejected_and_fence_increased");

    await writeFile(
      reportPath,
      `${JSON.stringify({ phase: "verify", status: "passed", startedAt, finishedAt: new Date().toISOString(), checks }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`R2-04 verification passed: ${checks.length} live checks.\n`);
  } finally {
    await redisConnection.del(...cleanupRedisAgentIds.map(telemetryKey));
    await redisConnection.zrem(activePoolKey, ...cleanupRedisAgentIds);
    await redisConnection.del(`job:lock:${lockResource}`, `job:fence:${lockResource}`);
    await Agent.deleteMany({ _id: { $in: cleanupAgentIds } });
    await closeRuntime(runtime);
  }
}

const args = parseArguments(process.argv.slice(2));
assert.ok(["seed", "verify"].includes(args.phase), "--phase must be seed or verify");
assert.ok(args.state, "--state is required");
assert.ok(args.report, "--report is required");
requireIsolatedEndpoints();

const statePath = path.resolve(args.state);
const reportPath = path.resolve(args.report);
if (args.phase === "seed") {
  await seed(statePath, reportPath);
} else {
  await verify(statePath, reportPath);
}
