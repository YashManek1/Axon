import { randomUUID } from "crypto";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/queue.js", () => ({
  scheduledJobsQueue: { add: vi.fn(), removeRepeatable: vi.fn() },
  immediateJobsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  redisConnection: { set: vi.fn().mockResolvedValue("OK") },
}));

import { immediateJobsQueue, redisConnection, scheduledJobsQueue } from "../config/queue.js";
import { signSessionToken } from "../controllers/userC.js";
import Agent from "../models/agent.js";
import ExecutionTargetHold from "../models/executionTargetHold.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import jobRoutes from "../routes/jobR.js";
import {
  buildQueueData,
  claimRunForDispatch,
  createApprovedShellRun,
  markRunUnknown,
} from "../services/jobRunService.js";
import { resolveDispatchedQuiescentRun } from "../services/jobRunReconciliationService.js";
import { createJobRunPreview } from "../services/jobRunPreviewService.js";

const app = express();
app.use(express.json());
app.use("/jobs", jobRoutes);

let org;
let operator;
let secondOperator;
let viewer;
let legacyUser;
let agent;
let job;

function authHeader(user) {
  return `Bearer ${signSessionToken(user)}`;
}

async function createUser(role) {
  const suffix = `${role}-${Date.now()}-${Math.random()}`;
  return User.create({
    username: suffix,
    email: `${suffix}@test.example`,
    password: "hashed",
    role,
    orgId: org._id,
  });
}

async function createProofRun({ owner = operator } = {}) {
  const runId = randomUUID();
  const attemptId = randomUUID();
  const proofId = randomUUID();
  const acceptedAt = new Date("2026-10-09T08:00:00.000Z");
  const proofAt = new Date("2026-10-09T08:01:00.000Z");
  const run = await JobRun.create({
    runId,
    orgId: org._id,
    jobId: job._id,
    targetAgentId: agent._id,
    targetSocketId: "stale-socket",
    queueJobId: attemptId,
    requestKey: randomUUID(),
    requestFingerprint: "prospective-run-fingerprint",
    reconciliationSafetyVersion: 1,
    nonDispatchProof: {
      version: 1,
      proofId,
      attemptId,
      targetAgentId: agent._id,
      fromTransitionSequence: 1,
      terminalTransitionSequence: 2,
      recordedAt: proofAt,
    },
    triggeredBy: {
      userId: owner._id,
      ipAddress: "127.0.0.1",
      userAgent: "reconciliation-test",
    },
    action: {
      actionVersion: "action-v1",
      command: "echo fixture",
      allowedCommands: ["echo fixture"],
      timeoutMs: 30_000,
      startBefore: proofAt.getTime() + 60_000,
      maxOutputBytes: 65_536,
    },
    status: "UNKNOWN",
    requiresReview: true,
    reasonCode: "QUEUE_STATE_UNVERIFIABLE",
    completedAt: proofAt,
    transitionSequence: 2,
    transitions: [
      {
        sequence: 1,
        from: null,
        to: "ACCEPTED",
        at: acceptedAt,
        reasonCode: "RUN_ACCEPTED",
        source: "API",
        attemptId,
      },
      {
        sequence: 2,
        from: "ACCEPTED",
        to: "UNKNOWN",
        at: proofAt,
        reasonCode: "QUEUE_STATE_UNVERIFIABLE",
        source: "RECOVERY",
        attemptId,
      },
    ],
    terminalSummary: {
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      exitCode: null,
      reasonCode: "QUEUE_STATE_UNVERIFIABLE",
      completedAt: proofAt,
    },
    attempts: [
      {
        attemptId,
        targetExecutionId: randomUUID(),
        operationId: randomUUID(),
        sequence: 1,
        status: "UNKNOWN",
        outcome: "UNKNOWN",
        reasonCode: "QUEUE_STATE_UNVERIFIABLE",
        completedAt: proofAt,
      },
    ],
  });
  const hold = await ExecutionTargetHold.create({
    organizationId: org._id,
    targetAgentId: agent._id,
    runId,
    attemptId,
    fencingToken: 41,
  });
  return { run, hold, runId, attemptId, proofId };
}

