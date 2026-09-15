import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import Agent from "../models/agent.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import agentProvisioningRoutes from "../routes/agentProvisioningR.js";
import { signSessionToken } from "../controllers/userC.js";

const app = express();
app.use(express.json());
app.use("/agents", agentProvisioningRoutes);

let org;
let orgApiKey;

function adminToken(user) {
  return signSessionToken(user);
}

beforeEach(async () => {
  const keyId = "0123456789abcdef";
  const secret = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo";
  orgApiKey = `axk_${keyId}_${secret}`;
  org = await Organization.create({
    name: `sandbox-org-${Date.now()}`,
    description: "sandbox test org",
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

// ─── Model defaults ───────────────────────────────────────────────────────────

describe("Agent model — sandboxMode field", () => {
  it("defaults to 'none' when not specified", async () => {
    const agent = await Agent.create({
      name: "test-agent",
      hardwareUuid: `hw-${Date.now()}`,
      orgId: org._id,
      apiKey: `key-${Date.now()}`,
    });
    const loaded = await Agent.findById(agent._id);
    expect(loaded.sandboxMode).toBe("none");
  });

  it("accepts 'namespace'", async () => {
    const agent = await Agent.create({
      name: "ns-agent",
      hardwareUuid: `hw-ns-${Date.now()}`,
      orgId: org._id,
      apiKey: `key-ns-${Date.now()}`,
      sandboxMode: "namespace",
    });
    expect(agent.sandboxMode).toBe("namespace");
  });

  it("accepts 'docker'", async () => {
    const agent = await Agent.create({
      name: "docker-agent",
      hardwareUuid: `hw-dk-${Date.now()}`,
      orgId: org._id,
      apiKey: `key-dk-${Date.now()}`,
      sandboxMode: "docker",
    });
    expect(agent.sandboxMode).toBe("docker");
  });

  it("rejects an invalid sandboxMode value", async () => {
    await expect(
      Agent.create({
        name: "bad-agent",
        hardwareUuid: `hw-bad-${Date.now()}`,
        orgId: org._id,
        apiKey: `key-bad-${Date.now()}`,
        sandboxMode: "hypervisor",
      }),
    ).rejects.toThrow();
  });
});

// ─── POST /agents/register — response includes sandboxMode ───────────────────

describe("POST /agents/register", () => {
  it("returns sandboxMode='none' in response for a new agent", async () => {
    const res = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send({ name: "reg-agent", hardwareUuid: `hw-reg-${Date.now()}` });

    expect(res.status).toBe(201);
    expect(res.body.sandboxMode).toBe("none");
  });

  it("returns the agent's existing sandboxMode on re-registration", async () => {
    const hardwareUuid = `hw-rereg-${Date.now()}`;
    await Agent.create({
      name: "rereg-agent",
      hardwareUuid,
      orgId: org._id,
      apiKey: `key-rereg-${Date.now()}`,
      sandboxMode: "namespace",
    });

    const res = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send({ name: "rereg-agent", hardwareUuid });

    expect(res.status).toBe(200);
    expect(res.body.sandboxMode).toBe("namespace");
  });
});

// ─── PATCH /agents/:agentId/permissions — sandboxMode ────────────────────────

describe("PATCH /agents/:agentId/permissions — sandboxMode", () => {
  async function makeAdmin() {
    return User.create({
      username: `admin-${Date.now()}`,
      email: `admin-${Date.now()}@test.com`,
      password: "hashed",
      role: "admin",
      orgId: org._id,
    });
  }

  async function makeAgent(mode = "none") {
    return Agent.create({
      name: `agent-${Date.now()}`,
      hardwareUuid: `hw-${Date.now()}`,
      orgId: org._id,
      apiKey: `key-${Date.now()}`,
      sandboxMode: mode,
    });
  }

  it("admin can set sandboxMode to 'namespace'", async () => {
    const admin = await makeAdmin();
    const agent = await makeAgent("none");

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send({ allowedUsers: [], allowedJobs: [], sandboxMode: "namespace" });

    expect(res.status).toBe(200);
    expect(res.body.sandboxMode).toBe("namespace");

    const updated = await Agent.findById(agent._id);
    expect(updated.sandboxMode).toBe("namespace");
  });

  it("admin can set sandboxMode to 'docker'", async () => {
    const admin = await makeAdmin();
    const agent = await makeAgent("none");

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send({ allowedUsers: [], allowedJobs: [], sandboxMode: "docker" });

    expect(res.status).toBe(200);
    expect(res.body.sandboxMode).toBe("docker");
  });

  it("admin can revert sandboxMode back to 'none'", async () => {
    const admin = await makeAdmin();
    const agent = await makeAgent("namespace");

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send({ allowedUsers: [], allowedJobs: [], sandboxMode: "none" });

    expect(res.status).toBe(200);
    expect(res.body.sandboxMode).toBe("none");
  });

  it("omitting sandboxMode leaves the existing value unchanged", async () => {
    const admin = await makeAdmin();
    const agent = await makeAgent("namespace");

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send({ allowedUsers: [], allowedJobs: [] });

    expect(res.status).toBe(200);
    const updated = await Agent.findById(agent._id);
    expect(updated.sandboxMode).toBe("namespace");
  });

  it("rejects an invalid sandboxMode value with 400", async () => {
    const admin = await makeAdmin();
    const agent = await makeAgent("none");

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", `Bearer ${adminToken(admin)}`)
      .send({ allowedUsers: [], allowedJobs: [], sandboxMode: "hypervisor" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sandboxMode/);
  });

  it("non-admin gets 403", async () => {
    const operator = await User.create({
      username: `op-${Date.now()}`,
      email: `op-${Date.now()}@test.com`,
      password: "hashed",
      role: "operator",
      orgId: org._id,
    });
    const agent = await makeAgent("none");
    const token = signSessionToken(operator);

    const res = await request(app)
      .patch(`/agents/${agent._id}/permissions`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sandboxMode: "namespace" });

    expect(res.status).toBe(403);
  });
});
