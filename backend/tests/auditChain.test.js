import mongoose from "mongoose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import AuditLog from "../models/auditLog.js";
import Job from "../models/job.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";

let createAuditRecord;
let verifyOrgChain;
let mockRedis;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  mockRedis = new Redis();

  vi.doMock("../config/queue.js", () => ({ redisConnection: mockRedis }));

  const svc = await import("../services/auditService.js");
  createAuditRecord = svc.createAuditRecord;
  verifyOrgChain = svc.verifyOrgChain;
});

beforeEach(async () => {
  await mockRedis.flushall();
});

async function makeFixture(prefix) {
  const org = await Organization.create({
    name: `${prefix}-org-${new mongoose.Types.ObjectId()}`,
    description: "chain test org",
  });
  const user = await User.create({
    username: `${prefix}-user-${new mongoose.Types.ObjectId()}`,
    email: `${new mongoose.Types.ObjectId()}@example.com`,
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

function auditData({ org, user, job }, overrides = {}) {
  return {
    jobId: job._id,
    orgId: org._id,
    triggeredBy: {
      userId: user._id,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    },
    triggerType: "SCHEDULED",
    command: "echo ok",
    status: "PENDING",
    ...overrides,
  };
}

describe("audit hash-chain", () => {
  it("empty chain returns valid with checkedCount 0", async () => {
    const { org } = await makeFixture("chain-empty");

    const result = await verifyOrgChain(org._id);

    expect(result).toEqual({ valid: true, brokenAt: null, checkedCount: 0 });
  });

  it("single record chain is valid", async () => {
    const fixture = await makeFixture("chain-single");
    await createAuditRecord(auditData(fixture));

    const result = await verifyOrgChain(fixture.org._id);

    expect(result).toMatchObject({ valid: true, brokenAt: null, checkedCount: 1 });
  });

  it("keeps legacy records with agentId on the original canonical format", async () => {
    const fixture = await makeFixture("chain-legacy-agent");
    const record = await createAuditRecord(
      auditData(fixture, { agentId: new mongoose.Types.ObjectId() }),
    );
    expect(record.canonicalVersion).toBeUndefined();
    await expect(verifyOrgChain(fixture.org._id)).resolves.toMatchObject({
      valid: true,
      checkedCount: 1,
    });
  });

  it("hashes v2 run identity and detects later runId tampering", async () => {
    const fixture = await makeFixture("chain-v2-identity");
    const record = await createAuditRecord(
      auditData(fixture, {
        runId: "11111111-1111-4111-8111-111111111111",
        attemptId: "22222222-2222-4222-8222-222222222222",
      }),
    );
    expect(record.canonicalVersion).toBe(2);
    await AuditLog.collection.updateOne(
      { _id: record._id },
      { $set: { runId: "33333333-3333-4333-8333-333333333333" } },
    );
    await expect(verifyOrgChain(fixture.org._id)).resolves.toMatchObject({ valid: false });
  });

  it("multi-record chain links via prevHash and verifies clean", async () => {
    const fixture = await makeFixture("chain-multi");

    const r1 = await createAuditRecord(auditData(fixture));
    const r2 = await createAuditRecord(auditData(fixture));
    const r3 = await createAuditRecord(auditData(fixture));

    expect(r1.prevHash).toBe("0".repeat(64));
    expect(r2.prevHash).toBe(r1.recordHash);
    expect(r3.prevHash).toBe(r2.recordHash);

    const result = await verifyOrgChain(fixture.org._id);

    expect(result).toMatchObject({ valid: true, brokenAt: null, checkedCount: 3 });
  });

  it("tampering recordHash in Mongo causes verify-chain to return invalid at the tampered record", async () => {
    const fixture = await makeFixture("chain-tamper-hash");

    const r1 = await createAuditRecord(auditData(fixture));
    await createAuditRecord(auditData(fixture));

    await AuditLog.collection.updateOne(
      { _id: r1._id },
      { $set: { recordHash: "deadbeef".repeat(8) } },
    );

    const result = await verifyOrgChain(fixture.org._id);

    expect(result.valid).toBe(false);
    expect(result.brokenAt.toString()).toBe(r1._id.toString());
    expect(result.checkedCount).toBe(1);
  });

  // Previously this tampered `status`. That was wrong: status legitimately moves
  // PENDING -> COMPLETED when a job finishes, so requiring it to be tamper-evident
  // forced the hash to cover a mutable field and every completed job reported the
  // chain as broken. `command` is the right target — it never changes after
  // creation, and rewriting it is the attack the audit log exists to detect.
  it("tampering a canonical field in Mongo causes verify-chain to return invalid", async () => {
    const fixture = await makeFixture("chain-tamper-field");

    const r1 = await createAuditRecord(auditData(fixture));
    await createAuditRecord(auditData(fixture));

    await AuditLog.collection.updateOne(
      { _id: r1._id },
      { $set: { command: "rm -rf / # rewritten after the fact" } },
    );

    const result = await verifyOrgChain(fixture.org._id);

    expect(result.valid).toBe(false);
    expect(result.brokenAt.toString()).toBe(r1._id.toString());
  });

  it("tampering prevHash in Mongo causes verify-chain to return invalid at the tampered record", async () => {
    const fixture = await makeFixture("chain-tamper-prev");

    await createAuditRecord(auditData(fixture));
    const r2 = await createAuditRecord(auditData(fixture));

    await AuditLog.collection.updateOne(
      { _id: r2._id },
      { $set: { prevHash: "0".repeat(64) } },
    );

    const result = await verifyOrgChain(fixture.org._id);

    expect(result.valid).toBe(false);
    expect(result.brokenAt.toString()).toBe(r2._id.toString());
  });

  it("chain of org A is unaffected by records in org B", async () => {
    const fixtureA = await makeFixture("chain-isolation-a");
    const fixtureB = await makeFixture("chain-isolation-b");

    await createAuditRecord(auditData(fixtureA));
    await createAuditRecord(auditData(fixtureA));
    await createAuditRecord(auditData(fixtureB));

    const resultA = await verifyOrgChain(fixtureA.org._id);
    const resultB = await verifyOrgChain(fixtureB.org._id);

    expect(resultA).toMatchObject({ valid: true, checkedCount: 2 });
    expect(resultB).toMatchObject({ valid: true, checkedCount: 1 });
  });

  it("cold-start (Redis flushed mid-session) rebuilds chain head from DB", async () => {
    const fixture = await makeFixture("chain-coldstart");

    const r1 = await createAuditRecord(auditData(fixture));

    await mockRedis.flushall();

    const r2 = await createAuditRecord(auditData(fixture));

    expect(r2.prevHash).toBe(r1.recordHash);

    const result = await verifyOrgChain(fixture.org._id);

    expect(result).toMatchObject({ valid: true, checkedCount: 2 });
  });
});
