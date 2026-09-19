import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let redisConnection;
let telemetryBuffer;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  redisConnection = new Redis();

  vi.doMock("../config/queue.js", () => ({
    redisConnection,
  }));

  telemetryBuffer = await import("../services/agentTelemetryBuffer.js");
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await redisConnection.flushdb();
});

describe("agentTelemetryBuffer", () => {
  it("recordHeartbeat with valid owner stores telemetry with ONLINE status", async () => {
    const owner = { socketId: "socket-1", tokenVersion: 0, connectionGeneration: 1 };
    await expect(telemetryBuffer.claimTelemetryOwner("agent-1", owner)).resolves.toBe(true);
    await telemetryBuffer.recordHeartbeat("agent-1", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.42,
      ramTotal: 16000,
      ramUsed: 8000,
    }, owner);

    const telemetry = await redisConnection.hgetall("agent:telemetry:agent-1");

    expect(telemetry).toEqual(
      expect.objectContaining({
        os: "linux",
        arch: "x64",
        cpuLoad: "0.42",
        ramTotal: "16000",
        ramUsed: "8000",
        status: "ONLINE",
        connectionGeneration: "1",
      }),
    );
    expect(Number(telemetry.lastSeenMs)).toBeGreaterThan(0);
  });

  it("recordHeartbeat adds only an owned agentId to the active pool", async () => {
    const owner = { socketId: "socket-2", tokenVersion: 0, connectionGeneration: 1 };
    await telemetryBuffer.claimTelemetryOwner("agent-2", owner);
    await telemetryBuffer.recordHeartbeat("agent-2", {
      os: "darwin",
      arch: "arm64",
      cpuLoad: 0.2,
      ramTotal: 32000,
      ramUsed: 12000,
    }, owner);

    const activeAgentIds = await redisConnection.zrange(
      "agent:active:pool",
      0,
      -1,
    );

    expect(activeAgentIds).toEqual(["agent-2"]);
  });

  it("markAgentOffline sets status only for the exact owner", async () => {
    const identity = { socketId: "socket-3", tokenVersion: 2, connectionGeneration: 4 };
    await telemetryBuffer.claimTelemetryOwner("agent-3", identity);
    await telemetryBuffer.recordHeartbeat("agent-3", {
      os: "windows",
      arch: "x64",
      cpuLoad: 0.7,
      ramTotal: 8000,
      ramUsed: 6000,
    }, identity);

    await telemetryBuffer.markAgentOffline("agent-3", {
      ...identity,
      connectionGeneration: 3,
    });
    await expect(
      redisConnection.hget("agent:telemetry:agent-3", "status"),
    ).resolves.toBe("ONLINE");

    await telemetryBuffer.markAgentOffline("agent-3", identity);
    await expect(
      redisConnection.hget("agent:telemetry:agent-3", "status"),
    ).resolves.toBe("OFFLINE");
  });

  it("getActiveAgentIds with a 30-second window returns only recently active agents", async () => {
    const oldOwner = { socketId: "old-socket", tokenVersion: 0, connectionGeneration: 1 };
    const recentOwner = { socketId: "recent-socket", tokenVersion: 0, connectionGeneration: 1 };
    await telemetryBuffer.claimTelemetryOwner("old-agent", oldOwner);
    await telemetryBuffer.claimTelemetryOwner("recent-agent", recentOwner);

    vi.spyOn(Date, "now").mockReturnValueOnce(1000);
    await telemetryBuffer.recordHeartbeat("old-agent", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.1,
      ramTotal: 1000,
      ramUsed: 500,
    }, oldOwner);

    vi.spyOn(Date, "now").mockReturnValueOnce(40000);
    await telemetryBuffer.recordHeartbeat("recent-agent", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.2,
      ramTotal: 1000,
      ramUsed: 600,
    }, recentOwner);

    vi.spyOn(Date, "now").mockReturnValueOnce(40000);
    await expect(telemetryBuffer.getActiveAgentIds(30000)).resolves.toEqual([
      "recent-agent",
    ]);
  });

  it("batches a burst of heartbeats into bounded Redis writes", async () => {
    const seed = redisConnection.pipeline();
    for (let index = 0; index < 1000; index += 1) {
      seed.hset(`agent:telemetry:batch-agent-${index}`, {
        status: "ONLINE",
        socketId: `batch-socket-${index}`,
        tokenVersion: "0",
        connectionGeneration: "1",
      });
    }
    await seed.exec();

    const evalSpy = vi.spyOn(redisConnection, "eval");
    const zaddSpy = vi.spyOn(redisConnection, "zadd");
    const pending = Array.from({ length: 1000 }, (_, index) =>
      telemetryBuffer.recordHeartbeat(`batch-agent-${index}`, {
        os: "linux",
        arch: "x64",
        cpuLoad: index % 100,
        ramTotal: 16000,
        ramUsed: 8000,
      }, {
        socketId: `batch-socket-${index}`,
        tokenVersion: 0,
        connectionGeneration: 1,
      }),
    );

    // Heartbeats are queued in the current turn and flushed together.
    expect(evalSpy).not.toHaveBeenCalled();
    await Promise.all(pending);

    // The Lua script is capped at 250 entries per invocation, and the active
    // pool is updated once after all accepted script results are collected.
    expect(evalSpy).toHaveBeenCalledTimes(4);
    expect(evalSpy.mock.calls.map((call) => call[1])).toEqual([
      251,
      251,
      251,
      251,
    ]);
    expect(zaddSpy).toHaveBeenCalledTimes(1);
    await expect(redisConnection.zcard("agent:active:pool")).resolves.toBe(1000);
  });

  it("rejects a delayed older claim after the newer generation owns Redis", async () => {
    const oldOwner = { socketId: "old-socket", tokenVersion: 1, connectionGeneration: 1 };
    const newOwner = { socketId: "new-socket", tokenVersion: 2, connectionGeneration: 2 };

    await expect(telemetryBuffer.claimTelemetryOwner("agent-owned", newOwner)).resolves.toBe(true);
    await expect(telemetryBuffer.claimTelemetryOwner("agent-owned", oldOwner)).resolves.toBe(false);

    await expect(
      redisConnection.hgetall("agent:telemetry:agent-owned"),
    ).resolves.toMatchObject({
      socketId: "new-socket",
      tokenVersion: "2",
      connectionGeneration: "2",
      status: "ONLINE",
    });
  });

  it("accepts only an idempotent retry at the current generation", async () => {
    const owner = { socketId: "socket-current", tokenVersion: 3, connectionGeneration: 7 };
    await expect(telemetryBuffer.claimTelemetryOwner("agent-current", owner)).resolves.toBe(true);
    await expect(telemetryBuffer.claimTelemetryOwner("agent-current", owner)).resolves.toBe(true);
    await expect(telemetryBuffer.claimTelemetryOwner("agent-current", {
      ...owner,
      socketId: "different-socket",
    })).resolves.toBe(false);

    await expect(
      redisConnection.hgetall("agent:telemetry:agent-current"),
    ).resolves.toMatchObject({
      socketId: owner.socketId,
      tokenVersion: "3",
      connectionGeneration: "7",
    });
  });

  it("rejects stale heartbeats after a newer owner is claimed", async () => {
    const oldOwner = { socketId: "old-socket", tokenVersion: 1, connectionGeneration: 1 };
    const newOwner = { socketId: "new-socket", tokenVersion: 2, connectionGeneration: 2 };
    await telemetryBuffer.claimTelemetryOwner("agent-owned", oldOwner);
    await telemetryBuffer.recordHeartbeat("agent-owned", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.1,
      ramTotal: 1000,
      ramUsed: 100,
    }, oldOwner);

    await telemetryBuffer.claimTelemetryOwner("agent-owned", newOwner);
    await telemetryBuffer.recordHeartbeat("agent-owned", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.9,
      ramTotal: 1000,
      ramUsed: 900,
    }, oldOwner);

    let telemetry = await redisConnection.hgetall("agent:telemetry:agent-owned");
    expect(telemetry).toMatchObject({
      socketId: "new-socket",
      tokenVersion: "2",
      connectionGeneration: "2",
      cpuLoad: "0.1",
    });

    await telemetryBuffer.recordHeartbeat("agent-owned", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.2,
      ramTotal: 1000,
      ramUsed: 200,
    }, newOwner);
    telemetry = await redisConnection.hgetall("agent:telemetry:agent-owned");
    expect(telemetry.cpuLoad).toBe("0.2");
  });

  it("does not let an unclaimed heartbeat create an owner", async () => {
    await telemetryBuffer.recordHeartbeat("agent-unclaimed", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.1,
      ramTotal: 1000,
      ramUsed: 100,
    }, {
      socketId: "unknown",
      tokenVersion: 0,
      connectionGeneration: 1,
    });

    await expect(
      redisConnection.hgetall("agent:telemetry:agent-unclaimed"),
    ).resolves.toEqual({});
    await expect(redisConnection.zscore("agent:active:pool", "agent-unclaimed")).resolves.toBeNull();
  });
});
