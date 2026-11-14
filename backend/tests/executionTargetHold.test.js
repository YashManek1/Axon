import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import ExecutionTargetHold from "../models/executionTargetHold.js";
import JobRun from "../models/jobRun.js";
import {
  acquireExecutionTargetHold,
  releaseExecutionTargetHold,
  releaseProofAuthorizedExecutionTargetHold,
  releaseQuiescenceAuthorizedExecutionTargetHold,
} from "../services/executionTargetHoldService.js";

const owner = (overrides = {}) => ({
  organizationId: new mongoose.Types.ObjectId(),
  targetAgentId: new mongoose.Types.ObjectId(),
  runId: "run-1",
  attemptId: "attempt-1",
  fencingToken: 1,
  ...overrides,
});

async function createProofAuthorizedHold({ inconsistentPriorTransition = false } = {}) {
  const organizationId = new mongoose.Types.ObjectId();
  const targetAgentId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const attemptId = randomUUID();
  const runId = randomUUID();
  const proofId = randomUUID();
  const resolutionId = randomUUID();
  const acceptedAt = new Date("2026-10-09T08:00:00.000Z");
  const proofAt = new Date("2026-10-09T08:01:00.000Z");
  const currentOwner = owner({
    organizationId,
    targetAgentId,
    runId,
    attemptId,
    fencingToken: 42,
  });

  await JobRun.create({
    runId,
    orgId: organizationId,
    jobId: new mongoose.Types.ObjectId(),
    targetAgentId,
    targetSocketId: "stale-socket",
    queueJobId: attemptId,
    requestFingerprint: "proof-release-test",
    reconciliationSafetyVersion: 1,
    nonDispatchProof: {
      version: 1,
      proofId,
      attemptId,
      targetAgentId,
      fromTransitionSequence: 1,
      terminalTransitionSequence: 2,
      recordedAt: proofAt,
    },
    operatorResolution: {
      version: 1,
      resolutionId,
      requestFingerprint: "a".repeat(64),
      actorId,
      actorRole: "operator",
      recordedAt: new Date("2026-10-09T08:02:00.000Z"),
      proofId,
      terminalTransitionSequence: 2,
      purpose: "RELEASE_NEVER_DISPATCHED",
      reason: "Operator verified that dispatch never started.",
    },
    triggeredBy: { userId: actorId },
    action: {
      actionVersion: "action-v1",
      command: "systemctl status axon-demo",
      allowedCommands: ["systemctl status axon-demo"],
      timeoutMs: 10_000,
      startBefore: 1_900_000_000_000,
      maxOutputBytes: 4_096,
    },
    status: "UNKNOWN",
    reasonCode: "TARGET_DISCONNECTED",
    transitionSequence: 2,
    transitions: [
      {
        sequence: 1,
        from: null,
        to: inconsistentPriorTransition ? "QUEUED" : "ACCEPTED",
        at: acceptedAt,
        source: "API",
        attemptId,
      },
      {
        sequence: 2,
        from: "ACCEPTED",
        to: "UNKNOWN",
        at: proofAt,
        source: "RECOVERY",
        attemptId,
      },
    ],
    attempts: [{
      attemptId,
      targetExecutionId: randomUUID(),
      operationId: randomUUID(),
      sequence: 1,
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      reasonCode: "TARGET_DISCONNECTED",
    }],
  });
  await acquireExecutionTargetHold(currentOwner);
  return { currentOwner, proofId, resolutionId };
}

