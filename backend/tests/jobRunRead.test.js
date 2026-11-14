import { randomUUID } from "crypto";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/queue.js", () => ({
  scheduledJobsQueue: { add: vi.fn(), removeRepeatable: vi.fn() },
  immediateJobsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  redisConnection: { set: vi.fn().mockResolvedValue("OK") },
}));

import { immediateJobsQueue, scheduledJobsQueue } from "../config/queue.js";
import { signSessionToken } from "../controllers/userC.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import jobRoutes from "../routes/jobR.js";

const app = express();
app.use(express.json());
app.use("/jobs", jobRoutes);

const RUN_KEYS = [
  "attempts",
  "completedAt",
  "createdAt",
  "jobId",
  "queuedAt",
  "reasonCode",
  "requiresReview",
  "runId",
  "status",
  "targetAgentId",
  "terminalSummary",
  "transitions",
  "transitionSequence",
  "updatedAt",
].sort();
const ATTEMPT_KEYS = [
  "acknowledgedAt",
  "attemptId",
  "completedAt",
  "dispatchedAt",
  "exitCode",
  "operationId",
  "outcome",
  "reasonCode",
  "sequence",
  "status",
  "targetExecutionId",
].sort();
const TRANSITION_KEYS = [
  "at",
  "attemptId",
  "from",
  "reasonCode",
  "sequence",
  "source",
  "to",
].sort();
const TERMINAL_KEYS = [
  "completedAt",
  "exitCode",
  "outcome",
  "reasonCode",
  "status",
].sort();

let org;
let owner;
let viewer;
let job;

function authHeader(user) {
  return `Bearer ${signSessionToken(user)}`;
}

async function createUser(role, organization = org) {
  const suffix = `${Date.now()}-${Math.random()}`;
  return User.create({
    username: `${role}-${suffix}`,
    email: `${role}-${suffix}@test.example`,
    password: "hashed",
    role,
    orgId: organization._id,
  });
}

async function createJob(userId, organization = org, permissions = {}) {
  return Job.create({
    userId,
    name: `saved-run-job-${Date.now()}-${Math.random()}`,
    type: "shell",
    schedule: "*/5 * * * *",
    payload: { command: "echo fixture" },
    targetAgentId: new mongoose.Types.ObjectId(),
    orgId: organization._id,
    permissions,
  });
}

async function createRun({
  forJob = job,
  index = 1,
  runId = randomUUID(),
  createdAt = new Date(Date.UTC(2026, 8, 1, 0, 0, index)),
  withApproval = false,
} = {}) {
  const attemptId = randomUUID();
  const targetExecutionId = randomUUID();
  const operationId = randomUUID();
  const completedAt = new Date(createdAt.getTime() + 750);
  const objectId = new mongoose.Types.ObjectId(index.toString(16).padStart(24, "0"));

  return JobRun.create({
    _id: objectId,
    runId,
    orgId: forJob.orgId,
    jobId: forJob._id,
    targetAgentId: forJob.targetAgentId,
    targetSocketId: `socket-secret-${index}`,
    queueJobId: `queue-secret-${index}`,
    requestKey: `request-secret-${index}`,
    requestFingerprint: `fingerprint-secret-${index}`,
    approval: withApproval
      ? {
          previewId: randomUUID(),
          previewVersion: 1,
          previewHash: `approval-hash-secret-${index}`,
          issuedAt: createdAt,
          expiresAt: new Date(createdAt.getTime() + 60_000),
          acceptedAt: createdAt,
          preview: { command: `approval-command-secret-${index}` },
          material: { key: `approval-key-secret-${index}` },
        }
      : null,
    triggeredBy: {
      userId: owner._id,
      ipAddress: `10.0.0.${index}`,
      userAgent: `network-identity-secret-${index}`,
    },
    action: {
      actionVersion: `action-version-secret-${index}`,
      command: `command-secret-${index}`,
      allowedCommands: [`allowed-command-secret-${index}`],
      timeoutMs: 30_000,
      startBefore: createdAt.getTime() + 60_000,
      maxOutputBytes: 65_536,
    },
    status: "SUCCEEDED",
    requiresReview: false,
    reasonCode: "COMPLETED_OK",
    queuedAt: createdAt,
    completedAt,
    transitionSequence: 2,
    transitions: [
      {
        sequence: 1,
        from: null,
        to: "ACCEPTED",
        at: createdAt,
        reasonCode: "RUN_ACCEPTED",
        source: "API",
        queueJobId: `transition-queue-secret-${index}`,
        attemptId,
      },
      {
        sequence: 2,
        from: "ACCEPTED",
        to: "SUCCEEDED",
        at: completedAt,
        reasonCode: "COMPLETED_OK",
        source: "WORKER",
        queueJobId: `transition-worker-secret-${index}`,
        attemptId,
      },
    ],
    terminalSummary: {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: "COMPLETED_OK",
      completedAt,
    },
    attempts: [
      {
        attemptId,
        targetExecutionId,
        operationId,
        sequence: 1,
        status: "SUCCEEDED",
        dispatchedAt: createdAt,
        acknowledgedAt: new Date(createdAt.getTime() + 250),
        completedAt,
        outcome: "COMPLETED",
        exitCode: 0,
        reasonCode: "COMPLETED_OK",
      },
    ],
    createdAt,
    updatedAt: completedAt,
  });
}

