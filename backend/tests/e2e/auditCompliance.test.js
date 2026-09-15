import cookieParser from "cookie-parser";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import AuditLog from "../../models/auditLog.js";
import Job from "../../models/job.js";
import Organization from "../../models/organization.js";
import User from "../../models/user.js";
import { requestId } from "../../middleware/requestId.js";
import { signSessionToken } from "../../controllers/userC.js";

let app;
let createAuditRecord;
let updateAuditRecord;
let mockRedis;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  mockRedis = new Redis();

  vi.doMock("../../config/queue.js", () => ({ redisConnection: mockRedis }));

  const [routesModule, svcModule] = await Promise.all([
    import("../../routes/auditR.js"),
    import("../../services/auditService.js"),
  ]);

  createAuditRecord = svcModule.createAuditRecord;
  updateAuditRecord = svcModule.updateAuditRecord;

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId);
  app.use("/audit", routesModule.default);
});

let orgA;
let orgB;
let userA;
let userB;
let jobA;
let jobB;

async function createOrgUserJob(prefix) {
  const org = await Organization.create({
    name: `${prefix}-org-${Date.now()}-${Math.random()}`,
    description: `${prefix} org`,
  });
  const user = await User.create({
    username: `${prefix}-user-${Date.now()}-${Math.random()}`,
    email: `${prefix}-${Date.now()}-${Math.random()}@example.com`,
    password: "hashed-password",
    orgId: org._id,
  });
  const job = await Job.create({
    userId: user._id,
    orgId: org._id,
    name: `${prefix}-job`,
    type: "shell",
    schedule: "* * * * *",
    payload: { command: "echo ok" },
  });

  return { org, user, job };
}

function authHeader(user, org) {
  return `Bearer ${signSessionToken(user)}`;
}

function auditData(job = jobA, org = orgA, user = userA) {
  return {
    jobId: job._id,
    orgId: org._id,
    triggeredBy: {
      userId: user._id,
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

  const fixtureA = await createOrgUserJob("audit-compliance-a");
  const fixtureB = await createOrgUserJob("audit-compliance-b");

  orgA = fixtureA.org;
  userA = fixtureA.user;
  jobA = fixtureA.job;
  orgB = fixtureB.org;
  userB = fixtureB.user;
  jobB = fixtureB.job;
});

describe("audit compliance e2e", () => {
  it("Audit records cannot be tampered with", async () => {
    const audit = await createAuditRecord(auditData());

    await expect(
      updateAuditRecord(audit._id, { jobId: jobB._id }),
    ).rejects.toThrow("Audit field jobId cannot be updated");
    await expect(
      updateAuditRecord(audit._id, {
        triggeredBy: {
          userId: userB._id,
          ipAddress: "127.0.0.2",
          userAgent: "tamper",
        },
      }),
    ).rejects.toThrow("Audit field triggeredBy cannot be updated");
    await expect(
      updateAuditRecord(audit._id, { startedAt: new Date() }),
    ).rejects.toThrow("Audit field startedAt cannot be updated");

    const directAudit = await AuditLog.findById(audit._id);
    directAudit.jobId = jobB._id;

    await expect(directAudit.save()).rejects.toThrow(
      "Audit field jobId is immutable",
    );
  });

  it("Org-scoped audit isolation", async () => {
    await createAuditRecord(auditData(jobA, orgA, userA));
    await createAuditRecord(auditData(jobB, orgB, userB));

    const otherOrgJobResponse = await request(app)
      .get(`/audit/job/${jobB._id}`)
      .set("Authorization", authHeader(userA, orgA));

    expect(otherOrgJobResponse.status).toBe(404);
    expect(JSON.stringify(otherOrgJobResponse.body)).not.toContain(String(orgB._id));

    const exportResponse = await request(app)
      .get("/audit/export")
      .query({
        startDate: new Date(Date.now() - 1000).toISOString(),
        endDate: new Date(Date.now() + 1000).toISOString(),
      })
      .set("Authorization", authHeader(userA, orgA));

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body).toHaveLength(1);
    expect(exportResponse.body[0].orgId).toBe(String(orgA._id));
  });
});
