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
  await redisConnection.flushall();
});

describe("agentTelemetryBuffer", () => {
  it("recordHeartbeat with valid data stores telemetry with ONLINE status", async () => {
    await telemetryBuffer.recordHeartbeat("agent-1", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.42,
      ramTotal: 16000,
      ramUsed: 8000,
    });

    const telemetry = await redisConnection.hgetall("agent:telemetry:agent-1");

    expect(telemetry).toEqual(
      expect.objectContaining({
        os: "linux",
        arch: "x64",
        cpuLoad: "0.42",
        ramTotal: "16000",
        ramUsed: "8000",
        status: "ONLINE",
      }),
    );
    expect(Number(telemetry.lastSeenMs)).toBeGreaterThan(0);
  });

  it("recordHeartbeat adds the agentId to the active pool sorted set", async () => {
    await telemetryBuffer.recordHeartbeat("agent-2", {
      os: "darwin",
      arch: "arm64",
      cpuLoad: 0.2,
      ramTotal: 32000,
      ramUsed: 12000,
    });

    const activeAgentIds = await redisConnection.zrange(
      "agent:active:pool",
      0,
      -1,
    );

    expect(activeAgentIds).toEqual(["agent-2"]);
  });

  it("markAgentOffline sets status to OFFLINE", async () => {
    await telemetryBuffer.recordHeartbeat("agent-3", {
      os: "windows",
      arch: "x64",
      cpuLoad: 0.7,
      ramTotal: 8000,
      ramUsed: 6000,
    });

    await telemetryBuffer.markAgentOffline("agent-3");

    await expect(
      redisConnection.hget("agent:telemetry:agent-3", "status"),
    ).resolves.toBe("OFFLINE");
  });

  it("getActiveAgentIds with a 30-second window returns only recently active agents", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000);
    await telemetryBuffer.recordHeartbeat("old-agent", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.1,
      ramTotal: 1000,
      ramUsed: 500,
    });

    vi.spyOn(Date, "now").mockReturnValueOnce(40000);
    await telemetryBuffer.recordHeartbeat("recent-agent", {
      os: "linux",
      arch: "x64",
      cpuLoad: 0.2,
      ramTotal: 1000,
      ramUsed: 600,
    });

    vi.spyOn(Date, "now").mockReturnValueOnce(40000);
    await expect(telemetryBuffer.getActiveAgentIds(30000)).resolves.toEqual([
      "recent-agent",
    ]);
  });

  it("recordHeartbeat called 1000 times completes in under 100ms", async () => {
    const startedAt = performance.now();

    await Promise.all(
      Array.from({ length: 1000 }, (_, index) =>
        telemetryBuffer.recordHeartbeat(`perf-agent-${index}`, {
          os: "linux",
          arch: "x64",
          cpuLoad: index % 100,
          ramTotal: 16000,
          ramUsed: 8000,
        }),
      ),
    );

    const durationMs = performance.now() - startedAt;
    expect(durationMs).toBeLessThan(100);
  });
});