async function createDispatchedUnknownRun() {
  const runId = randomUUID();
  const attemptId = randomUUID();
  const completedAt = new Date();
  await Agent.updateOne(
    { _id: agent._id },
    { $set: { connectionGeneration: 2 } },
  );
  const run = await JobRun.create({
    runId,
    orgId: org._id,
    jobId: job._id,
    targetAgentId: agent._id,
    targetSocketId: "reconnected-socket",
    queueJobId: attemptId,
    requestKey: randomUUID(),
    requestFingerprint: "dispatched-run-fingerprint",
    reconciliationSafetyVersion: 1,
    triggeredBy: {
      userId: operator._id,
      ipAddress: "127.0.0.1",
      userAgent: "quiescence-test",
    },
    action: {
      actionVersion: "action-v1",
      command: "echo test",
      allowedCommands: ["echo test"],
      timeoutMs: 30_000,
      startBefore: Date.now() + 60_000,
      maxOutputBytes: 65_536,
    },
    status: "UNKNOWN",
    requiresReview: true,
    reasonCode: "AGENT_CRASH_SUSPECTED",
    completedAt,
    transitionSequence: 3,
    transitions: [
      {
        sequence: 1,
        from: null,
        to: "ACCEPTED",
        at: new Date(Date.now() - 70_000),
        reasonCode: "RUN_ACCEPTED",
        source: "API",
        attemptId,
      },
      {
        sequence: 2,
        from: "ACCEPTED",
        to: "DISPATCHING",
        at: new Date(Date.now() - 60_000),
        reasonCode: "DISPATCH_STARTED",
        source: "WORKER",
        attemptId,
      },
      {
        sequence: 3,
        from: "DISPATCHING",
        to: "UNKNOWN",
        at: completedAt,
        reasonCode: "AGENT_CRASH_SUSPECTED",
        source: "RECOVERY",
        attemptId,
      },
    ],
    attempts: [
      {
        attemptId,
        targetExecutionId: randomUUID(),
        operationId: randomUUID(),
        sequence: 1,
        status: "UNKNOWN",
        outcome: "UNKNOWN",
        dispatchedGeneration: 1,
        dispatchedAt: new Date(Date.now() - 60_000),
        acknowledgedAt: new Date(Date.now() - 55_000),
        reasonCode: "AGENT_CRASH_SUSPECTED",
        completedAt,
      },
    ],
  });
  const hold = await ExecutionTargetHold.create({
    organizationId: org._id,
    targetAgentId: agent._id,
    runId,
    attemptId,
    fencingToken: 10,
  });
  const certificate = {
    version: 1,
    attemptId,
    targetAgentId: String(agent._id),
    processDeadConfirmed: true,
    journalTerminalConfirmed: true,
    generation: 2,
    verifiedAt: new Date().toISOString(),
  };
  return { run, hold, runId, attemptId, certificate };
}

function reconciliationPath(runId) {
  return `/jobs/${job._id}/runs/${runId}/reconciliation`;
}

function mutationBody(proofId) {
  return {
    proofId,
    expectedTransitionSequence: 2,
    reason: "Confirmed the prospective run was never dispatched",
  };
}

beforeEach(async () => {
  delete process.env.AXON_OPERATOR_RESOLUTION_ENABLED;
  await ExecutionTargetHold.syncIndexes();
  const suffix = `${Date.now()}-${Math.random()}`;
  org = await Organization.create({
    name: `resolution-org-${suffix}`,
    description: "isolated operator reconciliation test",
  });
  operator = await createUser("operator");
  secondOperator = await createUser("operator");
  viewer = await createUser("viewer");
  legacyUser = await createUser("user");
  agent = await Agent.create({
    name: `resolution-agent-${suffix}`,
    hardwareUuid: `resolution-hardware-${suffix}`,
    apiKey: `resolution-secret-${suffix}`,
    orgId: org._id,
    status: "offline",
    allowedCommands: ["echo fixture"],
  });
  job = await Job.create({
    userId: operator._id,
    orgId: org._id,
    name: `resolution-job-${suffix}`,
    type: "shell",
    schedule: "*/5 * * * *",
    payload: { command: "echo fixture" },
    targetAgentId: agent._id,
    permissions: { allowedUsers: [], allowedRoles: [] },
  });
});

