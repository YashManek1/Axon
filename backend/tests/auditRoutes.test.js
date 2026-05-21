import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import auditRoutes from "../routes/auditR.js";
import { requestId } from "../middleware/requestId.js";
import { createAuditRecord } from "../services/auditService.js";
import Job from "../models/job.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";

const app = express();

app.use(express.json());
app.use(requestId);
app.use("/audit", auditRoutes);

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
  const token = jwt.sign(
    {
      id: authUser._id,
      orgId: authOrg._id,
      username: authUser.username,
      role: "user",
    },
    process.env.JWT_SECRET,
  );

  return `Bearer ${token}`;
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

  it("GET /audit/job/:jobId with auth and different org returns 200 with empty array", async () => {
    await createAuditRecord(auditData(otherJob, otherOrg, otherUser));

    const response = await request(app)
      .get(`/audit/job/${otherJob._id}`)
      .set("Authorization", authHeader(user, org));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
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
});
