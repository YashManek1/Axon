import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import ExecutionTargetHold from "../models/executionTargetHold.js";
import { buildExecutionResourceKey } from "../services/executionResource.js";
import {
  acquireExecutionTargetHold,
  releaseExecutionTargetHold,
} from "../services/executionTargetHoldService.js";

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

describeRealRedis("real Redis target-resource exclusion", () => {
  let redis;
  let lock;
  let resourceKey;
  let otherResourceKey;
  let shortLeaseResourceKey;
  let durableResourceKey;
  let orgId;

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
    orgId = randomUUID();
    resourceKey = buildExecutionResourceKey({
      orgId,
      targetAgentId: randomUUID(),
      jobId: randomUUID(),
    });
    otherResourceKey = buildExecutionResourceKey({
      orgId,
      targetAgentId: randomUUID(),
      jobId: randomUUID(),
    });
    shortLeaseResourceKey = buildExecutionResourceKey({
      orgId,
      targetAgentId: randomUUID(),
      jobId: randomUUID(),
    });
    durableResourceKey = buildExecutionResourceKey({
      orgId,
      targetAgentId: randomUUID(),
      jobId: randomUUID(),
    });
    await redis.del(
      `job:lock:${resourceKey}`,
      `job:fence:${resourceKey}`,
      `job:lock:${otherResourceKey}`,
      `job:fence:${otherResourceKey}`,
      `job:lock:${shortLeaseResourceKey}`,
      `job:fence:${shortLeaseResourceKey}`,
      `job:lock:${durableResourceKey}`,
      `job:fence:${durableResourceKey}`,
    );
    vi.doMock("../config/queue.js", () => ({ redisConnection: redis }));
    lock = await import("../services/distributedLock.js");
  });

  afterAll(async () => {
    if (redis && resourceKey) {
      await redis.del(
        `job:lock:${resourceKey}`,
        `job:fence:${resourceKey}`,
        `job:lock:${otherResourceKey}`,
        `job:fence:${otherResourceKey}`,
        `job:lock:${shortLeaseResourceKey}`,
        `job:fence:${shortLeaseResourceKey}`,
      );
    }
    redis?.disconnect();
    vi.doUnmock("../config/queue.js");
  });

  it("allows exactly one caller and stores the requested bounded TTL", async () => {
    const results = await Promise.all([
      lock.acquireJobLock(resourceKey, "worker-1", 375),
      lock.acquireJobLock(resourceKey, "worker-2", 375),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);
    expect(await redis.ttl(`job:lock:${resourceKey}`)).toBeGreaterThanOrEqual(370);
  });

  it("retains the same-target reservation while a different target remains available", async () => {
    const sameTarget = await lock.acquireJobLock(resourceKey, "next-run", 375);
    const differentTarget = await lock.acquireJobLock(otherResourceKey, "other-run", 375);
    expect(sameTarget).toMatchObject({ acquired: false });
    expect(differentTarget).toMatchObject({ acquired: true });
  });

  it("allows only the current owner to release a target reservation", async () => {
    expect(await lock.releaseJobLock(otherResourceKey, "wrong-owner")).toBe(0);
    expect(await lock.acquireJobLock(otherResourceKey, "blocked-run", 375))
      .toMatchObject({ acquired: false, existingWorker: "other-run" });
    expect(await lock.releaseJobLock(otherResourceKey, "other-run")).toBe(1);
    expect(await lock.acquireJobLock(otherResourceKey, "replacement-run", 375))
      .toMatchObject({ acquired: true });
  });

  it("keeps an overlapping claimant out until a short lease expires", async () => {
    expect(await lock.acquireJobLock(shortLeaseResourceKey, "short-owner", 1))
      .toMatchObject({ acquired: true });
    expect(await lock.acquireJobLock(shortLeaseResourceKey, "overlap-owner", 1))
      .toMatchObject({ acquired: false, existingWorker: "short-owner" });

    await new Promise((resolve) => setTimeout(resolve, 1_250));

    expect(await lock.acquireJobLock(shortLeaseResourceKey, "after-expiry", 1))
      .toMatchObject({ acquired: true });
  });
  it("keeps a second execution out after the Redis lease expires while the durable hold remains", async () => {
    await ExecutionTargetHold.syncIndexes();
    const organizationId = new mongoose.Types.ObjectId();
    const targetAgentId = new mongoose.Types.ObjectId();
    const originalOwner = {
      organizationId,
      targetAgentId,
      runId: "durable-owner",
      attemptId: "attempt-1",
      fencingToken: 51,
    };
    const secondOwner = {
      organizationId,
      targetAgentId,
      runId: "overlap-owner",
      attemptId: "attempt-2",
      fencingToken: 52,
    };

    expect(await lock.acquireJobLock(durableResourceKey, originalOwner.runId, 1))
      .toMatchObject({ acquired: true });
    expect(await acquireExecutionTargetHold(originalOwner))
      .toMatchObject({ acquired: true });

    await new Promise((resolve) => setTimeout(resolve, 1_250));

    expect(await lock.acquireJobLock(durableResourceKey, secondOwner.runId, 1))
      .toMatchObject({ acquired: true });
    expect(await acquireExecutionTargetHold(secondOwner))
      .toMatchObject({
        acquired: false,
        owner: expect.objectContaining({
          runId: originalOwner.runId,
          attemptId: originalOwner.attemptId,
          fencingToken: originalOwner.fencingToken,
        }),
      });

    expect(await releaseExecutionTargetHold(originalOwner, "COMPLETED"))
      .toMatchObject({ released: true });
  });

});
