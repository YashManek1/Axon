import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let redisConnection;
let distributedLock;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  redisConnection = new Redis();

  vi.doMock("../config/queue.js", () => ({
    redisConnection,
  }));

  distributedLock = await import("../services/distributedLock.js");
});

beforeEach(async () => {
  await redisConnection.flushdb();
});

describe("distributedLock", () => {
  it("acquireJobLock with a new jobId returns acquired:true and a numeric fencingToken", async () => {
    const result = await distributedLock.acquireJobLock("job-1", "worker-1");

    expect(result).toMatchObject({ acquired: true, existingWorker: null });
    expect(typeof result.fencingToken).toBe("number");
    expect(result.fencingToken).toBeGreaterThanOrEqual(1);
  });

  it("acquireJobLock increments the fencingToken on each new acquisition", async () => {
    const r1 = await distributedLock.acquireJobLock("job-1", "worker-1");
    await distributedLock.releaseJobLock("job-1", "worker-1");
    const r2 = await distributedLock.acquireJobLock("job-1", "worker-2");

    expect(r2.fencingToken).toBe(r1.fencingToken + 1);
  });

  it("acquireJobLock when already held returns acquired:false and existingWorker", async () => {
    await distributedLock.acquireJobLock("job-1", "worker-1");

    const result = await distributedLock.acquireJobLock("job-1", "worker-2");

    expect(result).toMatchObject({ acquired: false, fencingToken: null });
    expect(result.existingWorker).toBe("worker-1");
  });

  it("releaseJobLock with correct workerId releases the lock", async () => {
    await distributedLock.acquireJobLock("job-1", "worker-1");
    await distributedLock.releaseJobLock("job-1", "worker-1");

    const reacquire = await distributedLock.acquireJobLock("job-1", "worker-2");
    expect(reacquire.acquired).toBe(true);
  });

  it("releaseJobLock with wrong workerId is a no-op and returns 0", async () => {
    await distributedLock.acquireJobLock("job-1", "worker-correct");

    const releaseResult = await distributedLock.releaseJobLock("job-1", "worker-wrong");

    expect(releaseResult).toBe(0);

    // Lock must still be held — another acquire should fail
    const attempt = await distributedLock.acquireJobLock("job-1", "worker-other");
    expect(attempt.acquired).toBe(false);
  });

  it("two concurrent acquireJobLock calls allow exactly one winner", async () => {
    const results = await Promise.all([
      distributedLock.acquireJobLock("job-1", "worker-1"),
      distributedLock.acquireJobLock("job-1", "worker-2"),
    ]);

    const winners = results.filter((r) => r.acquired);
    const losers = results.filter((r) => !r.acquired);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(typeof winners[0].fencingToken).toBe("number");
    expect(losers[0].fencingToken).toBeNull();
  });
});
