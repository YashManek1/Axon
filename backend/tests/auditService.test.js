import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import AuditLog from "../models/auditLog.js";
import Job from "../models/job.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import {
  createAuditRecord,
  getJobHistory,
  updateAuditRecord,
} from "../services/auditService.js";

async function createFixture(prefix = "audit-service") {
  const org = await Organization.create({
    name: `${prefix}-org-${new mongoose.Types.ObjectId()}`,
    description: "Audit test org",
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

function validAuditData({ org, user, job }, overrides = {}) {
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

describe("auditService", () => {
  it("createAuditRecord with valid data creates a document with status PENDING", async () => {
    const fixture = await createFixture();

    const auditRecord = await createAuditRecord(validAuditData(fixture));

    expect(auditRecord).toMatchObject({
      status: "PENDING",
      command: "echo ok",
    });
    expect(auditRecord._id).toBeDefined();
  });

  it("createAuditRecord with missing required fields returns null", async () => {
    await expect(createAuditRecord({ status: "PENDING" })).resolves.toBeNull();
  });

  it("updateAuditRecord can update status, completedAt, and durationMs", async () => {
    const fixture = await createFixture();
    const auditRecord = await createAuditRecord(validAuditData(fixture));
    const completedAt = new Date();

    const updated = await updateAuditRecord(auditRecord._id, {
      status: "COMPLETED",
      completedAt,
      durationMs: 42,
    });

    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt.toISOString()).toBe(completedAt.toISOString());
    expect(updated.durationMs).toBe(42);
  });

  it("updateAuditRecord throws when trying to update jobId", async () => {
    const fixture = await createFixture();
    const auditRecord = await createAuditRecord(validAuditData(fixture));

    await expect(
      updateAuditRecord(auditRecord._id, {
        jobId: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/jobId/);
  });

  it("updateAuditRecord throws when trying to update triggeredBy", async () => {
    const fixture = await createFixture();
    const auditRecord = await createAuditRecord(validAuditData(fixture));

    await expect(
      updateAuditRecord(auditRecord._id, {
        triggeredBy: {
          userId: fixture.user._id,
          ipAddress: "10.0.0.1",
          userAgent: "different",
        },
      }),
    ).rejects.toThrow(/triggeredBy/);
  });

  it("getJobHistory returns results in reverse chronological order", async () => {
    const fixture = await createFixture();
    const older = await createAuditRecord(
      validAuditData(fixture, {
        startedAt: new Date("2025-01-01T00:00:00.000Z"),
      }),
    );
    const newer = await createAuditRecord(
      validAuditData(fixture, {
        startedAt: new Date("2025-01-02T00:00:00.000Z"),
      }),
    );

    const history = await getJobHistory(fixture.job._id, fixture.org._id);

    expect(history.map((record) => record._id.toString())).toEqual([
      newer._id.toString(),
      older._id.toString(),
    ]);
  });

  it("getJobHistory respects the orgId scope", async () => {
    const fixture = await createFixture();
    const otherFixture = await createFixture("other-org");
    await createAuditRecord(validAuditData(fixture));

    const history = await getJobHistory(fixture.job._id, otherFixture.org._id);

    expect(history).toEqual([]);
  });

  it("same jobId in different org scopes only returns the matching org record", async () => {
    const fixture = await createFixture();
    const otherFixture = await createFixture("other-same-job");
    const sameJobId = fixture.job._id;

    const matching = await createAuditRecord(validAuditData(fixture));
    await AuditLog.create(
      validAuditData(otherFixture, {
        jobId: sameJobId,
        orgId: otherFixture.org._id,
      }),
    );

    const history = await getJobHistory(sameJobId, fixture.org._id);

    expect(history).toHaveLength(1);
    expect(history[0]._id.toString()).toBe(matching._id.toString());
  });
});
