import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agent from "../models/agent.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import JobRunPreview from "../models/jobRunPreview.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import {
  createJobRunPreview,
  ensureApprovalIndexes,
  hashApprovalSnapshot,
  serializeApprovalSnapshot,
  validateApprovalForDispatch,
} from "../services/jobRunPreviewService.js";
import {
  buildQueueData,
  createApprovedShellRun,
  recoverStaleManualRuns,
} from "../services/jobRunService.js";

const NOW = 1_900_000_000_000;
const launchMocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn(), setState: vi.fn() }));
vi.mock("../config/queue.js", () => ({
  immediateJobsQueue: { add: launchMocks.add, getJob: launchMocks.getJob },
  scheduledJobsQueue: {},
}));
vi.mock("../services/dagStateManager.js", () => ({ setJobState: launchMocks.setState }));
import { runJobNow } from "../controllers/jobC.js";
const GOLDEN_SERIALIZED = "[1,\"preview-1\",\"org-1\",\"actor-1\",\"job-1\",1000,2000,[\"job-1\",\"Deploy\",\"agent-1\",\"edge-1\",\"echo ok\",\"action-hash\",30000,65536,\"release-1\",[false,true,[\"ops@example.com\"]]],\"pilot\",2,\"MANUAL_API\",0,\"operator\",\"owner-1\",[\"actor-1\"],[\"operator\"],\"shell\",\"agent-1\",\"echo ok\",30000,65536,true,\"active\",\"*/5 * * * *\",\"Cron\",\"UTC\",[false,\"00:00\",\"23:59\",[\"M\"]],0,[],null,[null,null,null,null,[],\"AES-256-GCM\"],0,null,[\"actor-1\"],[\"job-1\"],[\"echo ok\"],\"none\"]";
const GOLDEN_HASH = "65ae2d04d8e60a2d031b1e50d486683761aa31f69016c8499698ba77d0bcfd6d";

let org;
let user;
let agent;
let job;