afterEach(() => {
  delete process.env.AXON_OPERATOR_RESOLUTION_ENABLED;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prospective never-dispatched reconciliation", () => {
  it("keeps a minted proof resolvable when successive Date constructions differ", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    await Agent.updateOne(
      { _id: agent._id },
      { $set: { status: "online", socketId: "prospective-socket" } },
    );
    const preview = await createJobRunPreview({
      orgId: org._id,
      actorId: operator._id,
      jobId: job._id,
      now: 1_900_000_000_000,
    });
    const created = await createApprovedShellRun({
      orgId: org._id,
      userId: operator._id,
      jobId: job._id,
      requestKey: randomUUID(),
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      ipAddress: "127.0.0.1",
      userAgent: "successive-date-reconciliation-test",
      now: 1_900_000_001_000,
    });
    const queueData = buildQueueData(created.run, job, agent);
    await ExecutionTargetHold.create({
      organizationId: org._id,
      targetAgentId: agent._id,
      runId: created.run.runId,
      attemptId: queueData.attemptId,
      fencingToken: 42,
    });

    const RealDate = Date;
    const constructedTimes = [];
    let nextTime = RealDate.parse("2026-10-09T09:00:00.000Z");
    class SuccessiveDate extends RealDate {
      constructor(...args) {
        if (args.length) {
          super(...args);
        } else {
          const constructedAt = nextTime;
          nextTime += 1;
          super(constructedAt);
          constructedTimes.push(constructedAt);
        }
      }
    }
    vi.stubGlobal("Date", SuccessiveDate);
    let recovered;
    try {
      recovered = await markRunUnknown(created.run.runId, "TARGET_DISCONNECTED", ["ACCEPTED"]);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(new Set(constructedTimes).size).toBeGreaterThan(1);
    expect(recovered.nonDispatchProof.recordedAt.getTime()).toBe(
      recovered.transitions.at(-1).at.getTime(),
    );
    expect(await claimRunForDispatch(queueData)).toMatchObject({ claimed: false });
    await Agent.updateOne({ _id: agent._id }, { $set: { status: "offline", socketId: null } });

    const response = await request(app)
      .post(reconciliationPath(created.run.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(recovered.nonDispatchProof.proofId));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      runId: created.run.runId,
      releaseIntentRecorded: true,
      targetAvailability: "NOT_ESTABLISHED",
    });
    expect(await ExecutionTargetHold.countDocuments({ runId: created.run.runId })).toBe(0);
  });

  it("is default-off and never mutates the run, hold, or queues", async () => {
    const fixture = await createProofRun();
    const before = await JobRun.findOne({ runId: fixture.runId }).lean();

    const read = await request(app)
      .get(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator));
    expect(read.status).toBe(200);
    expect(read.headers["cache-control"]).toContain("no-store");
    expect(read.body).toMatchObject({
      runId: fixture.runId,
      eligible: false,
      blockedReason: "FEATURE_DISABLED",
      originalHoldObservation: "PRESENT",
    });

    const write = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));
    expect(write.status).toBe(409);
    expect(write.body.error).toBe("FEATURE_DISABLED");
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    const after = await JobRun.findOne({ runId: fixture.runId }).lean();
    expect(after.operatorResolution).toBeUndefined();
    expect(after.transitions).toEqual(before.transitions);
    expect(after.attempts).toEqual(before.attempts);
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("records one immutable intent, releases the exact offline-target hold, and replays", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const resolutionId = randomUUID();
    const body = mutationBody(fixture.proofId);

    const first = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      resolutionId,
      runId: fixture.runId,
      status: "UNKNOWN",
      releaseIntentRecorded: true,
      originalHoldObservation: "ABSENT",
      targetAvailability: "NOT_ESTABLISHED",
    });
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(0);
    const persisted = await JobRun.findOne({ runId: fixture.runId }).lean();
    expect(persisted.status).toBe("UNKNOWN");
    expect(persisted.transitionSequence).toBe(2);
    expect(persisted.transitions).toHaveLength(2);
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.operatorResolution).toMatchObject({
      version: 1,
      resolutionId,
      actorRole: "operator",
      proofId: fixture.proofId,
      purpose: "RELEASE_NEVER_DISPATCHED",
      reason: body.reason,
    });

    const replay = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("rejects extra body fields and malformed idempotency keys", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const extra = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send({ ...mutationBody(fixture.proofId), retry: true });
    expect(extra.status).toBe(400);

    const malformed = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", "not-a-uuid")
      .send(mutationBody(fixture.proofId));
    expect(malformed.status).toBe(400);
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
  });

  it("allows viewer reads but explicitly denies viewer and legacy-user mutation", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const read = await request(app)
      .get(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(viewer));
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ eligible: false, blockedReason: "READ_ONLY_ACTOR" });

    for (const actor of [viewer, legacyUser]) {
      const write = await request(app)
        .post(reconciliationPath(fixture.runId))
        .set("Authorization", authHeader(actor))
        .set("Idempotency-Key", randomUUID())
        .send(mutationBody(fixture.proofId));
      expect(write.status).toBe(403);
    }
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    expect((await JobRun.findOne({ runId: fixture.runId }).lean()).operatorResolution).toBeUndefined();
  });

  it("fails closed if the actor role degrades after intent but before deletion", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const resolutionId = randomUUID();
    const originalFindOne = User.findOne.bind(User);
    let serviceAuthorizationReads = 0;
    vi.spyOn(User, "findOne").mockImplementation((...args) => {
      serviceAuthorizationReads += 1;
      const query = originalFindOne(...args);
      if (serviceAuthorizationReads === 4) {
        const originalLean = query.lean.bind(query);
        query.lean = async () => {
          await User.collection.updateOne({ _id: operator._id }, { $set: { role: "viewer" } });
          return originalLean();
        };
      }
      return query;
    });

    const response = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send(mutationBody(fixture.proofId));
    expect(response.status).toBe(403);
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    const persisted = await JobRun.findOne({ runId: fixture.runId }).lean();
    expect(persisted.operatorResolution?.purpose).toBe("RELEASE_NEVER_DISPATCHED");

    const revokedReplay = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send(mutationBody(fixture.proofId));
    expect(revokedReplay.status).toBe(403);
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("converges exact same-actor replays and rejects a competing actor", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const resolutionId = randomUUID();
    const body = mutationBody(fixture.proofId);
    const send = (actor) => request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(actor))
      .set("Idempotency-Key", resolutionId)
      .send(body);

    const sameActor = await Promise.all([send(operator), send(operator)]);
    expect(sameActor.map((entry) => entry.status).sort()).toEqual([200, 200]);
    expect(await JobRun.countDocuments({ runId: fixture.runId, "operatorResolution.resolutionId": resolutionId })).toBe(1);

    const competing = await send(secondOperator);
    expect(competing.status).toBe(409);
    expect(competing.body.error).toBe("RESOLUTION_CONFLICT");
  });

  it("rejects same-actor key or body changes after recording one immutable intent", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const resolutionId = randomUUID();
    const body = mutationBody(fixture.proofId);
    const first = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send(body);
    expect(first.status).toBe(200);

    const changedBody = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send({ ...body, reason: "A different asserted reason" });
    const changedKey = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(body);

    expect(changedBody.status).toBe(409);
    expect(changedKey.status).toBe(409);
    expect(await JobRun.countDocuments({
      runId: fixture.runId,
      "operatorResolution.resolutionId": resolutionId,
    })).toBe(1);
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("retains the hold when intent persistence fails before commit", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    vi.spyOn(JobRun, "findOneAndUpdate").mockImplementation(() => ({
      lean: vi.fn().mockRejectedValue(new Error("intent write unavailable")),
    }));

    const response = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));

    expect(response.status).toBe(503);
    expect(response.body.releaseIntentRecorded).not.toBe(true);
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    expect((await JobRun.findOne({ runId: fixture.runId }).lean()).operatorResolution).toBeUndefined();
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("recovers when intent commits but its database acknowledgement is lost", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const originalFindOneAndUpdate = JobRun.findOneAndUpdate.bind(JobRun);
    let loseAcknowledgement = true;
    vi.spyOn(JobRun, "findOneAndUpdate").mockImplementation((...args) => {
      const query = originalFindOneAndUpdate(...args);
      const originalLean = query.lean.bind(query);
      query.lean = async () => {
        const result = await originalLean();
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error("intent acknowledgement lost");
        }
        return result;
      };
      return query;
    });

    const resolutionId = randomUUID();
    const response = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", resolutionId)
      .send(mutationBody(fixture.proofId));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ resolutionId, releaseIntentRecorded: true });
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(0);
    expect(await JobRun.countDocuments({
      runId: fixture.runId,
      "operatorResolution.resolutionId": resolutionId,
    })).toBe(1);
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("recovers when exact-owner deletion commits but its acknowledgement is lost", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const originalDeleteOne = ExecutionTargetHold.deleteOne.bind(ExecutionTargetHold);
    let loseAcknowledgement = true;
    vi.spyOn(ExecutionTargetHold, "deleteOne").mockImplementation(async (...args) => {
      const result = await originalDeleteOne(...args);
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new Error("delete acknowledgement lost");
      }
      return result;
    });

    const response = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      releaseIntentRecorded: true,
      originalHoldObservation: "ABSENT",
      targetAvailability: "NOT_ESTABLISHED",
    });
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(0);
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("reports retained ownership when exact-owner deletion stays unavailable", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    vi.spyOn(ExecutionTargetHold, "deleteOne")
      .mockRejectedValue(new Error("delete unavailable"));

    const response = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ releaseIntentRecorded: true });
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    expect((await JobRun.findOne({ runId: fixture.runId }).lean()).operatorResolution).toBeDefined();
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", async () => [{
      name: "execution_target_owner",
      unique: true,
      key: { organizationId: 1, targetAgentId: 1, runId: 1 },
    }]],
    ["unavailable", async () => { throw new Error("index catalog unavailable"); }],
  ])("fails closed when the target-owner index is %s", async (_label, indexResult) => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    vi.spyOn(ExecutionTargetHold.collection, "indexes").mockImplementation(indexResult);

    const read = await request(app)
      .get(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator));
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      eligible: false,
      blockedReason: "EVIDENCE_UNAVAILABLE",
      originalHoldObservation: "UNAVAILABLE",
    });

    const write = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));
    expect(write.status).toBe(503);
    expect(write.body).toMatchObject({ releaseIntentRecorded: true });
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
  });

  it("never deletes a different current owner and reports only original-owner absence", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    await ExecutionTargetHold.deleteOne({ _id: fixture.hold._id });
    const otherRunId = randomUUID();
    await ExecutionTargetHold.create({
      organizationId: org._id,
      targetAgentId: agent._id,
      runId: otherRunId,
      attemptId: randomUUID(),
      fencingToken: 99,
    });

    const response = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));
    expect(response.status).toBe(200);
    expect(response.body.targetAvailability).toBe("NOT_ESTABLISHED");
    expect(await ExecutionTargetHold.countDocuments({ runId: otherRunId, fencingToken: 99 })).toBe(1);
  });

  it("returns scoped not-found and denies target-policy or retargeted shortcuts", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createProofRun();
    const foreign = await request(app)
      .get(`/jobs/${new mongoose.Types.ObjectId()}/runs/${fixture.runId}/reconciliation`)
      .set("Authorization", authHeader(operator));
    expect(foreign.status).toBe(404);

    agent.allowedUsers = [secondOperator._id];
    await agent.save();
    let denied = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));
    expect(denied.status).toBe(403);

    agent.allowedUsers = [];
    await agent.save();
    job.targetAgentId = new mongoose.Types.ObjectId();
    await job.save();
    denied = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send(mutationBody(fixture.proofId));
    expect(denied.status).toBe(403);
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
  });

  it("rejects valid dispatched certificates with the flag on or off and causes no effects", async () => {
    const fixture = await createDispatchedUnknownRun();
    const before = await JobRun.findOne({ runId: fixture.runId }).lean();

    for (const featureEnabled of [false, true]) {
      if (featureEnabled) {
        process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
      } else {
        delete process.env.AXON_OPERATOR_RESOLUTION_ENABLED;
      }
      const response = await request(app)
        .post(reconciliationPath(fixture.runId))
        .set("Authorization", authHeader(operator))
        .set("Idempotency-Key", randomUUID())
        .send({
          certificate: fixture.certificate,
          reason: "Forged ARQP certificate must never authorize release",
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("DISPATCHED_RECONCILIATION_UNAVAILABLE");
      expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    }

    const after = await JobRun.findOne({ runId: fixture.runId }).lean();
    expect(after).toMatchObject({
      status: before.status,
      reasonCode: before.reasonCode,
      transitionSequence: before.transitionSequence,
      transitions: before.transitions,
      attempts: before.attempts,
      terminalSummary: before.terminalSummary,
    });
    expect(after.operatorResolution).toBeUndefined();
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(redisConnection.set).not.toHaveBeenCalled();
  });

  it("rejects dispatched reconciliation at the first service operation", async () => {
    const findRun = vi.spyOn(JobRun, "findOne");
    const updateRun = vi.spyOn(JobRun, "findOneAndUpdate");
    const findHold = vi.spyOn(ExecutionTargetHold, "findOne");
    const deleteHold = vi.spyOn(ExecutionTargetHold, "deleteOne");
    const certificate = {
      version: 1,
      attemptId: randomUUID(),
      targetAgentId: String(new mongoose.Types.ObjectId()),
      processDeadConfirmed: true,
      journalTerminalConfirmed: true,
      generation: 2,
      verifiedAt: new Date().toISOString(),
    };

    await expect(resolveDispatchedQuiescentRun({
      orgId: new mongoose.Types.ObjectId(),
      jobId: new mongoose.Types.ObjectId(),
      runId: randomUUID(),
      actorId: new mongoose.Types.ObjectId(),
      resolutionId: randomUUID(),
      body: { certificate, reason: "Direct service rejection" },
    })).rejects.toMatchObject({
      code: "DISPATCHED_RECONCILIATION_UNAVAILABLE",
      statusCode: 409,
    });
    expect(findRun).not.toHaveBeenCalled();
    expect(updateRun).not.toHaveBeenCalled();
    expect(findHold).not.toHaveBeenCalled();
    expect(deleteHold).not.toHaveBeenCalled();
  });

  it("preserves malformed, viewer, and cross-tenant request boundaries", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const fixture = await createDispatchedUnknownRun();
    const body = {
      certificate: fixture.certificate,
      reason: "Authorization boundary check",
    };

    const malformed = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(operator))
      .set("Idempotency-Key", randomUUID())
      .send({ ...body, certificate: { ...fixture.certificate, version: 2 } });
    expect(malformed.status).toBe(400);

    const viewerResponse = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(viewer))
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(viewerResponse.status).toBe(403);

    const foreignOrg = await Organization.create({
      name: `foreign-reconciliation-org-${Date.now()}`,
      description: "cross-tenant reconciliation test",
    });
    const foreignOperator = await User.create({
      username: `foreign-operator-${Date.now()}`,
      email: `foreign-operator-${Date.now()}@test.example`,
      password: "hashed",
      role: "operator",
      orgId: foreignOrg._id,
    });
    const crossTenant = await request(app)
      .post(reconciliationPath(fixture.runId))
      .set("Authorization", authHeader(foreignOperator))
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(crossTenant.status).toBe(404);
    expect(await ExecutionTargetHold.countDocuments({ runId: fixture.runId })).toBe(1);
    const persisted = await JobRun.findOne({ runId: fixture.runId }).lean();
    expect(persisted.operatorResolution).toBeUndefined();
  });
});
