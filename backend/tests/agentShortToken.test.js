import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "../models/agent.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import agentProvisioningRoutes from "../routes/agentProvisioningR.js";
import { issueAgentToken } from "../controllers/agentProvisioningC.js";
import { signSessionToken } from "../controllers/userC.js";

const app = express();
app.use(express.json());
app.set("io", { sockets: { sockets: new Map() } });
app.use("/agents", agentProvisioningRoutes);

let org;
let orgApiKey;
let admin;

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const keyId = "0123456789abcdef";
  const secret = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo";
  orgApiKey = `axk_${keyId}_${secret}`;
  org = await Organization.create({
    name: `short-token-org-${suffix}`,
    description: "Short token test org",
    apiKeys: [
      {
        keyId,
        hash: await bcrypt.hash(secret, 10),
        label: "test-key",
        createdAt: new Date(),
      },
    ],
  });
  admin = await User.create({
    username: `agent-token-admin-${suffix}`,
    email: `agent-token-admin-${suffix}@example.com`,
    password: "hashed-password",
    role: "admin",
    orgId: org._id,
  });
});

async function registerAgent(name = "token-test-agent", uuid = null) {
  const hardwareUuid = uuid ?? `uuid-${Date.now()}-${Math.random()}`;
  return request(app)
    .post("/agents/register")
    .set("X-Axon-API-Key", orgApiKey)
    .send({ name, hardwareUuid });
}

