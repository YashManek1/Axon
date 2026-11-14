import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/queue.js", () => {
  const store = new Map();
  return {
    redisConnection: {
      get: vi.fn(async (key) => store.get(key) ?? null),
      set: vi.fn(async (key, val) => {
        store.set(key, val);
        return "OK";
      }),
    },
    scheduledJobsQueue: { add: vi.fn() },
    immediateJobsQueue: { add: vi.fn() },
  };
});
import Agent from "../models/agent.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { requestId } from "../middleware/requestId.js";
import adminRoutes from "../routes/adminR.js";
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
app.use("/admin", adminRoutes);
app.use("/agents", agentProvisioningRoutes);

let org1;
let org2;
let adminUser1;
let adminUser2;
let operatorUser1;

async function createUser(role, orgId, suffix) {
  return User.create({
    username: `${role}-${suffix}`,
    email: `${role}-${suffix}@example.com`,
    password: "hashed-password",
    role,
    orgId,
  });
}

function authHeader(user) {
  return `Bearer ${signSessionToken(user)}`;
}

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;

  org1 = await Organization.create({
    name: `org1-${suffix}`,
    description: "Organization 1",
  });

  org2 = await Organization.create({
    name: `org2-${suffix}`,
    description: "Organization 2",
  });

  adminUser1 = await createUser("admin", org1._id, `org1-${suffix}`);
  adminUser2 = await createUser("admin", org2._id, `org2-${suffix}`);
  operatorUser1 = await createUser("operator", org1._id, `operator-${suffix}`);
});

