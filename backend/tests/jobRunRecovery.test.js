import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import Agent from "../models/agent.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import { createJobRunPreview } from "../services/jobRunPreviewService.js";
import {
  buildQueueData,
  claimRunForDispatch,
  createApprovedShellRun,
  markRunAcknowledged,
  markRunQueued,
  recoverStaleManualRuns,
} from "../services/jobRunService.js";

let org;
let user;
let agent;
let job;

class FakeQueue {
  constructor({ failGet = false, ambiguousAdd = false } = {}) {
    this.jobs = new Map();
    this.addCalls = [];
    this.failGet = failGet;
    this.ambiguousAdd = ambiguousAdd;
  }

  async getJob(jobId) {
    if (this.failGet) throw new Error("queue unavailable");
    return this.jobs.get(String(jobId)) ?? null;
  }

  async add(name, data, options) {
    const jobId = String(options.jobId);
    this.addCalls.push({ name, data, options });
    if (!this.jobs.has(jobId)) {
      this.jobs.set(jobId, { id: jobId, data });
    }
    if (this.ambiguousAdd) throw new Error("response lost after write");
    return this.jobs.get(jobId);
  }
}

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  org = await Organization.create({
    name: `recovery-org-${suffix}`,
    description: "isolated recovery test organization",
  });
  user = await User.create({
    username: `recovery-user-${suffix}`,
    email: `recovery-${suffix}@example.com`,
    password: "hashed",
    role: "operator",
    orgId: org._id,
  });
  agent = await Agent.create({
    name: `recovery-agent-${suffix}`,
    hardwareUuid: `recovery-agent-${suffix}`,
    apiKey: `secret-${suffix}`,
    orgId: org._id,
    status: "online",
    socketId: `socket-${suffix}`,
    allowedCommands: ["echo hello"],
  });
  job = await Job.create({
    userId: user._id,
    orgId: org._id,
    name: "recoverable shell",
    type: "shell",
    schedule: "*/5 * * * *",
    payload: { command: "echo hello" },
    targetAgentId: agent._id,
    actionVersion: "1",
  });
});

async function staleRun(status = "ACCEPTED") {
  const now = Date.now();
  const preview = await createJobRunPreview({
    orgId: org._id,
    actorId: user._id,
    jobId: job._id,
    now,
  });
  const created = await createApprovedShellRun({
    orgId: org._id,
    userId: user._id,
    jobId: job._id,
    requestKey: randomUUID(),
    previewId: preview.previewId,
    previewHash: preview.previewHash,
    ipAddress: "127.0.0.1",
    userAgent: "test",
    now: now + 1_000,
  });
  const queueData = buildQueueData(created.run);
  if (["QUEUED", "DISPATCHING", "ACKNOWLEDGED"].includes(status)) {
    await markRunQueued(created.run.runId);
  }
  if (["DISPATCHING", "ACKNOWLEDGED"].includes(status)) {
    await claimRunForDispatch(queueData);
  }
  if (status === "ACKNOWLEDGED") {
    await markRunAcknowledged(created.run.runId, queueData.attemptId);
  }
  await JobRun.collection.updateOne(
    { runId: created.run.runId },
    { $set: { updatedAt: new Date(0) } },
  );
  return { ...created, queueData };
}

async function recover(queue) {
  return recoverStaleManualRuns(queue, {
    staleBefore: new Date(Date.now() + 1_000),
  });
}

