import mongoose from "mongoose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import ExecutionTargetHold from "../models/executionTargetHold.js";
import {
  acquireExecutionTargetHold,
  releaseExecutionTargetHold,
} from "../services/executionTargetHoldService.js";

const owner = (overrides = {}) => ({
  organizationId: new mongoose.Types.ObjectId(),
  targetAgentId: new mongoose.Types.ObjectId(),
  runId: "run-1",
  attemptId: "attempt-1",
  fencingToken: 1,
  ...overrides,
});

describe("execution target hold", () => {
  beforeAll(async () => {
    await ExecutionTargetHold.syncIndexes();
  });

  it("fails closed before insert when the unique index is unavailable", async () => {
    const currentOwner = owner();
    const indexes = vi.spyOn(ExecutionTargetHold.collection, "indexes")
      .mockResolvedValue([{ name: "_id_", key: { _id: 1 } }]);
    try {
      await expect(acquireExecutionTargetHold(currentOwner)).rejects.toThrow(
        "Execution target unique index is not ready",
      );
      expect(await ExecutionTargetHold.countDocuments({})).toBe(0);
    } finally {
      indexes.mockRestore();
    }
  });

  it("waits for index readiness before creating a hold", async () => {
    const currentOwner = owner();
    const realIndexes = await ExecutionTargetHold.collection.indexes();
    let resolveIndexes;
    const indexes = vi.spyOn(ExecutionTargetHold.collection, "indexes")
      .mockImplementation(() => new Promise((resolve) => { resolveIndexes = resolve; }));
    try {
      const acquisition = acquireExecutionTargetHold(currentOwner);
      await vi.waitFor(() => expect(resolveIndexes).toBeTypeOf("function"));
      expect(await ExecutionTargetHold.countDocuments({})).toBe(0);
      resolveIndexes(realIndexes);
      await expect(acquisition).resolves.toMatchObject({ acquired: true });
    } finally {
      indexes.mockRestore();
    }
  });
  it("admits exactly one owner for concurrent acquisition of the same organization target", async () => {
    const first = owner();
    const second = owner({
      organizationId: first.organizationId,
      targetAgentId: first.targetAgentId,
      runId: "run-2",
      attemptId: "attempt-2",
      fencingToken: 2,
    });

    const results = await Promise.all([
      acquireExecutionTargetHold(first),
      acquireExecutionTargetHold(second),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);
    expect(await ExecutionTargetHold.countDocuments({})).toBe(1);
  });

  it("isolates holds by both organization and target", async () => {
    const first = owner();
    const sameTargetDifferentOrg = owner({
      targetAgentId: first.targetAgentId,
      runId: "run-2",
      attemptId: "attempt-2",
      fencingToken: 2,
    });
    const sameOrgDifferentTarget = owner({
      organizationId: first.organizationId,
      runId: "run-3",
      attemptId: "attempt-3",
      fencingToken: 3,
    });

    await expect(acquireExecutionTargetHold(first)).resolves.toMatchObject({ acquired: true });
    await expect(acquireExecutionTargetHold(sameTargetDifferentOrg)).resolves.toMatchObject({
      acquired: true,
    });
    await expect(acquireExecutionTargetHold(sameOrgDifferentTarget)).resolves.toMatchObject({
      acquired: true,
    });
    expect(await ExecutionTargetHold.countDocuments({})).toBe(3);
  });

  it("releases only when the complete owner identity matches", async () => {
    const currentOwner = owner();
    await acquireExecutionTargetHold(currentOwner);

    await expect(
      releaseExecutionTargetHold(
        { ...currentOwner, fencingToken: currentOwner.fencingToken + 1 },
        "COMPLETED",
      ),
    ).resolves.toMatchObject({ released: false });
    expect(await ExecutionTargetHold.countDocuments({})).toBe(1);

    await expect(releaseExecutionTargetHold(currentOwner, "COMPLETED")).resolves.toMatchObject({
      released: true,
    });
    expect(await ExecutionTargetHold.countDocuments({})).toBe(0);
  });

  it("does not let a stale owner release a newer hold", async () => {
    const staleOwner = owner();
    await acquireExecutionTargetHold(staleOwner);
    await releaseExecutionTargetHold(staleOwner, "COMPLETED");

    const newerOwner = {
      ...staleOwner,
      runId: "run-2",
      attemptId: "attempt-2",
      fencingToken: 2,
    };
    await acquireExecutionTargetHold(newerOwner);

    await expect(releaseExecutionTargetHold(staleOwner, "COMPLETED")).resolves.toMatchObject({
      released: false,
    });
    await expect(
      ExecutionTargetHold.findOne({ organizationId: staleOwner.organizationId }).lean(),
    ).resolves.toMatchObject({
      runId: newerOwner.runId,
      attemptId: newerOwner.attemptId,
      fencingToken: newerOwner.fencingToken,
    });
  });

  it("retains ownership for UNKNOWN outcomes", async () => {
    const currentOwner = owner();
    await acquireExecutionTargetHold(currentOwner);

    await expect(releaseExecutionTargetHold(currentOwner, "UNKNOWN")).resolves.toMatchObject({
      released: false,
      retained: true,
    });
    expect(await ExecutionTargetHold.countDocuments({})).toBe(1);
  });

  it("defines one unique compound index and no TTL index", async () => {
    const indexes = await ExecutionTargetHold.collection.indexes();
    const targetIndex = indexes.find(
      (index) => index.key.organizationId === 1 && index.key.targetAgentId === 1,
    );

    expect(targetIndex).toMatchObject({ unique: true });
    expect(indexes.every((index) => index.expireAfterSeconds === undefined)).toBe(true);
  });
});
