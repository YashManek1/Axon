import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requestId } from "../middleware/requestId.js";
import Job from "../models/job.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { signSessionToken } from "../controllers/userC.js";

let app;
let createAuditRecord;
let publishLogChunk;
let mockRedis;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  mockRedis = new Redis();

  vi.doMock("../config/queue.js", () => ({ redisConnection: mockRedis }));

  const [routesModule, svcModule, logModule] = await Promise.all([
    import("../routes/auditR.js"),
    import("../services/auditService.js"),
    import("../services/logStreamBroker.js"),
  ]);

  createAuditRecord = svcModule.createAuditRecord;
  publishLogChunk = logModule.publishLogChunk;

  app = express();
  app.use(express.json());
  app.use(requestId);
  app.use("/audit", routesModule.default);
});

let org;
let otherOrg;
let user;
let otherUser;
let job;
let otherJob;

async function createOrgUserJob(prefix) {
  const createdOrg = await Organization.create({
    name: `${prefix}-org`,
    description: `${prefix} org`,
  });
  const createdUser = await User.create({
    username: `${prefix}-user`,
    email: `${prefix}@example.com`,
    password: "hashed-password",
    role: "admin",
    orgId: createdOrg._id,
  });
  const createdJob = await Job.create({
    userId: createdUser._id,
    orgId: createdOrg._id,
    name: `${prefix}-job`,
    type: "shell",
    schedule: "* * * * *",
    payload: { command: "echo ok" },
  });

  return {
    org: createdOrg,
    user: createdUser,
    job: createdJob,
  };
}

function authHeader(authUser = user, authOrg = org) {
  return `Bearer ${signSessionToken(authUser)}`;
}

function auditData(targetJob = job, targetOrg = org, targetUser = user) {
  return {
    jobId: targetJob._id,
    orgId: targetOrg._id,
    triggeredBy: {
      userId: targetUser._id,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    },
    triggerType: "MANUAL_API",
    command: "echo ok",
    status: "PENDING",
  };
}

beforeEach(async () => {
  await mockRedis.flushall();

  const primary = await createOrgUserJob("audit-routes-primary");
  const secondary = await createOrgUserJob("audit-routes-secondary");

  org = primary.org;
  user = primary.user;
  job = primary.job;
  otherOrg = secondary.org;
  otherUser = secondary.user;
  otherJob = secondary.job;
});