describe("manual JobRun recovery", () => {
  it("re-enqueues a stale ACCEPTED run with its attemptId as the deterministic queue id", async () => {
    const created = await staleRun();
    const queue = new FakeQueue();

    const summary = await recover(queue);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(summary).toMatchObject({ inspected: 1, enqueued: 1, unknown: 0, errors: 0 });
    expect(queue.addCalls).toHaveLength(1);
    expect(queue.addCalls[0].options).toMatchObject({
      jobId: created.queueData.attemptId,
      attempts: 1,
    });
    expect(persisted.status).toBe("QUEUED");
    expect(persisted.transitions.at(-1)).toMatchObject({
      from: "ACCEPTED",
      to: "QUEUED",
      source: "RECOVERY",
      queueJobId: created.queueData.attemptId,
    });
  });

  it("uses queue inspection to resolve an ambiguous add without rejecting the run", async () => {
    const created = await staleRun();
    const queue = new FakeQueue({ ambiguousAdd: true });

    const summary = await recover(queue);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(queue.jobs.has(created.queueData.attemptId)).toBe(true);
    expect(summary).toMatchObject({ enqueued: 1, unknown: 0, errors: 0 });
    expect(persisted.status).toBe("QUEUED");
  });

  it("restores QUEUED when Redis has the deterministic item before Mongo records the transition", async () => {
    const created = await staleRun();
    const queue = new FakeQueue();
    queue.jobs.set(created.queueData.attemptId, {
      id: created.queueData.attemptId,
      data: created.queueData,
    });

    const summary = await recover(queue);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(summary).toMatchObject({ restored: 1, enqueued: 0, unknown: 0, errors: 0 });
    expect(queue.addCalls).toHaveLength(0);
    expect(persisted.status).toBe("QUEUED");
  });

  it("fails closed when queue state cannot be inspected", async () => {
    const created = await staleRun();

    const summary = await recover(new FakeQueue({ failGet: true }));
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(summary).toMatchObject({ unknown: 1, errors: 0 });
    expect(persisted).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "QUEUE_STATE_UNVERIFIABLE",
      requiresReview: true,
    });
    expect(persisted.terminalSummary.reasonCode).toBe("QUEUE_STATE_UNVERIFIABLE");
  });

  it("marks a stale QUEUED run UNKNOWN when its queue item is missing and never replays it", async () => {
    const created = await staleRun("QUEUED");
    const queue = new FakeQueue();

    const summary = await recover(queue);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(summary).toMatchObject({ unknown: 1, errors: 0 });
    expect(queue.addCalls).toHaveLength(0);
    expect(persisted).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "QUEUE_ITEM_MISSING",
      requiresReview: true,
    });
  });

  it.each(["DISPATCHING", "ACKNOWLEDGED"])(
    "marks stale %s UNKNOWN when execution evidence is missing and never replays it",
    async (status) => {
      const created = await staleRun(status);
      const queue = new FakeQueue();

      await recover(queue);
      const persisted = await JobRun.findOne({ runId: created.run.runId });

      expect(queue.addCalls).toHaveLength(0);
      expect(persisted).toMatchObject({
        status: "UNKNOWN",
        reasonCode: "EXECUTION_EVIDENCE_MISSING",
        requiresReview: true,
      });
    },
  );

  it("keeps concurrent recovery idempotent with one deterministic queue item and one state transition", async () => {
    const created = await staleRun();
    const queue = new FakeQueue();

    await Promise.all([recover(queue), recover(queue)]);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(queue.jobs.size).toBe(1);
    expect(queue.jobs.has(created.queueData.attemptId)).toBe(true);
    expect(persisted.transitions.filter((entry) => entry.to === "QUEUED")).toHaveLength(1);
  });

  it("fails a legacy ACCEPTED record closed when its queue identity is inconsistent", async () => {
    const created = await staleRun();
    await JobRun.collection.updateOne(
      { runId: created.run.runId },
      { $set: { queueJobId: `legacy-${created.queueData.attemptId}`, updatedAt: new Date(0) } },
    );
    const queue = new FakeQueue();

    const summary = await recover(queue);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(summary).toMatchObject({ unknown: 1, errors: 0 });
    expect(queue.addCalls).toHaveLength(0);
    expect(persisted).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "DISPATCH_INTENT_INVALID",
      requiresReview: true,
    });
  });

  it("fails a legacy ACCEPTED record closed when immutable dispatch fields are incomplete", async () => {
    const created = await staleRun();
    await JobRun.collection.updateOne(
      { runId: created.run.runId },
      { $unset: { "action.actionVersion": "" }, $set: { updatedAt: new Date(0) } },
    );
    const queue = new FakeQueue();

    const summary = await recover(queue);
    const persisted = await JobRun.findOne({ runId: created.run.runId });

    expect(summary).toMatchObject({ unknown: 1, errors: 0 });
    expect(queue.addCalls).toHaveLength(0);
    expect(persisted).toMatchObject({
      status: "UNKNOWN",
      reasonCode: "DISPATCH_INTENT_INVALID",
      requiresReview: true,
    });
  });
});