function expectStrictRunDto(run) {
  expect(Object.keys(run).sort()).toEqual(RUN_KEYS);
  expect(Object.keys(run.attempts[0]).sort()).toEqual(ATTEMPT_KEYS);
  expect(Object.keys(run.transitions[0]).sort()).toEqual(TRANSITION_KEYS);
  expect(Object.keys(run.terminalSummary).sort()).toEqual(TERMINAL_KEYS);
  expect(run.jobId).toBe(String(job._id));
  expect(run.targetAgentId).toBe(String(job.targetAgentId));

  const serialized = JSON.stringify(run);
  for (const forbidden of [
    "queueJobId",
    "targetSocketId",
    "requestKey",
    "requestFingerprint",
    "approval",
    "triggeredBy",
    "action",
    "command-secret",
    "approval-key-secret",
    "network-identity-secret",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function installForbiddenSideEffectSpies() {
  return [
    vi.spyOn(JobRun, "create"),
    vi.spyOn(JobRun, "updateOne"),
    vi.spyOn(JobRun, "updateMany"),
    vi.spyOn(JobRun, "findOneAndUpdate"),
    vi.spyOn(JobRun, "deleteOne"),
    vi.spyOn(JobRun, "deleteMany"),
    vi.spyOn(JobRun, "bulkWrite"),
  ];
}

function expectNoForbiddenSideEffects(spies) {
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect(immediateJobsQueue.add).not.toHaveBeenCalled();
  expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
  expect(scheduledJobsQueue.removeRepeatable).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  org = await Organization.create({
    name: `saved-run-org-${Date.now()}-${Math.random()}`,
    description: "saved run tests",
  });
  owner = await createUser("operator");
  viewer = await createUser("viewer");
  job = await createJob(owner._id, org, {
    allowedUsers: [],
    allowedRoles: ["viewer"],
  });
});

describe("saved JobRun evidence reads", () => {
  it("returns the latest ten deterministically, permits viewers, strictly redacts, and can read an older run", async () => {
    const runs = [];
    for (let index = 1; index <= 12; index += 1) {
      const pairTimestamp = new Date(Date.UTC(2026, 8, 1, 0, 0, Math.ceil(index / 2)));
      runs.push(
        await createRun({
          index,
          createdAt: pairTimestamp,
          withApproval: index === 1,
        }),
      );
    }
    const expected = [...runs].sort((left, right) => {
      const byCreatedAt = right.createdAt.getTime() - left.createdAt.getTime();
      return byCreatedAt || String(right._id).localeCompare(String(left._id));
    });
    const findSpy = vi.spyOn(JobRun, "find");
    const findOneSpy = vi.spyOn(JobRun, "findOne");
    const sideEffectSpies = installForbiddenSideEffectSpies();

    const listResponse = await request(app)
      .get(`/jobs/${job._id}/runs`)
      .set("Authorization", authHeader(viewer));

    expect(listResponse.status).toBe(200);
    expect(listResponse.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(listResponse.body).sort()).toEqual(["hasMore", "runs"]);
    expect(listResponse.body.hasMore).toBe(true);
    expect(listResponse.body.runs).toHaveLength(10);
    expect(listResponse.body.runs.map((run) => run.runId)).toEqual(
      expected.slice(0, 10).map((run) => run.runId),
    );
    expectStrictRunDto(listResponse.body.runs[0]);
    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(String(findSpy.mock.calls[0][0].orgId)).toBe(String(org._id));
    expect(String(findSpy.mock.calls[0][0].jobId)).toBe(String(job._id));

    const older = expected[11];
    const exactResponse = await request(app)
      .get(`/jobs/${job._id}/runs/${older.runId}`)
      .set("Authorization", authHeader(viewer));

    expect(exactResponse.status).toBe(200);
    expect(exactResponse.headers["cache-control"]).toBe("no-store");
    expect(exactResponse.body.runId).toBe(older.runId);
    expectStrictRunDto(exactResponse.body);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
    expect(findOneSpy.mock.calls[0][0]).toMatchObject({ runId: older.runId });
    expect(String(findOneSpy.mock.calls[0][0].orgId)).toBe(String(org._id));
    expect(String(findOneSpy.mock.calls[0][0].jobId)).toBe(String(job._id));
    expectNoForbiddenSideEffects(sideEffectSpies);
  });

  it("denies unauthenticated, unauthorized, and cross-tenant job access before reading runs", async () => {
    const outsider = await createUser("operator");
    const restrictedJob = await createJob(owner._id, org, {
      allowedUsers: [owner._id],
      allowedRoles: [],
    });
    const foreignOrg = await Organization.create({
      name: `foreign-org-${Date.now()}-${Math.random()}`,
      description: "foreign",
    });
    const foreignOwner = await createUser("operator", foreignOrg);
    const foreignJob = await createJob(foreignOwner._id, foreignOrg);
    const findSpy = vi.spyOn(JobRun, "find");
    const findOneSpy = vi.spyOn(JobRun, "findOne");
    const sideEffectSpies = installForbiddenSideEffectSpies();

    const unauthenticated = await request(app).get(`/jobs/${job._id}/runs`);
    const forbidden = await request(app)
      .get(`/jobs/${restrictedJob._id}/runs`)
      .set("Authorization", authHeader(outsider));
    const crossTenant = await request(app)
      .get(`/jobs/${foreignJob._id}/runs`)
      .set("Authorization", authHeader(viewer));

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(crossTenant.status).toBe(404);
    for (const response of [unauthenticated, forbidden, crossTenant]) {
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(findSpy).not.toHaveBeenCalled();
    expect(findOneSpy).not.toHaveBeenCalled();
    expectNoForbiddenSideEffects(sideEffectSpies);
  });

  it("distinguishes malformed, missing, and cross-job run identities", async () => {
    const run = await createRun({ index: 21 });
    const otherJob = await createJob(owner._id, org, {
      allowedUsers: [],
      allowedRoles: ["viewer"],
    });
    const findOneSpy = vi.spyOn(JobRun, "findOne");
    const sideEffectSpies = installForbiddenSideEffectSpies();

    const malformed = await request(app)
      .get(`/jobs/${job._id}/runs/not-a-uuid`)
      .set("Authorization", authHeader(viewer));
    expect(malformed.status).toBe(400);
    expect(malformed.headers["cache-control"]).toBe("no-store");
    expect(findOneSpy).not.toHaveBeenCalled();

    const missing = await request(app)
      .get(`/jobs/${job._id}/runs/${randomUUID()}`)
      .set("Authorization", authHeader(viewer));
    expect(missing.status).toBe(404);

    const crossJob = await request(app)
      .get(`/jobs/${otherJob._id}/runs/${run.runId}`)
      .set("Authorization", authHeader(viewer));
    expect(crossJob.status).toBe(404);
    expect(findOneSpy).toHaveBeenCalledTimes(2);
    expect(String(findOneSpy.mock.calls[1][0].jobId)).toBe(String(otherJob._id));
    expectNoForbiddenSideEffects(sideEffectSpies);
  });

  it("returns 503 instead of successful empty evidence when Mongo reads fail", async () => {
    const sideEffectSpies = installForbiddenSideEffectSpies();
    const listFailure = vi.spyOn(JobRun, "find").mockImplementationOnce(() => {
      throw new Error("Mongo read unavailable");
    });

    const listResponse = await request(app)
      .get(`/jobs/${job._id}/runs`)
      .set("Authorization", authHeader(viewer));

    expect(listResponse.status).toBe(503);
    expect(listResponse.headers["cache-control"]).toBe("no-store");
    expect(listResponse.body).toEqual({ message: "Run evidence unavailable" });
    expect(listResponse.body).not.toEqual({ runs: [], hasMore: false });
    listFailure.mockRestore();

    const exactFailure = vi.spyOn(JobRun, "findOne").mockImplementationOnce(() => {
      throw new Error("Mongo read unavailable");
    });
    const exactResponse = await request(app)
      .get(`/jobs/${job._id}/runs/${randomUUID()}`)
      .set("Authorization", authHeader(viewer));

    expect(exactResponse.status).toBe(503);
    expect(exactResponse.headers["cache-control"]).toBe("no-store");
    expect(exactResponse.body).toEqual({ message: "Run evidence unavailable" });
    exactFailure.mockRestore();
    expectNoForbiddenSideEffects(sideEffectSpies);
  });
});