async function createQuiescenceAuthorizedHold() {
  const organizationId = new mongoose.Types.ObjectId();
  const targetAgentId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const attemptId = randomUUID();
  const runId = randomUUID();
  const resolutionId = randomUUID();
  const certificateHash = "b".repeat(64);
  const currentOwner = owner({
    organizationId,
    targetAgentId,
    runId,
    attemptId,
    fencingToken: 73,
  });
  await JobRun.create({
    runId,
    orgId: organizationId,
    jobId: new mongoose.Types.ObjectId(),
    targetAgentId,
    targetSocketId: "stale-dispatched-socket",
    queueJobId: attemptId,
    requestFingerprint: "legacy-quiescence-release-test",
    reconciliationSafetyVersion: 1,
    operatorResolution: {
      version: 1,
      resolutionId,
      requestFingerprint: "c".repeat(64),
      actorId,
      actorRole: "operator",
      recordedAt: new Date("2026-10-09T08:02:00.000Z"),
      proofId: resolutionId,
      terminalTransitionSequence: 3,
      purpose: "RELEASE_DISPATCHED_QUIESCENT",
      reason: "Legacy certificate was previously accepted.",
      certificateHash,
    },
    triggeredBy: { userId: actorId },
    action: {
      actionVersion: "action-v1",
      command: "systemctl status axon-demo",
      allowedCommands: ["systemctl status axon-demo"],
      timeoutMs: 10_000,
      startBefore: 1_900_000_000_000,
      maxOutputBytes: 4_096,
    },
    status: "UNKNOWN",
    reasonCode: "AGENT_CRASH_SUSPECTED",
    transitionSequence: 3,
    transitions: [
      {
        sequence: 1,
        from: null,
        to: "ACCEPTED",
        at: new Date("2026-10-09T08:00:00.000Z"),
        source: "API",
        attemptId,
      },
      {
        sequence: 2,
        from: "ACCEPTED",
        to: "DISPATCHING",
        at: new Date("2026-10-09T08:00:30.000Z"),
        source: "WORKER",
        attemptId,
      },
      {
        sequence: 3,
        from: "DISPATCHING",
        to: "UNKNOWN",
        at: new Date("2026-10-09T08:01:00.000Z"),
        source: "RECOVERY",
        attemptId,
      },
    ],
    attempts: [{
      attemptId,
      targetExecutionId: randomUUID(),
      operationId: randomUUID(),
      sequence: 1,
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      dispatchedGeneration: 1,
      dispatchedAt: new Date("2026-10-09T08:00:30.000Z"),
      acknowledgedAt: new Date("2026-10-09T08:00:40.000Z"),
      reasonCode: "AGENT_CRASH_SUSPECTED",
    }],
  });
  await acquireExecutionTargetHold(currentOwner);
  return { currentOwner, resolutionId, certificateHash };
}

