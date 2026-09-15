import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/queue.js", () => ({
  scheduledJobsQueue: { add: vi.fn(), removeRepeatable: vi.fn() },
  immediateJobsQueue: { add: vi.fn().mockResolvedValue(undefined) },
  redisConnection: { set: vi.fn().mockResolvedValue("OK") },
}));
import Job from "../models/job.js";
import Agent from "../models/agent.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import jobRoutes from "../routes/jobR.js";
import agentProvisioningRoutes from "../routes/agentProvisioningR.js";
import { signSessionToken } from "../controllers/userC.js";
import { immediateJobsQueue, scheduledJobsQueue } from "../config/queue.js";

const app = express();
app.use(express.json());
app.use("/jobs", jobRoutes);
app.use("/agents", agentProvisioningRoutes);

// ─── Helpers ────────────────────────────────────────────────────────────────

let org;

function makeToken(user) {
  return signSessionToken(user);
}

function authHeader(user) {
  return `Bearer ${makeToken(user)}`;
}

async function createUser(role) {
  const suffix = `${Date.now()}-${Math.random()}`;
  return User.create({
    username: `${role}-${suffix}`,
    email: `${role}-${suffix}@test.com`,
    password: "hashed",
    role,
    orgId: org._id,
  });
}

async function createJob(userId, permissionsOverride = {}) {
  return Job.create({
    userId,
    name: `test-job-${Date.now()}`,
    type: "http",
    schedule: "*/5 * * * *",
    payload: { url: "https://example.com/health", method: "GET" },
    orgId: org._id,
    permissions: permissionsOverride,
  });
}

