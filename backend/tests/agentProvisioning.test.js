import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "../models/agent.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { requestId } from "../middleware/requestId.js";
import agentProvisioningRoutes from "../routes/agentProvisioningR.js";
import { signSessionToken } from "../controllers/userC.js";

const app = express();

app.use(express.json());
app.use(requestId);
app.set("io", {
  sockets: {
    sockets: new Map(),
  },
});
app.use("/agents", agentProvisioningRoutes);

let org;
let adminUser;
let regularUser;
let orgApiKey;

async function createUser(role, suffix) {
  return User.create({
    username: `${role}-${suffix}`,
    email: `${role}-${suffix}@example.com`,
    password: "hashed-password",
    role,
    orgId: org._id,
  });
}

function authHeader(user) {
  return `Bearer ${signSessionToken(user)}`;
}

function validRegistrationBody(overrides = {}) {
  return {
    name: "build-agent-01",
    hardwareUuid: "machine-uuid-01",
    ...overrides,
  };
}

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const keyId = "0123456789abcdef";
  const secret = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo";
  orgApiKey = `axk_${keyId}_${secret}`;
  org = await Organization.create({
    name: `provisioning-org-${suffix}`,
    description: "Provisioning test org",
    apiKeys: [
      {
        keyId,
        hash: await bcrypt.hash(secret, 10),
        label: "test-key",
        createdBy: null, // Will set after creating user
        createdAt: new Date(),
      },
    ],
  });
  adminUser = await createUser("admin", suffix);
  regularUser = await createUser("user", suffix);
});

describe("agent provisioning routes", () => {
  it("POST /agents/register without API key header returns 401", async () => {
    const response = await request(app)
      .post("/agents/register")
      .send(validRegistrationBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Invalid organization API key" });
  });

  it("POST /agents/register with invalid API key returns 401", async () => {
    const response = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", "wrong-key")
      .send(validRegistrationBody());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Invalid organization API key" });
  });

  it("POST /agents/register with valid API key and new agent returns 201 with shortToken", async () => {
    const response = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      agentId: expect.any(String),
      apiKey: expect.any(String),
      shortToken: expect.any(String),
      sandboxMode: expect.any(String),
      instructions: "Set AGENT_ID and AGENT_API_KEY in your .env file",
    });
    expect(response.body.apiKey).toHaveLength(64);

    const agent = await Agent.findById(response.body.agentId);
    expect(agent).toEqual(expect.objectContaining({
      name: "build-agent-01",
      hardwareUuid: "machine-uuid-01",
    }));
    expect(agent.tokenIssuedAt).toBeInstanceOf(Date);
    expect(agent.tokenExpiry).toBeInstanceOf(Date);
    await expect(agent.matchApiKey(response.body.apiKey)).resolves.toBe(true);
  });

  it("POST /agents/register with same hardwareUuid again returns same agentId with fresh shortToken", async () => {
    const first = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());

    const second = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());

    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      agentId: first.body.agentId,
      apiKey: null,
      shortToken: expect.any(String),
      sandboxMode: expect.any(String),
      instructions: "Set AGENT_ID and AGENT_API_KEY in your .env file",
    });
  });

  it("POST /agents/register with same hardwareUuid but different name returns same agentId and does not update name", async () => {
    const first = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());

    const second = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody({ name: "renamed-agent" }));

    const agent = await Agent.findById(first.body.agentId);

    expect(second.status).toBe(200);
    expect(second.body.agentId).toBe(first.body.agentId);
    expect(agent.name).toBe("build-agent-01");
  });

  it("POST /agents/:id/rotate-key without admin returns 403", async () => {
    const created = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());

    const response = await request(app)
      .post(`/agents/${created.body.agentId}/rotate-key`)
      .set("Authorization", authHeader(regularUser));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: "Admin privileges required" });
  });

  it("POST /agents/:id/rotate-key with admin returns new key and rejects old key through auth matcher", async () => {
    const created = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());

    const response = await request(app)
      .post(`/agents/${created.body.agentId}/rotate-key`)
      .set("Authorization", authHeader(adminUser));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      agentId: created.body.agentId,
      apiKey: expect.any(String),
    });
    expect(response.body.apiKey).not.toBe(created.body.apiKey);

    const agent = await Agent.findById(created.body.agentId);
    await expect(agent.matchApiKey(created.body.apiKey)).resolves.toBe(false);
    await expect(agent.matchApiKey(response.body.apiKey)).resolves.toBe(true);
  });

  it("DELETE /agents/:id returns 200 and sets decommissionedAt", async () => {
    const disconnect = vi.fn();
    app.set("io", {
      sockets: {
        sockets: new Map([
          ["socket-1", { agentId: null, disconnect }],
        ]),
      },
    });
    const created = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", orgApiKey)
      .send(validRegistrationBody());
    app.get("io").sockets.sockets.get("socket-1").agentId = created.body.agentId;
    await Agent.findByIdAndUpdate(created.body.agentId, { socketId: "socket-1" });

    const response = await request(app)
      .delete(`/agents/${created.body.agentId}`)
      .set("Authorization", authHeader(adminUser));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      agentId: created.body.agentId,
      decommissionedAt: expect.any(String),
    });

    const agent = await Agent.findById(created.body.agentId);
    expect(agent.decommissionedAt).toBeInstanceOf(Date);
    expect(disconnect).toHaveBeenCalledWith(true);
  });
});