describe("token issuance on registration", () => {
  it("201 response includes a valid short-lived JWT", async () => {
    const res = await registerAgent();
    expect(res.status).toBe(201);
    expect(res.body.shortToken).toBeTruthy();

    const payload = jwt.decode(res.body.shortToken);
    expect(payload.type).toBe("agent-token");
    expect(payload.agentId).toBe(res.body.agentId);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("re-registration issues a fresh shortToken (apiKey stays null)", async () => {
    const sharedUuid = `uuid-stable-${Date.now()}`;
    const first = await registerAgent("token-test-agent", sharedUuid);
    await new Promise((r) => setTimeout(r, 10)); // ensure iat differs
    const second = await registerAgent("token-test-agent", sharedUuid);

    expect(second.status).toBe(200);
    expect(second.body.apiKey).toBeNull();
    expect(second.body.shortToken).toBeTruthy();
    expect(second.body.shortToken).not.toBe(first.body.shortToken);
  });

  it("agent.tokenIssuedAt and tokenExpiry are set after registration", async () => {
    const res = await registerAgent();
    const agent = await Agent.findById(res.body.agentId);
    expect(agent.tokenIssuedAt).toBeInstanceOf(Date);
    expect(agent.tokenExpiry).toBeInstanceOf(Date);
    expect(agent.tokenExpiry.getTime() - agent.tokenIssuedAt.getTime()).toBeCloseTo(15 * 60 * 1000, -3);
  });
});

describe("POST /agents/refresh-token", () => {
  it("returns 401 with no Authorization header", async () => {
    const res = await request(app).post("/agents/refresh-token");
    expect(res.status).toBe(401);
  });

  it("returns 401 with a real human session token", async () => {
    const userToken = signSessionToken(admin);
    const res = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with a token expired beyond 1-min grace", async () => {
    const regRes = await registerAgent();
    const agentId = regRes.body.agentId;
    const agent = await Agent.findById(agentId);

    const expiredToken = jwt.sign(
      {
        type: "agent-token",
        agentId,
        orgId: agent.orgId.toString(),
        iat: Math.floor(Date.now() / 1000) - 16 * 60,
        exp: Math.floor(Date.now() / 1000) - 61,
      },
      process.env.JWT_SECRET,
      { algorithm: "HS256" },
    );

    const res = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token expired");
  });

  it("returns 200 with a fresh shortToken for a valid token", async () => {
    const regRes = await registerAgent();
    const { shortToken } = regRes.body;

    const res = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${shortToken}`);

    expect(res.status).toBe(200);
    expect(res.body.shortToken).toBeTruthy();
    expect(res.body.shortToken).not.toBe(shortToken);

    const payload = jwt.decode(res.body.shortToken);
    expect(payload.type).toBe("agent-token");
    expect(payload.agentId).toBe(regRes.body.agentId);
  });

  it("accepts a token within the 1-min grace window past expiry", async () => {
    const regRes = await registerAgent();
    const agentId = regRes.body.agentId;
    const agent = await Agent.findById(agentId);

    const nearlyExpiredToken = jwt.sign(
      {
        type: "agent-token",
        agentId,
        orgId: agent.orgId.toString(),
        iat: Math.floor(Date.now() / 1000) - 15 * 60 - 30,
        exp: Math.floor(Date.now() / 1000) - 30,
      },
      process.env.JWT_SECRET,
      { algorithm: "HS256" },
    );

    const res = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${nearlyExpiredToken}`);

    expect(res.status).toBe(200);
    expect(res.body.shortToken).toBeTruthy();
  });

  it("updates tokenIssuedAt and tokenExpiry on refresh", async () => {
    const regRes = await registerAgent();
    const agentId = regRes.body.agentId;
    const agentBefore = await Agent.findById(agentId);
    const issuedBefore = agentBefore.tokenIssuedAt.getTime();

    await new Promise((r) => setTimeout(r, 10));

    await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${regRes.body.shortToken}`);

    const agentAfter = await Agent.findById(agentId);
    expect(agentAfter.tokenIssuedAt.getTime()).toBeGreaterThan(issuedBefore);
  });

  it("allows concurrent refreshes while the agent identity remains current", async () => {
    const registration = await registerAgent();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app)
          .post("/agents/refresh-token")
          .set("Authorization", `Bearer ${registration.body.shortToken}`),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(responses.map((response) => response.body.shortToken)).size).toBe(4);
  });

  it("rejects refresh from a token invalidated by key rotation", async () => {
    const registration = await registerAgent();
    const rotation = await request(app)
      .post(`/agents/${registration.body.agentId}/rotate-key`)
      .set("Authorization", `Bearer ${signSessionToken(admin)}`);
    const refresh = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${registration.body.shortToken}`);

    expect(rotation.status).toBe(200);
    expect(refresh.status).toBe(401);
    expect(refresh.body).toEqual({ message: "Invalid token" });
  });

  it("rejects refresh from a token invalidated by decommissioning", async () => {
    const registration = await registerAgent();
    const decommission = await request(app)
      .delete(`/agents/${registration.body.agentId}`)
      .set("Authorization", `Bearer ${signSessionToken(admin)}`);
    const refresh = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${registration.body.shortToken}`);

    expect(decommission.status).toBe(200);
    expect(refresh.status).toBe(401);
    expect(refresh.body).toEqual({ message: "Invalid token" });
  });

  it("refreshes a legacy agent document with no tokenVersion and stamps it", async () => {
    const inserted = await Agent.collection.insertOne({
      name: "legacy-agent",
      hardwareUuid: `legacy-${Date.now()}-${Math.random()}`,
      orgId: org._id,
      apiKey: await bcrypt.hash("legacy-key", 10),
      status: "offline",
    });
    const legacyAgent = await Agent.findById(inserted.insertedId);
    const token = issueAgentToken(legacyAgent);

    const response = await request(app)
      .post("/agents/refresh-token")
      .set("Authorization", `Bearer ${token}`);
    const updated = await Agent.findById(inserted.insertedId);

    expect(response.status).toBe(200);
    expect(updated.tokenIssuedAt).toBeInstanceOf(Date);
    expect(updated.tokenExpiry).toBeInstanceOf(Date);
    expect(updated.tokenVersion ?? 0).toBe(0);
  });

  it("does not return a refreshed token when a legacy agent rotates during stamping", async () => {
    const inserted = await Agent.collection.insertOne({
      name: "legacy-race-agent",
      hardwareUuid: `legacy-race-${Date.now()}-${Math.random()}`,
      orgId: org._id,
      apiKey: await bcrypt.hash("legacy-race-key", 10),
      status: "offline",
    });
    const legacyAgent = await Agent.findById(inserted.insertedId);
    const token = issueAgentToken(legacyAgent);
    const originalUpdateOne = Agent.updateOne.bind(Agent);
    let releaseStamp;
    let signalStamp;
    const stampReached = new Promise((resolve) => {
      signalStamp = resolve;
    });
    const stampRelease = new Promise((resolve) => {
      releaseStamp = resolve;
    });
    const updateSpy = vi.spyOn(Agent, "updateOne").mockImplementation(
      async (filter, update, options) => {
        if (update?.$set?.tokenIssuedAt && String(filter?._id) === String(inserted.insertedId)) {
          signalStamp();
          await stampRelease;
        }
        return originalUpdateOne(filter, update, options);
      },
    );

    try {
      const refreshPromise = request(app)
        .post("/agents/refresh-token")
        .set("Authorization", `Bearer ${token}`)
        .then((response) => response);
      await stampReached;
      await Agent.collection.updateOne(
        { _id: inserted.insertedId },
        { $inc: { tokenVersion: 1 } },
      );
      releaseStamp();
      const response = await refreshPromise;

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: "Invalid token" });
    } finally {
      releaseStamp();
      updateSpy.mockRestore();
    }
  });
});