async function createAgent() {
  const suffix = `${Date.now()}-${Math.random()}`;
  return Agent.create({
    name: `test-agent-${suffix}`,
    hardwareUuid: `uuid-${suffix}`,
    orgId: org._id,
    apiKey: `key-${suffix}`,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  const keyId = "0123456789abcdef";
  const secret = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo";
  org = await Organization.create({
    name: `resource-auth-org-${Date.now()}`,
    description: "test",
    apiKeys: [
      {
        keyId,
        hash: await bcrypt.hash(secret, 10),
        label: "test-key",
        createdAt: new Date(),
      },
    ],
  });
});

// ─── POST /jobs/runJobNow/:jobId ─────────────────────────────────────────────

describe("POST /jobs/runJobNow/:jobId — resource-level authorization", () => {
  it("empty permissions: any org member can trigger (backward compatible)", async () => {
    const operator = await createUser("operator");
    const job = await createJob(operator._id, {});

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(operator));

    expect(res.status).toBe(200);
    expect(immediateJobsQueue.add).toHaveBeenCalledTimes(1);
  });

  it("allowedUsers set: listed user is allowed", async () => {
    const operator = await createUser("operator");
    const job = await createJob(operator._id, {
      allowedUsers: [operator._id],
      allowedRoles: [],
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(operator));

    expect(res.status).toBe(200);
    expect(immediateJobsQueue.add).toHaveBeenCalledTimes(1);
  });

  it("allowedUsers set: unlisted user gets 403", async () => {
    const owner = await createUser("operator");
    const outsider = await createUser("operator");
    const job = await createJob(owner._id, {
      allowedUsers: [owner._id],
      allowedRoles: [],
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(outsider));

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");
  });

  it("allowedRoles=['operator']: operator is allowed", async () => {
    const operator = await createUser("operator");
    const job = await createJob(operator._id, {
      allowedUsers: [],
      allowedRoles: ["operator"],
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(operator));

    expect(res.status).toBe(200);
    expect(immediateJobsQueue.add).toHaveBeenCalledTimes(1);
  });

  it("allowedRoles=['operator']: viewer gets 403", async () => {
    const owner = await createUser("operator");
    const viewer = await createUser("viewer");
    const job = await createJob(owner._id, {
      allowedUsers: [],
      allowedRoles: ["operator"],
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(viewer));

    expect(res.status).toBe(403);
  });

  it("legacy role='user' is treated as 'operator' for backward compat", async () => {
    const legacyUser = await createUser("user");
    const job = await createJob(legacyUser._id, {
      allowedUsers: [],
      allowedRoles: ["operator"],
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(legacyUser));

    expect(res.status).toBe(200);
    expect(immediateJobsQueue.add).toHaveBeenCalledTimes(1);
  });

  it("admin bypasses restrictions even when not in allowedUsers", async () => {
    const admin = await createUser("admin");
    const owner = await createUser("operator");
    const job = await createJob(owner._id, {
      allowedUsers: [owner._id],
      allowedRoles: [],
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    expect(immediateJobsQueue.add).toHaveBeenCalledTimes(1);
  });

  it("returns 401 with no token", async () => {
    const owner = await createUser("operator");
    const job = await createJob(owner._id);

    const res = await request(app).post(`/jobs/runJobNow/${job._id}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a job belonging to a different org", async () => {
    const operator = await createUser("operator");
    const otherOrg = await Organization.create({
      name: `other-org-${Date.now()}`,
      description: "other",
      apiKeyHash: await bcrypt.hash("other-key", 10),
    });
    const foreignJob = await Job.create({
      userId: operator._id,
      name: "foreign",
      type: "shell",
      schedule: "*/5 * * * *",
      payload: { command: "echo" },
      orgId: otherOrg._id,
    });

    const res = await request(app)
      .post(`/jobs/runJobNow/${foreignJob._id}`)
      .set("Authorization", authHeader(operator));

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /jobs/:id/permissions ─────────────────────────────────────────────

describe("PATCH /jobs/:id/permissions", () => {
  it("admin can set allowedUsers and allowedRoles", async () => {
    const admin = await createUser("admin");
    const operator = await createUser("operator");
    const job = await createJob(admin._id);

    const res = await request(app)
      .patch(`/jobs/${job._id}/permissions`)
      .set("Authorization", authHeader(admin))
      .send({ allowedUsers: [operator._id.toString()], allowedRoles: ["operator"] });

    expect(res.status).toBe(200);
    expect(res.body.permissions.allowedRoles).toContain("operator");

    const updated = await Job.findById(job._id);
    expect(updated.permissions.allowedUsers.map(String)).toContain(operator._id.toString());
  });

  it("non-admin gets 403", async () => {
    const operator = await createUser("operator");
    const job = await createJob(operator._id);

    const res = await request(app)
      .patch(`/jobs/${job._id}/permissions`)
      .set("Authorization", authHeader(operator))
      .send({ allowedUsers: [], allowedRoles: [] });

    expect(res.status).toBe(403);
  });

  it("rejects unknown role values", async () => {
    const admin = await createUser("admin");
    const job = await createJob(admin._id);

    const res = await request(app)
      .patch(`/jobs/${job._id}/permissions`)
      .set("Authorization", authHeader(admin))
      .send({ allowedUsers: [], allowedRoles: ["superuser"] });

    expect(res.status).toBe(400);
  });

  it("setting empty arrays restores unrestricted access", async () => {
    const admin = await createUser("admin");
    const operator = await createUser("operator");
    const job = await createJob(admin._id, { allowedUsers: [admin._id], allowedRoles: [] });

    // Widen to open access
    await request(app)
      .patch(`/jobs/${job._id}/permissions`)
      .set("Authorization", authHeader(admin))
      .send({ allowedUsers: [], allowedRoles: [] });

    const res = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", authHeader(operator));

    expect(res.status).toBe(200);
    expect(immediateJobsQueue.add).toHaveBeenCalledTimes(1);
  });
});

describe("viewer mutation boundary", () => {
  it("rejects create, update, toggle, run, delete, and permission writes without queueing", async () => {
    const owner = await createUser("operator");
    const viewer = await createUser("viewer");
    const job = await createJob(owner._id);
    const authorization = authHeader(viewer);

    const responses = await Promise.all([
      request(app).post("/jobs/createJob").set("Authorization", authorization).send({}),
      request(app)
        .put(`/jobs/updateJob/${job._id}`)
        .set("Authorization", authorization)
        .send({ name: "viewer edit" }),
      request(app)
        .patch(`/jobs/toggleJobStatus/${job._id}`)
        .set("Authorization", authorization),
      request(app)
        .post(`/jobs/runJobNow/${job._id}`)
        .set("Authorization", authorization),
      request(app)
        .delete(`/jobs/deleteJob/${job._id}`)
        .set("Authorization", authorization),
      request(app)
        .patch(`/jobs/${job._id}/permissions`)
        .set("Authorization", authorization)
        .send({ allowedUsers: [], allowedRoles: [] }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403, 403,
    ]);
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.removeRepeatable).not.toHaveBeenCalled();
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
    expect(await Job.exists({ _id: job._id })).toBeTruthy();
  });
});

describe("restricted job mutation boundary", () => {
  it("prevents an unlisted operator from changing or queueing a restricted job", async () => {
    const owner = await createUser("operator");
    const outsider = await createUser("operator");
    const job = await createJob(owner._id, {
      allowedUsers: [owner._id],
      allowedRoles: [],
    });

    const response = await request(app)
      .put(`/jobs/updateJob/${job._id}`)
      .set("Authorization", authHeader(outsider))
      .send({
        name: "unauthorized executable edit",
        payload: { command: "echo unauthorized" },
        enabled: true,
      });

    const unchanged = await Job.findById(job._id);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Access denied");
    expect(unchanged.name).toBe(job.name);
    expect(unchanged.payload.url).toBe("https://example.com/health");
    expect(scheduledJobsQueue.add).not.toHaveBeenCalled();
    expect(scheduledJobsQueue.removeRepeatable).not.toHaveBeenCalled();
    expect(immediateJobsQueue.add).not.toHaveBeenCalled();
  });
});

describe("restricted job reads", () => {
  it("lists and reads only jobs allowed by user or role", async () => {
    const owner = await createUser("operator");
    const viewer = await createUser("viewer");
    const roleAllowed = await createJob(owner._id, {
      allowedUsers: [],
      allowedRoles: ["viewer"],
    });
    const userAllowed = await createJob(owner._id, {
      allowedUsers: [viewer._id],
      allowedRoles: [],
    });
    const denied = await createJob(owner._id, {
      allowedUsers: [owner._id],
      allowedRoles: ["operator"],
    });

    const listResponse = await request(app)
      .get("/jobs/getJobs")
      .set("Authorization", authHeader(viewer));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.map((job) => job._id).sort()).toEqual(
      [String(roleAllowed._id), String(userAllowed._id)].sort(),
    );

    const allowedResponse = await request(app)
      .get(`/jobs/getJobById/${roleAllowed._id}`)
      .set("Authorization", authHeader(viewer));
    const deniedResponse = await request(app)
      .get(`/jobs/getJobById/${denied._id}`)
      .set("Authorization", authHeader(viewer));

    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.body._id).toBe(String(roleAllowed._id));
    expect(deniedResponse.status).toBe(403);
  });
});

// ─── PATCH /agents/:agentId/permissions ──────────────────────────────────────

describe("PATCH /agents/:agentId/permissions", () => {
  it("admin can set users, jobs, and exact approved commands", async () => {
    const admin = await createUser("admin");
    const operator = await createUser("operator");
    const agent = await createAgent();
    const job = await createJob(admin._id);

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", authHeader(admin))
      .send({
        allowedUsers: [operator._id.toString()],
        allowedJobs: [job._id.toString()],
        allowedCommands: ["systemctl restart axon"],
      });

    expect(res.status).toBe(200);

    const updated = await Agent.findById(agent._id);
    expect(updated.allowedUsers.map(String)).toContain(operator._id.toString());
    expect(updated.allowedJobs.map(String)).toContain(job._id.toString());
    expect(updated.allowedCommands).toEqual(["systemctl restart axon"]);
    expect(res.body.allowedCommands).toEqual(["systemctl restart axon"]);
  });

  it("rejects malformed command approval policy", async () => {
    const admin = await createUser("admin");
    const agent = await createAgent();
    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", authHeader(admin))
      .send({ allowedUsers: [], allowedJobs: [], allowedCommands: [""] });
    expect(res.status).toBe(400);
    expect((await Agent.findById(agent._id)).allowedCommands).toHaveLength(0);
  });

  it("preserves existing user and job restrictions on a command-only update", async () => {
    const admin = await createUser("admin");
    const operator = await createUser("operator");
    const job = await createJob(admin._id);
    const agent = await createAgent();
    agent.allowedUsers = [operator._id];
    agent.allowedJobs = [job._id];
    await agent.save();

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", authHeader(admin))
      .send({ allowedCommands: ["uptime"] });
    expect(res.status).toBe(200);
    const updated = await Agent.findById(agent._id);
    expect(updated.allowedUsers.map(String)).toEqual([String(operator._id)]);
    expect(updated.allowedJobs.map(String)).toEqual([String(job._id)]);
    expect(updated.allowedCommands).toEqual(["uptime"]);
  });

  it("non-admin gets 403", async () => {
    const operator = await createUser("operator");
    const agent = await createAgent();

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", authHeader(operator))
      .send({ allowedUsers: [], allowedJobs: [] });

    expect(res.status).toBe(403);
  });
});

// ─── Model defaults (backward compat) ────────────────────────────────────────

describe("model defaults — backward compatibility", () => {
  it("Job.permissions defaults to empty arrays (unrestricted)", async () => {
    const operator = await createUser("operator");
    const job = await createJob(operator._id);
    const loaded = await Job.findById(job._id);
    expect(loaded.permissions.allowedUsers).toHaveLength(0);
    expect(loaded.permissions.allowedRoles).toHaveLength(0);
  });

  it("Agent.allowedUsers and allowedJobs default to empty", async () => {
    const agent = await createAgent();
    const loaded = await Agent.findById(agent._id);
    expect(loaded.allowedUsers).toHaveLength(0);
    expect(loaded.allowedJobs).toHaveLength(0);
  });

  it("new User defaults to 'operator' role", async () => {
    const suffix = Date.now();
    const user = await User.create({
      username: `default-role-${suffix}`,
      email: `default-${suffix}@test.com`,
      password: "hashed",
      orgId: org._id,
    });
    expect(user.role).toBe("operator");
  });

  it("existing 'user'-role documents remain valid against updated enum", async () => {
    const legacyUser = await createUser("user");
    const loaded = await User.findById(legacyUser._id);
    expect(loaded.role).toBe("user");
  });
});
