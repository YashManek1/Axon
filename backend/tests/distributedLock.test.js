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
  await redisConnection.flushall();
});

describe("distributedLock", () => {
  it("acquireJobLock with a new jobId returns true", async () => {
    await expect(distributedLock.acquireJobLock("job-1")).resolves.toBe(true);
  });

  it("acquireJobLock with an already-locked jobId returns false", async () => {
    await distributedLock.acquireJobLock("job-1");

    await expect(distributedLock.acquireJobLock("job-1")).resolves.toBe(false);
  });

  it("releaseJobLock after acquiring allows re-acquisition", async () => {
    await distributedLock.acquireJobLock("job-1");
    await distributedLock.releaseJobLock("job-1");

    await expect(distributedLock.acquireJobLock("job-1")).resolves.toBe(true);
  });

  it("two concurrent acquireJobLock calls for the same id allow exactly one winner", async () => {
    const results = await Promise.all([
      distributedLock.acquireJobLock("job-1"),
      distributedLock.acquireJobLock("job-1"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(1);
  });
});