beforeEach(async () => {
  launchMocks.add.mockReset().mockResolvedValue({ id: "queued" });
  launchMocks.getJob.mockReset().mockResolvedValue(null);
  launchMocks.setState.mockReset().mockResolvedValue(undefined);
  const suffix = `${Date.now()}-${Math.random()}`;
  org = await Organization.create({
    name: `approval-org-${suffix}`,
    description: "isolated server-bound approval test",
  });
  user = await User.create({
    username: `approval-user-${suffix}`,
    email: `approval-${suffix}@example.com`,
    password: "hashed",
    role: "operator",
    orgId: org._id,
  });
  agent = await Agent.create({
    name: `approval-agent-${suffix}`,
    hardwareUuid: `approval-agent-${suffix}`,
    apiKey: `approval-secret-${suffix}`,
    orgId: org._id,
    status: "online",
    socketId: `approval-socket-${suffix}`,
    allowedCommands: ["echo hello"],
  });
  job = await Job.create({
    userId: user._id,
    orgId: org._id,
    name: "approval-bound shell",
    type: "shell",
    schedule: "*/5 * * * *",
    payload: { command: "echo hello" },
    targetAgentId: agent._id,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function preview() {
  return createJobRunPreview({
    orgId: org._id,
    actorId: user._id,
    jobId: job._id,
    now: NOW,
  });
}

async function accept(createdPreview, requestKey = randomUUID(), overrides = {}) {
  return createApprovedShellRun({
    orgId: org._id,
    userId: user._id,
    jobId: job._id,
    requestKey,
    previewId: createdPreview.previewId,
    previewHash: createdPreview.previewHash,
    ipAddress: "127.0.0.1",
    userAgent: "approval-test",
    now: NOW + 1_000,
    ...overrides,
  });
}

function cloneWithIdentity(definition, { requestKey, previewId }) {
  const clone = JSON.parse(JSON.stringify(definition));
  const runId = randomUUID();
  const attemptId = randomUUID();
  clone.runId = runId;
  clone.queueJobId = attemptId;
  clone.requestKey = requestKey;
  clone.requestFingerprint = `different-${randomUUID()}`;
  clone.approval.previewId = previewId;
  clone.transitions[0].queueJobId = attemptId;
  clone.transitions[0].attemptId = attemptId;
  clone.attempts[0].attemptId = attemptId;
  clone.attempts[0].targetExecutionId = randomUUID();
  clone.attempts[0].operationId = randomUUID();
  return clone;
}

describe("approval canonicalization and index gate", () => {
  it("matches the fixed-order golden serialization vector", () => {
    const snapshot = {
      previewVersion: 1,
      previewId: "preview-1",
      orgId: "org-1",
      actorId: "actor-1",
      jobId: "job-1",
      issuedAt: 1000,
      expiresAt: 2000,
      preview: {
        jobId: "job-1",
        jobName: "Deploy",
        targetAgentId: "agent-1",
        targetLabel: "edge-1",
        command: "echo ok",
        actionVersion: "action-hash",
        timeoutMs: 30_000,
        maxOutputBytes: 65_536,
        requiredReleaseId: "release-1",
        notifications: {
          onSuccess: false,
          onFailure: true,
          recipients: ["ops@example.com"],
        },
      },
      material: {
        executionProfile: "pilot",
        protocolVersion: 2,
        triggerType: "MANUAL_API",
        automaticRetryCount: 0,
        actor: { role: "operator" },
        job: {
          ownerId: "owner-1",
          allowedUsers: ["actor-1"],
          allowedRoles: ["operator"],
          type: "shell",
          targetAgentId: "agent-1",
          command: "echo ok",
          timeoutMs: 30_000,
          maxOutputBytes: 65_536,
          enabled: true,
          status: "active",
          schedule: "*/5 * * * *",
          scheduleType: "Cron",
          timezone: "UTC",
          executionWindow: {
            enabled: false,
            startTime: "00:00",
            endTime: "23:59",
            activeDays: ["M"],
          },
          retryLimit: 0,
          dependsOn: [],
          webhookUrl: null,
          sink: {
            type: null,
            uri: null,
            databaseName: null,
            collectionName: null,
            exportFormat: [],
            encryptionAlg: "AES-256-GCM",
          },
        },
        agent: {
          tokenVersion: 0,
          decommissionedAt: null,
          allowedUsers: ["actor-1"],
          allowedJobs: ["job-1"],
          allowedCommands: ["echo ok"],
          sandboxMode: "none",
        },
      },
    };

    expect(serializeApprovalSnapshot(snapshot)).toBe(GOLDEN_SERIALIZED);
    expect(hashApprovalSnapshot(snapshot)).toBe(GOLDEN_HASH);
  });

  it("requires the actual unique index definitions used before admission", async () => {
    await expect(ensureApprovalIndexes()).resolves.toBe(true);
    const runIndexes = await JobRun.collection.indexes();
    expect(runIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: { orgId: 1, "triggeredBy.userId": 1, requestKey: 1 },
        unique: true,
        partialFilterExpression: { requestKey: { $type: "string" } },
      }),
      expect.objectContaining({
        key: { "approval.previewId": 1 },
        unique: true,
        partialFilterExpression: { "approval.previewId": { $type: "string" } },
      }),
    ]));
  });

  it("awaits the unique-index gate before workers, recovery, or HTTP admission", () => {
    const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
    const gate = source.indexOf("await ensureApprovalIndexes()");
    expect(gate).toBeGreaterThan(-1);
    expect(source.indexOf("startJobWorkers()", gate)).toBeGreaterThan(gate);
    expect(source.indexOf("await startQueueRuntime()", gate)).toBeGreaterThan(gate);
    expect(source.indexOf("server.listen(PORT", gate)).toBeGreaterThan(gate);
  });

  it("rejects query updates and deletes of immutable preview records", async () => {
    const created = await preview();
    await expect(JobRunPreview.updateOne(
      { previewId: created.previewId },
      { $set: { previewHash: "tampered" } },
    )).rejects.toThrow("immutable");
    await expect(JobRunPreview.deleteOne({ previewId: created.previewId })).rejects.toThrow("immutable");
    expect(await JobRunPreview.countDocuments({ previewId: created.previewId })).toBe(1);
  });

  it("treats wildcard-looking allowed commands as exact literal commands", async () => {
    agent.allowedCommands = ["echo *"];
    await agent.save();
    await expect(preview()).rejects.toMatchObject({ code: "AGENT_COMMAND_NOT_ALLOWED" });

    job.payload = { command: "echo *" };
    await job.save();
    await expect(preview()).resolves.toMatchObject({
      preview: { command: "echo *" },
    });
  });
});

