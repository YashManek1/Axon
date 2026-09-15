import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/queue.js", () => ({
  redisConnection: {},
}));

import Agent from "../models/agent.js";
import Job from "../models/job.js";
import JobHistory from "../models/jobHistory.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import adminRoutes from "../routes/adminR.js";
import { signSessionToken } from "../controllers/userC.js";

const app = express();
app.use(express.json());
app.use("/admin", adminRoutes);

let orgA;
let orgB;
let adminA;
let adminB;
let memberA;
let memberB;
let jobAEnabled;
let jobADisabled;
let jobB;

function authorization(user) {
  return `Bearer ${signSessionToken(user)}`;
}

async function createUser(org, role, prefix) {
  const suffix = `${Date.now()}-${Math.random()}`;
  return User.create({
    username: `${prefix}-${suffix}`,
    email: `${prefix}-${suffix}@example.com`,
    password: "hashed-password",
    role,
    orgId: org._id,
  });
}

async function createJob(org, user, name, enabled = true) {
  return Job.create({
    userId: user._id,
    orgId: org._id,
    name,
    type: "shell",
    schedule: "*/5 * * * *",
    payload: { command: `echo ${name}` },
    enabled,
  });
}

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  orgA = await Organization.create({
    name: `admin-isolation-a-${suffix}`,
    description: "Organization A",
    apiKeys: [
      {
        keyId: "aaaaaaaaaaaaaaaa",
        hash: "sensitive-hash-a",
        label: "A key",
        createdAt: new Date(),
      },
    ],
  });
  orgB = await Organization.create({
    name: `admin-isolation-b-${suffix}`,
    description: "Organization B",
    apiKeys: [
      {
        keyId: "bbbbbbbbbbbbbbbb",
        hash: "sensitive-hash-b",
        label: "B key",
        createdAt: new Date(),
      },
    ],
  });
  adminA = await createUser(orgA, "admin", "admin-a");
  adminB = await createUser(orgB, "admin", "admin-b");
  memberA = await createUser(orgA, "operator", "member-a");
  memberB = await createUser(orgB, "operator", "member-b");
  jobAEnabled = await createJob(orgA, adminA, "org-a-enabled", true);
  jobADisabled = await createJob(orgA, memberA, "org-a-disabled", false);
  jobB = await createJob(orgB, memberB, "org-b-job", true);
  await Promise.all([
    Agent.create({
      name: "org-a-agent",
      hardwareUuid: `agent-a-${suffix}`,
      orgId: orgA._id,
      apiKey: `agent-a-key-${suffix}`,
      status: "online",
    }),
    Agent.create({
      name: "org-b-agent",
      hardwareUuid: `agent-b-${suffix}`,
      orgId: orgB._id,
      apiKey: `agent-b-key-${suffix}`,
      status: "online",
    }),
    JobHistory.create({
      jobId: String(jobAEnabled._id),
      orgId: orgA._id,
      status: "success",
      executedAt: new Date(),
    }),
    JobHistory.create({
      jobId: String(jobB._id),
      orgId: orgB._id,
      status: "success",
      executedAt: new Date(),
    }),
  ]);
});

describe("organization admin isolation", () => {
  it("scopes every admin listing and statistic to the current organization", async () => {
    const auth = authorization(adminA);
    const [jobs, users, jobStats, userStats, analytics] = await Promise.all([
      request(app).get("/admin/all-jobs").set("Authorization", auth),
      request(app).get("/admin/all-users").set("Authorization", auth),
      request(app).get("/admin/job-stats").set("Authorization", auth),
      request(app).get("/admin/user-stats").set("Authorization", auth),
      request(app).get("/admin/org-analytics").set("Authorization", auth),
    ]);

    expect([jobs.status, users.status, jobStats.status, userStats.status, analytics.status])
      .toEqual([200, 200, 200, 200, 200]);
    expect(jobs.body.map((job) => job._id).sort()).toEqual(
      [String(jobAEnabled._id), String(jobADisabled._id)].sort(),
    );
    expect(users.body.map((user) => user._id).sort()).toEqual(
      [String(adminA._id), String(memberA._id)].sort(),
    );
    expect(users.body.every((user) => !("password" in user))).toBe(true);
    expect(JSON.stringify(users.body)).not.toContain("hashed-password");
    expect(users.body).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ _id: String(adminB._id) }),
        expect.objectContaining({ _id: String(memberB._id) }),
      ]),
    );
    expect(jobStats.body).toMatchObject({
      totalJobs: 2,
      enabledJobs: 1,
      disabledJobs: 1,
      jobsRunLast24h: 1,
    });
    expect(jobStats.body.jobsByOrg).toHaveLength(1);
    expect(jobStats.body.jobsByOrg[0].orgId).toBe(String(orgA._id));
    expect(userStats.body.totalUsers).toBe(2);
    expect(userStats.body.users).toHaveLength(2);
    expect(analytics.body).toMatchObject({
      totalOrgs: 1,
      totalAgents: 1,
      onlineAgents: 1,
      offlineAgents: 0,
    });
    expect(analytics.body.orgs).toHaveLength(1);
    expect(analytics.body.orgs[0].orgId).toBe(String(orgA._id));
    expect(JSON.stringify({ jobs: jobs.body, users: users.body })).not.toContain(
      String(orgB._id),
    );
  });

  it("lists only current-org API key metadata without stored hashes", async () => {
    const response = await request(app)
      .get("/admin/org/api-keys")
      .set("Authorization", authorization(adminA));

    expect(response.status).toBe(200);
    expect(response.body.apiKeys).toEqual([
      expect.objectContaining({ keyId: "aaaaaaaaaaaaaaaa", label: "A key" }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain("sensitive-hash");
    expect(JSON.stringify(response.body)).not.toContain("bbbbbbbbbbbbbbbb");
  });
});
