import mongoose from "mongoose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let mockRedis;
let acquireJobLock;
let releaseJobLock;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  mockRedis = new Redis();

  vi.doMock("../config/queue.js", () => ({ redisConnection: mockRedis }));

  const lock = await import("../services/distributedLock.js");
  acquireJobLock = lock.acquireJobLock;
  releaseJobLock = lock.releaseJobLock;
});

beforeEach(async () => {
  await mockRedis.flushall();
});

// ── Idempotent sink behaviour ──────────────────────────────────────────────

describe("idempotent mongo sink (fencing token upsert)", () => {
  it("upserting with the same fencingToken twice creates exactly one document", async () => {
    const col = mongoose.connection.collection("fencing_sink_test");
    const jobId = new mongoose.Types.ObjectId().toString();
    const fencingToken = 1;
    const doc = { jobId, fencingToken, orgId: "org-1", executedAt: new Date(), formats: { json: {} } };

    await col.updateOne({ jobId, fencingToken }, { $setOnInsert: doc }, { upsert: true });
    await col.updateOne({ jobId, fencingToken }, { $setOnInsert: doc }, { upsert: true });

    const count = await col.countDocuments({ jobId, fencingToken });
    expect(count).toBe(1);
  });

  it("upserting with a stale (lower) fencingToken after a newer one is a no-op for that token", async () => {
    const col = mongoose.connection.collection("fencing_sink_test");
    const jobId = new mongoose.Types.ObjectId().toString();

    // First delivery — token 1
    const doc1 = { jobId, fencingToken: 1, orgId: "org-1", executedAt: new Date(), formats: { json: { run: 1 } } };
    await col.updateOne({ jobId, fencingToken: 1 }, { $setOnInsert: doc1 }, { upsert: true });

    // Second delivery — token 2 (re-queued job, new fencingToken)
    const doc2 = { jobId, fencingToken: 2, orgId: "org-1", executedAt: new Date(), formats: { json: { run: 2 } } };
    await col.updateOne({ jobId, fencingToken: 2 }, { $setOnInsert: doc2 }, { upsert: true });

    // Replay of first delivery — same token 1 — must be a no-op
    await col.updateOne({ jobId, fencingToken: 1 }, { $setOnInsert: doc1 }, { upsert: true });

    const docs = await col.find({ jobId }).toArray();
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.fencingToken).sort()).toEqual([1, 2]);
  });

  it("different jobIds with the same fencingToken create separate documents", async () => {
    const col = mongoose.connection.collection("fencing_sink_test");
    const jobA = new mongoose.Types.ObjectId().toString();
    const jobB = new mongoose.Types.ObjectId().toString();
    const fencingToken = 1;

    for (const jobId of [jobA, jobB]) {
      const doc = { jobId, fencingToken, orgId: "org-1", executedAt: new Date(), formats: {} };
      await col.updateOne({ jobId, fencingToken }, { $setOnInsert: doc }, { upsert: true });
    }

    expect(await col.countDocuments({ fencingToken })).toBe(2);
  });
});

// ── Lock contention and safe release ──────────────────────────────────────

describe("acquireJobLock contention", () => {
  it("concurrent acquires for the same jobId produce exactly one winner", async () => {
    const results = await Promise.all(
      ["w-1", "w-2", "w-3"].map((w) => acquireJobLock("job-contention", w)),
    );

    const winners = results.filter((r) => r.acquired);
    const losers = results.filter((r) => !r.acquired);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(2);
    expect(winners[0].fencingToken).toBeGreaterThanOrEqual(1);
    losers.forEach((l) => expect(l.fencingToken).toBeNull());
  });

  it("fencingToken is monotonically increasing across sequential acquisitions", async () => {
    const tokens = [];
    for (let i = 0; i < 3; i++) {
      const workerId = `worker-${i}`;
      const { fencingToken } = await acquireJobLock("job-mono", workerId);
      tokens.push(fencingToken);
      await releaseJobLock("job-mono", workerId);
    }

    expect(tokens).toEqual([1, 2, 3]);
  });
});