describe("durable approval acceptance", () => {
  it.each(["queue-and-readback", "transition-and-readback", "projection"])(
    "preserves accepted identity after %s failure and replays without enqueue",
    async (fault) => {
      await ensureApprovalIndexes();
      const created = await createJobRunPreview({ orgId: org._id, actorId: user._id, jobId: job._id });
      const requestKey = randomUUID();
      const req = {
        resource: job, user: { id: user._id, orgId: org._id },
        body: { previewId: created.previewId, previewHash: created.previewHash },
        get: (name) => name === "idempotency-key" ? requestKey : "approval-test",
        ip: "127.0.0.1",
      };
      const response = () => {
        const res = { set: vi.fn(), status: vi.fn(), json: vi.fn() };
        res.status.mockReturnValue(res);
        return res;
      };
      // Install read failures only after the real durable insert succeeds.
      const originalCreate = JobRun.create.bind(JobRun);
      vi.spyOn(JobRun, "create").mockImplementation(async (...args) => {
        const run = await originalCreate(...args);
        if (fault !== "projection") {
          vi.spyOn(JobRun, "findOne").mockRejectedValue(new Error("readback unavailable"));
        }
        return run;
      });
      if (fault === "queue-and-readback") {
        launchMocks.add.mockRejectedValue(new Error("queue unavailable"));
        launchMocks.getJob.mockRejectedValue(new Error("queue readback unavailable"));
      }
      if (fault === "projection") launchMocks.setState.mockRejectedValue(new Error("projection unavailable"));
      const first = response();
      await runJobNow(req, first);
      expect(first.status).toHaveBeenCalledWith(202);
      const body = first.json.mock.calls[0][0];
      expect(body).toMatchObject({ status: "ACCEPTED", queueStateConfirmed: false, idempotentReplay: false });
      expect(body.runId).toEqual(expect.any(String));
      expect(launchMocks.add).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
      const saved = await JobRun.findOne({ runId: body.runId });
      expect(saved.approval.previewId).toBe(created.previewId);
      expect(saved.attempts).toHaveLength(1);
      expect(saved.status).toBe(fault === "projection" ? "QUEUED" : "ACCEPTED");
      expect(launchMocks.add).toHaveBeenCalledWith("dispatch-job",
        expect.objectContaining({ runId: saved.runId, attemptId: saved.attempts[0].attemptId }),
        expect.objectContaining({ jobId: saved.attempts[0].attemptId, attempts: 1 }));
      const replay = response();
      await runJobNow(req, replay);
      expect(replay.status).toHaveBeenCalledWith(200);
      expect(replay.json).toHaveBeenCalledWith(expect.objectContaining({ runId: body.runId, idempotentReplay: true }));
      expect(launchMocks.add).toHaveBeenCalledTimes(1);
      expect(await JobRun.countDocuments()).toBe(1);
    },
  );
  it("admits exactly one winner under a real concurrent Mongo acceptance race", async () => {
    await ensureApprovalIndexes();
    const created = await preview();
    const results = await Promise.allSettled([
      accept(created, randomUUID()),
      accept(created, randomUUID()),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason).toMatchObject({
      code: "PREVIEW_ALREADY_CONSUMED",
    });
    expect(await JobRun.countDocuments()).toBe(1);
  });

  it("returns an exact accepted replay before preview expiry or mutable-definition checks", async () => {
    await ensureApprovalIndexes();
    const created = await preview();
    const requestKey = randomUUID();
    const first = await accept(created, requestKey);
    await JobRunPreview.collection.deleteOne({ previewId: created.previewId });
    job.name = "changed after acceptance";
    await job.save();
    agent.status = "offline";
    agent.socketId = null;
    await agent.save();

    const replay = await accept(created, requestKey, { now: NOW + 10_000_000 });
    expect(replay).toMatchObject({ created: false, shouldQueue: false });
    expect(replay.run.runId).toBe(first.run.runId);
    expect(await JobRun.countDocuments()).toBe(1);
  });

  it("rejects changed execution material before first acceptance", async () => {
    const created = await preview();
    job.name = "materially changed name";
    await job.save();
    await expect(accept(created)).rejects.toMatchObject({ code: "PREVIEW_STALE" });
    expect(await JobRun.countDocuments()).toBe(0);
  });

  it("returns unknown when readback finds different request-key and preview winners", async () => {
    await ensureApprovalIndexes();
    const created = await preview();
    const requestKey = randomUUID();
    const insertRun = async (definition) => {
      const byKey = cloneWithIdentity(definition, {
        requestKey,
        previewId: randomUUID(),
      });
      const byPreview = cloneWithIdentity(definition, {
        requestKey: randomUUID(),
        previewId: created.previewId,
      });
      await JobRun.create([byKey, byPreview]);
      throw new Error("simulated uncertain write result");
    };

    await expect(accept(created, requestKey, { insertRun })).rejects.toMatchObject({
      code: "LAUNCH_ACCEPTANCE_UNKNOWN",
      statusCode: 503,
    });
    expect(await JobRun.countDocuments()).toBe(2);
  });

  it("recovers a validated ACCEPTED intent with one no-retry queue item", async () => {
    await ensureApprovalIndexes();
    const created = await preview();
    const accepted = await accept(created);
    await JobRun.collection.updateOne(
      { runId: accepted.run.runId },
      { $set: { updatedAt: new Date(0) } },
    );
    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue({ id: accepted.run.queueJobId }),
    };

    await expect(recoverStaleManualRuns(queue, {
      staleBefore: new Date(NOW + 2_000),
    })).resolves.toMatchObject({ inspected: 1, enqueued: 1, errors: 0 });
    expect(queue.add).toHaveBeenCalledWith(
      "dispatch-job",
      expect.objectContaining({ runId: accepted.run.runId }),
      expect.objectContaining({ jobId: accepted.run.queueJobId, attempts: 1 }),
    );
  });

  it("rechecks current actor authorization before dispatch", async () => {
    const created = await preview();
    const accepted = await accept(created);
    const queueData = buildQueueData(accepted.run);
    user.role = "viewer";
    await user.save();

    await expect(validateApprovalForDispatch({
      run: accepted.run,
      queueData,
      currentUser: user,
      currentJob: job,
      currentAgent: agent,
    })).rejects.toMatchObject({ code: "EXECUTION_AUTHORIZATION_REVOKED" });
  });
});
