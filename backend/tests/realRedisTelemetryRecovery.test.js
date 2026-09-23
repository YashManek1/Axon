import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const redisUrl = process.env.REDIS_URL;
const usesIsolatedDb = (() => {
  if (!redisUrl) return false;
  try {
    return new URL(redisUrl).pathname === "/15";
  } catch {
    return false;
  }
})();
const describeRealRedis = usesIsolatedDb ? describe : describe.skip;

describeRealRedis("real Redis telemetry recovery", () => {
  let redis;
  let telemetry;
  const agentIds = [];

  async function cleanupAgent(agentId) {
    await redis.del(`agent:telemetry:${agentId}`);
    await redis.zrem("agent:active:pool", agentId);
  }

  beforeAll(async () => {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      retryStrategy: () => null,
    });
    redis.on("error", () => {});
    await redis.connect();
    expect(await redis.ping()).toBe("PONG");
    vi.doMock("../config/queue.js", () => ({ redisConnection: redis }));
    telemetry = await import("../services/agentTelemetryBuffer.js");
  });

  afterAll(async () => {
    for (const agentId of agentIds) {
      await cleanupAgent(agentId);
    }
    redis?.disconnect();
    vi.doUnmock("../config/queue.js");
  });

  it("recovers telemetry ownership after the isolated Redis state is lost", async () => {
    const agentId = randomUUID();
    agentIds.push(agentId);
    const firstOwner = {
      socketId: "socket-before-restart",
      tokenVersion: 4,
      connectionGeneration: 1,
    };
    const recoveredOwner = {
      socketId: "socket-after-restart",
      tokenVersion: 4,
      connectionGeneration: 2,
    };

    expect(await telemetry.claimTelemetryOwner(agentId, firstOwner)).toBe(true);
    await telemetry.recordHeartbeat(agentId, { os: "linux", arch: "x64" }, firstOwner);
    expect(await telemetry.getAgentTelemetry(agentId, firstOwner)).toMatchObject({
      socketId: firstOwner.socketId,
      connectionGeneration: "1",
    });

    await cleanupAgent(agentId);
    expect(await telemetry.getAgentTelemetry(agentId)).toBeNull();

    expect(await telemetry.claimTelemetryOwner(agentId, recoveredOwner)).toBe(true);
    await telemetry.recordHeartbeat(agentId, { os: "linux", arch: "x64" }, recoveredOwner);
    expect(await telemetry.getAgentTelemetry(agentId, recoveredOwner)).toMatchObject({
      socketId: recoveredOwner.socketId,
      connectionGeneration: "2",
    });
    expect(await telemetry.getActiveAgentIds()).toContain(agentId);
  });

  it("rejects a stale generation while Redis is ahead, then permits reclaim after scoped reset", async () => {
    const agentId = randomUUID();
    agentIds.push(agentId);
    const aheadOwner = {
      socketId: "socket-ahead",
      tokenVersion: 9,
      connectionGeneration: 9,
    };
    const resetOwner = {
      socketId: "socket-reset",
      tokenVersion: 1,
      connectionGeneration: 1,
    };

    expect(await telemetry.claimTelemetryOwner(agentId, aheadOwner)).toBe(true);
    expect(await telemetry.claimTelemetryOwner(agentId, resetOwner)).toBe(false);

    await cleanupAgent(agentId);

    expect(await telemetry.claimTelemetryOwner(agentId, resetOwner)).toBe(true);
    expect(await telemetry.getAgentTelemetry(agentId, resetOwner)).toMatchObject({
      socketId: resetOwner.socketId,
      tokenVersion: "1",
      connectionGeneration: "1",
    });
  });
});