describe("audit routes", () => {
  it("GET /audit/job/:jobId without auth returns 401", async () => {
    const response = await request(app).get(`/audit/job/${job._id}`);

    expect(response.status).toBe(401);
  });

  it("GET /audit/job/:jobId with auth and matching org returns 200 with array", async () => {
    await createAuditRecord(auditData());

    const response = await request(app)
      .get(`/audit/job/${job._id}`)
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].jobId).toBe(job._id.toString());
  });

  it("GET /audit/job/:jobId with auth and different org returns 404", async () => {
    await createAuditRecord(auditData(otherJob, otherOrg, otherUser));

    const response = await request(app)
      .get(`/audit/job/${otherJob._id}`)
      .set("Authorization", authHeader(user, org));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Not found" });
  });

  it("returns UNKNOWN and v2 execution identities through job history", async () => {
    await createAuditRecord({
      ...auditData(),
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      reasonCode: "EXECUTION_OUTCOME_UNKNOWN",
      runId: "11111111-1111-4111-8111-111111111111",
      targetExecutionId: "22222222-2222-4222-8222-222222222222",
      attemptId: "33333333-3333-4333-8333-333333333333",
      operationId: "44444444-4444-4444-8444-444444444444",
    });
    const response = await request(app)
      .get(`/audit/job/${job._id}`)
      .set("Authorization", authHeader());
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      reasonCode: "EXECUTION_OUTCOME_UNKNOWN",
      runId: "11111111-1111-4111-8111-111111111111",
      attemptId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("keeps historical logs isolated by run identity", async () => {
    const runA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const runB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const auditA = await createAuditRecord({ ...auditData(), runId: runA });
    await createAuditRecord({ ...auditData(), runId: runB });
    await publishLogChunk(job._id, org._id, { stream: "stdout", line: "run A" }, runA);
    await publishLogChunk(job._id, org._id, { stream: "stdout", line: "run B" }, runB);

    const response = await request(app)
      .get(`/audit/run/${auditA._id}/logs`)
      .set("Authorization", authHeader());
    expect(response.status).toBe(200);
    expect(response.body.map((entry) => entry.line)).toEqual(["run A"]);
  });

  it("viewer sees audit data only for jobs allowed to that viewer", async () => {
    const viewer = await User.create({
      username: `audit-viewer-${Date.now()}-${Math.random()}`,
      email: `audit-viewer-${Date.now()}-${Math.random()}@example.com`,
      password: "hashed-password",
      role: "viewer",
      orgId: org._id,
    });
    job.permissions = { allowedUsers: [user._id], allowedRoles: ["operator"] };
    await job.save();
    const allowedJob = await Job.create({
      userId: user._id,
      orgId: org._id,
      name: "viewer-readable-audit-job",
      type: "shell",
      schedule: "* * * * *",
      payload: { command: "echo visible" },
      permissions: { allowedUsers: [viewer._id], allowedRoles: [] },
    });
    const deniedAudit = await createAuditRecord(auditData());
    const allowedAudit = await createAuditRecord(
      auditData(allowedJob, org, viewer),
    );
    const authorization = authHeader(viewer);

    const [recent, exported, allowedRun, deniedRun, allowedJobHistory, deniedJobHistory] =
      await Promise.all([
        request(app).get("/audit/recent").set("Authorization", authorization),
        request(app)
          .get("/audit/export")
          .query({
            startDate: new Date(Date.now() - 1000).toISOString(),
            endDate: new Date(Date.now() + 1000).toISOString(),
          })
          .set("Authorization", authorization),
        request(app)
          .get(`/audit/run/${allowedAudit._id}`)
          .set("Authorization", authorization),
        request(app)
          .get(`/audit/run/${deniedAudit._id}`)
          .set("Authorization", authorization),
        request(app)
          .get(`/audit/job/${allowedJob._id}`)
          .set("Authorization", authorization),
        request(app)
          .get(`/audit/job/${job._id}`)
          .set("Authorization", authorization),
      ]);

    expect(recent.status).toBe(200);
    expect(recent.body.map((record) => record._id)).toEqual([
      String(allowedAudit._id),
    ]);
    expect(exported.status).toBe(200);
    expect(exported.body.map((record) => record._id)).toEqual([
      String(allowedAudit._id),
    ]);
    expect(allowedRun.status).toBe(200);
    expect(deniedRun.status).toBe(404);
    expect(allowedJobHistory.status).toBe(200);
    expect(allowedJobHistory.body).toHaveLength(1);
    expect(deniedJobHistory.status).toBe(403);
  });

  it("GET /audit/export with valid date range returns 200 with JSON array", async () => {
    await createAuditRecord(auditData());

    const response = await request(app)
      .get("/audit/export")
      .query({
        startDate: new Date(Date.now() - 1000).toISOString(),
        endDate: new Date(Date.now() + 1000).toISOString(),
      })
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
  });

  it("GET /audit/export with invalid dates returns 400", async () => {
    const response = await request(app)
      .get("/audit/export")
      .query({
        startDate: "not-a-date",
        endDate: "also-not-a-date",
      })
      .set("Authorization", authHeader());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid date range" });
  });

  it("GET /audit/verify-chain without auth returns 401", async () => {
    const response = await request(app).get("/audit/verify-chain");

    expect(response.status).toBe(401);
  });

  it("GET /audit/verify-chain with empty chain returns valid with checkedCount 0", async () => {
    const response = await request(app)
      .get("/audit/verify-chain")
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true, brokenAt: null, checkedCount: 0 });
  });

  it("GET /audit/verify-chain after inserting records returns valid", async () => {
    await createAuditRecord(auditData());
    await createAuditRecord(auditData());

    const response = await request(app)
      .get("/audit/verify-chain")
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ valid: true, brokenAt: null, checkedCount: 2 });
  });
});