describe("execution target hold", () => {
  beforeAll(async () => {
    await ExecutionTargetHold.syncIndexes();
  });

  afterEach(() => {
    delete process.env.AXON_OPERATOR_RESOLUTION_ENABLED;
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

  it("retains a matching legacy quiescence intent before any database operation", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createQuiescenceAuthorizedHold();
    const findRun = vi.spyOn(JobRun, "findOne");
    const deleteHold = vi.spyOn(ExecutionTargetHold, "deleteOne");

    try {
      await expect(releaseQuiescenceAuthorizedExecutionTargetHold({
        owner: fixture.currentOwner,
        certificateHash: fixture.certificateHash,
        resolutionId: fixture.resolutionId,
      })).resolves.toEqual({ released: false, retained: true, authorized: false });
      expect(findRun).not.toHaveBeenCalled();
      expect(deleteHold).not.toHaveBeenCalled();
      expect(await ExecutionTargetHold.countDocuments(fixture.currentOwner)).toBe(1);
    } finally {
      findRun.mockRestore();
      deleteHold.mockRestore();
    }
  });

  it("retains a proof-authorized hold when operator resolution is disabled", async () => {
    const fixture = await createProofAuthorizedHold();

    await expect(releaseProofAuthorizedExecutionTargetHold({
      owner: fixture.currentOwner,
      proofId: fixture.proofId,
      resolutionId: fixture.resolutionId,
    })).resolves.toEqual({ released: false, retained: true, authorized: false });
    expect(await ExecutionTargetHold.countDocuments(fixture.currentOwner)).toBe(1);
  });

  it("retains a hold when the proof transition chain is inconsistent", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofAuthorizedHold({ inconsistentPriorTransition: true });

    await expect(releaseProofAuthorizedExecutionTargetHold({
      owner: fixture.currentOwner,
      proofId: fixture.proofId,
      resolutionId: fixture.resolutionId,
    })).resolves.toEqual({ released: false, retained: true, authorized: false });
    expect(await ExecutionTargetHold.countDocuments(fixture.currentOwner)).toBe(1);
  });

  it("releases a valid proof-authorized hold but cannot delete a replacement owner", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofAuthorizedHold();

    await expect(releaseProofAuthorizedExecutionTargetHold({
      owner: fixture.currentOwner,
      proofId: fixture.proofId,
      resolutionId: fixture.resolutionId,
    })).resolves.toEqual({ released: true, retained: false, authorized: true });

    const replacement = owner({
      organizationId: fixture.currentOwner.organizationId,
      targetAgentId: fixture.currentOwner.targetAgentId,
      runId: randomUUID(),
      attemptId: randomUUID(),
      fencingToken: fixture.currentOwner.fencingToken + 1,
    });
    await acquireExecutionTargetHold(replacement);

    await expect(releaseProofAuthorizedExecutionTargetHold({
      owner: fixture.currentOwner,
      proofId: fixture.proofId,
      resolutionId: fixture.resolutionId,
    })).resolves.toEqual({ released: false, retained: true, authorized: true });
    await expect(ExecutionTargetHold.findOne({
      organizationId: replacement.organizationId,
      targetAgentId: replacement.targetAgentId,
    }).lean()).resolves.toMatchObject(replacement);
  });

  it("fences a same-attempt replacement installed at the exact delete boundary", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofAuthorizedHold();
    const runBeforeRelease = await JobRun.findOne({
      orgId: fixture.currentOwner.organizationId,
      runId: fixture.currentOwner.runId,
    }).lean();
    const replacement = {
      ...fixture.currentOwner,
      fencingToken: fixture.currentOwner.fencingToken + 1,
    };
    const originalDeleteOne = ExecutionTargetHold.deleteOne.bind(ExecutionTargetHold);
    let installReplacementAtDeleteBoundary = true;
    const deleteOne = vi.spyOn(ExecutionTargetHold, "deleteOne")
      .mockImplementation(async (filter, ...args) => {
        if (installReplacementAtDeleteBoundary) {
          installReplacementAtDeleteBoundary = false;
          await originalDeleteOne(fixture.currentOwner);
          await acquireExecutionTargetHold(replacement);
        }
        return originalDeleteOne(filter, ...args);
      });

    try {
      await expect(releaseProofAuthorizedExecutionTargetHold({
        owner: fixture.currentOwner,
        proofId: fixture.proofId,
        resolutionId: fixture.resolutionId,
      })).resolves.toEqual({ released: false, retained: true, authorized: true });
    } finally {
      deleteOne.mockRestore();
    }

    await expect(ExecutionTargetHold.findOne({
      organizationId: replacement.organizationId,
      targetAgentId: replacement.targetAgentId,
    }).lean()).resolves.toMatchObject(replacement);

    await expect(releaseProofAuthorizedExecutionTargetHold({
      owner: replacement,
      proofId: fixture.proofId,
      resolutionId: fixture.resolutionId,
    })).resolves.toEqual({ released: true, retained: false, authorized: true });
    expect(await ExecutionTargetHold.countDocuments({
      organizationId: replacement.organizationId,
      targetAgentId: replacement.targetAgentId,
    })).toBe(0);

    const runAfterRelease = await JobRun.findOne({
      orgId: fixture.currentOwner.organizationId,
      runId: fixture.currentOwner.runId,
    }).lean();
    expect(runAfterRelease).toMatchObject({
      status: runBeforeRelease.status,
      reasonCode: runBeforeRelease.reasonCode,
      transitionSequence: runBeforeRelease.transitionSequence,
      transitions: runBeforeRelease.transitions,
      attempts: runBeforeRelease.attempts,
      nonDispatchProof: runBeforeRelease.nonDispatchProof,
      operatorResolution: runBeforeRelease.operatorResolution,
    });
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