describe("org API key management", () => {
  it("POST /admin/org/api-keys creates a key and returns plaintext once", async () => {
    const response = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "production-key" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      apiKey: expect.stringMatching(/^axk_[0-9a-f]{16}_[A-Za-z0-9_-]+$/),
      keyId: expect.stringMatching(/^[0-9a-f]{16}$/),
      label: "production-key",
      createdAt: expect.any(String),
      message: expect.stringContaining("Save it now"),
    });

    const apiKey = response.body.apiKey;

    // Verify org has the key stored (with hash, not plaintext)
    const updatedOrg = await Organization.findById(org1._id);
    expect(updatedOrg.apiKeys).toHaveLength(1);
    expect(updatedOrg.apiKeys[0].keyId).toBe(response.body.keyId);
    expect(updatedOrg.apiKeys[0].label).toBe("production-key");
    expect(updatedOrg.apiKeys[0].hash).toBeDefined();

    // Extract the secret from the wire format: axk_<keyId>_<secret>
    const parts = apiKey.split("_");
    const secret = parts.slice(2).join("_"); // Handle any underscores in base64url
    const isMatch = await bcrypt.compare(secret, updatedOrg.apiKeys[0].hash);
    expect(isMatch).toBe(true);
  });

  it("GET /admin/org/api-keys lists metadata only (no secrets or hashes)", async () => {
    // Create a key first
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "key1" });

    expect(createRes.status).toBe(201);

    // List keys
    const listRes = await request(app)
      .get("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1));

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.apiKeys).toHaveLength(1);
    expect(listRes.body.apiKeys[0]).toEqual({
      keyId: expect.any(String),
      label: "key1",
      createdAt: expect.any(String),
      createdBy: expect.any(String),
      lastUsedAt: undefined,
      revokedAt: undefined,
    });

    // Ensure no secret or hash in response
    expect(listRes.body.apiKeys[0]).not.toHaveProperty("hash");
    expect(listRes.body.apiKeys[0]).not.toHaveProperty("secret");
  });

  it("DELETE /admin/org/api-keys/:keyId revokes a key (soft delete)", async () => {
    // Create a key
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "revoke-test" });

    const keyId = createRes.body.keyId;

    // Revoke it
    const revokeRes = await request(app)
      .delete(`/admin/org/api-keys/${keyId}`)
      .set("Authorization", authHeader(adminUser1));

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body).toEqual({
      success: true,
      message: "API key revoked successfully",
      keyId,
      revokedAt: expect.any(String),
    });

    // Verify key is soft-deleted (revokedAt is set)
    const updatedOrg = await Organization.findById(org1._id);
    const revokedKey = updatedOrg.apiKeys.find((k) => k.keyId === keyId);
    expect(revokedKey.revokedAt).toBeDefined();
  });

  it("DELETE /admin/org/api-keys/:keyId with invalid keyId returns 404", async () => {
    const response = await request(app)
      .delete("/admin/org/api-keys/nonexistent")
      .set("Authorization", authHeader(adminUser1));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "API key not found or already revoked",
    });
  });

  it("Cross-org isolation: user1 cannot list/revoke org2's keys", async () => {
    // Create key in org2
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser2))
      .send({ label: "org2-key" });

    const keyId = createRes.body.keyId;

    // Try to list org2's keys as user1 (should only see org1's keys)
    const listRes = await request(app)
      .get("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1));

    expect(listRes.status).toBe(200);
    expect(listRes.body.apiKeys).toHaveLength(0); // org1 has no keys

    // Try to revoke org2's key as user1 (should fail)
    const revokeRes = await request(app)
      .delete(`/admin/org/api-keys/${keyId}`)
      .set("Authorization", authHeader(adminUser1));

    expect(revokeRes.status).toBe(404);
  });

  it("Revoked key is rejected by agent registration", async () => {
    // Create and revoke a key
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "revoked-test" });

    const apiKey = createRes.body.apiKey;

    // Revoke it
    await request(app)
      .delete(`/admin/org/api-keys/${createRes.body.keyId}`)
      .set("Authorization", authHeader(adminUser1));

    // Try to register agent with revoked key
    const agentRes = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", apiKey)
      .send({
        name: "test-agent",
        hardwareUuid: "uuid-123",
      });

    expect(agentRes.status).toBe(401);
    expect(agentRes.body).toEqual({ message: "Invalid organization API key" });
  });

  it("Agent registration with generated key succeeds and updates lastUsedAt", async () => {
    // Create a key
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "agent-registration-key" });

    const apiKey = createRes.body.apiKey;

    // Wait a moment to ensure time difference is visible
    await new Promise((r) => setTimeout(r, 100));

    // Register agent with key
    const agentRes = await request(app)
      .post("/agents/register")
      .set("X-Axon-API-Key", apiKey)
      .send({
        name: "test-agent",
        hardwareUuid: "uuid-456",
      });

    expect(agentRes.status).toBe(201);
    expect(agentRes.body).toEqual({
      agentId: expect.any(String),
      apiKey: expect.any(String),
      shortToken: expect.any(String),
      sandboxMode: expect.any(String),
      instructions: expect.any(String),
    });

    // Verify agent was created in the correct org
    const agent = await Agent.findById(agentRes.body.agentId);
    expect(agent.orgId.toString()).toBe(org1._id.toString());

    // Verify lastUsedAt was updated (eventually, via setImmediate)
    await new Promise((r) => setTimeout(r, 200));
    const updatedOrg = await Organization.findById(org1._id);
    const key = updatedOrg.apiKeys.find((k) => k.keyId === createRes.body.keyId);
    expect(key.lastUsedAt).toBeDefined();
  });

  it("POST /admin/org/api-keys without label returns 400", async () => {
    const response = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("label");
  });

  it("POST /admin/org/api-keys with empty label returns 400", async () => {
    const response = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "   " });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("operator receives 403 on POST /admin/org/api-keys (privilege escalation regression test)", async () => {
    const response = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(operatorUser1))
      .send({ label: "malicious-key" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin privileges required");
  });

  it("operator receives 403 on GET /admin/org/api-keys (privilege escalation regression test)", async () => {
    const response = await request(app)
      .get("/admin/org/api-keys")
      .set("Authorization", authHeader(operatorUser1));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin privileges required");
  });

  it("operator receives 403 on DELETE /admin/org/api-keys/:keyId (privilege escalation regression test)", async () => {
    // Create a key as admin
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "key-to-revoke" });

    const keyId = createRes.body.keyId;

    // Try to revoke as operator
    const response = await request(app)
      .delete(`/admin/org/api-keys/${keyId}`)
      .set("Authorization", authHeader(operatorUser1));

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Admin privileges required");
  });

  it("admin receives 200/201 on all three endpoints", async () => {
    // POST - create
    const createRes = await request(app)
      .post("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1))
      .send({ label: "admin-key" });
    expect(createRes.status).toBe(201);

    // GET - list
    const listRes = await request(app)
      .get("/admin/org/api-keys")
      .set("Authorization", authHeader(adminUser1));
    expect(listRes.status).toBe(200);

    // DELETE - revoke
    const revokeRes = await request(app)
      .delete(`/admin/org/api-keys/${createRes.body.keyId}`)
      .set("Authorization", authHeader(adminUser1));
    expect(revokeRes.status).toBe(200);
  });
});
