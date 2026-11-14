import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "crypto";
import Agent from "../models/agent.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import {
  ManualRunError,
  buildQueueData,
  claimRunForDispatch,
  completeRun,
  confirmRunCompletion,
  createApprovedShellRun,
  createManualShellRun,
  markRunUnknown,
  markRunQueued,
} from "../services/jobRunService.js";
import { createJobRunPreview } from "../services/jobRunPreviewService.js";

let org;
let user;
let agent;
let job;

beforeEach(async () => {
  delete process.env.AXON_OPERATOR_RESOLUTION_ENABLED;
  const suffix = `${Date.now()}-${Math.random()}`;
  org = await Organization.create({
    name: `run-org-${suffix}`,
    description: "isolated job-run test organization",
  });
  user = await User.create({
    username: `run-user-${suffix}`,
    email: `run-${suffix}@example.com`,
    password: "hashed",
    role: "operator",
    orgId: org._id,
  });
  agent = await Agent.create({
    name: `run-agent-${suffix}`,
    hardwareUuid: `run-agent-${suffix}`,
    apiKey: `secret-${suffix}`,
    orgId: org._id,
    status: "online",
    socketId: `socket-${suffix}`,
    allowedCommands: ["echo hello"],
  });
  job = await Job.create({
    userId: user._id,
    orgId: org._id,
    name: "targeted shell",
    type: "shell",
    schedule: "*/5 * * * *",
    payload: { command: "echo hello" },
    targetAgentId: agent._id,
    actionVersion: "1",
  });
});

afterEach(() => {
  delete process.env.AXON_OPERATOR_RESOLUTION_ENABLED;
  vi.restoreAllMocks();
});

function launch(requestKey) {
  return createManualShellRun({
    job,
    orgId: org._id,
    userId: user._id,
    requestKey,
    ipAddress: "127.0.0.1",
    userAgent: "test",
    now: 1_900_000_000_000,
  });
}

async function launchProspectiveFixture() {
  const preview = await createJobRunPreview({
    orgId: org._id,
    actorId: user._id,
    jobId: job._id,
    now: 1_900_000_000_000,
  });
  const created = await createApprovedShellRun({
    orgId: org._id,
    userId: user._id,
    jobId: job._id,
    requestKey: randomUUID(),
    previewId: preview.previewId,
    previewHash: preview.previewHash,
    ipAddress: "127.0.0.1",
    userAgent: "prospective-reconciliation-test",
    now: 1_900_000_001_000,
  });
  return { ...created, agent };
}

async function claimLaunch() {
  const created = await launch();
  await markRunQueued(created.run.runId);
  const data = buildQueueData(created.run, job, created.agent);
  await claimRunForDispatch(data);
  return { created, data };
}

describe("durable manual JobRun creation", () => {
  it("creates distinct identities for separate launches", async () => {
    const first = await launch();
    const second = await launch();
    expect(first.run.runId).not.toBe(second.run.runId);
    expect(first.run.attempts[0].attemptId).not.toBe(second.run.attempts[0].attemptId);
    expect(await JobRun.countDocuments()).toBe(2);
    expect(first.run).toMatchObject({
      targetSocketId: agent.socketId,
      queueJobId: first.run.attempts[0].attemptId,
      transitionSequence: 1,
    });
    expect(first.run.transitions).toHaveLength(1);
    expect(first.run.transitions[0]).toMatchObject({
      from: null,
      to: "ACCEPTED",
      source: "API",
    });
    expect(first.run.action).toMatchObject({
      actionVersion: createHash("sha256").update("echo hello", "utf8").digest("hex"),
      timeoutMs: 30_000,
      maxOutputBytes: 65_536,
      startBefore: 1_900_000_060_000,
    });
  });

  it("reuses an identical request key without creating another run", async () => {
    const first = await launch("request-1");
    const replay = await launch("request-1");
    expect(replay.created).toBe(false);
    expect(replay.run.runId).toBe(first.run.runId);
    expect(await JobRun.countDocuments()).toBe(1);
  });

  it("scopes request-key idempotency to the authenticated actor", async () => {
    const otherUser = await User.create({
      username: `other-${Date.now()}`,
      email: `other-${Date.now()}@example.com`,
      password: "hashed",
      role: "operator",
      orgId: org._id,
    });
    const first = await launch("shared-key");
    const second = await createManualShellRun({
      job,
      orgId: org._id,
      userId: otherUser._id,
      requestKey: "shared-key",
      ipAddress: "127.0.0.1",
      userAgent: "test",
      now: 1_900_000_000_000,
    });
    expect(second.run.runId).not.toBe(first.run.runId);
    expect(await JobRun.countDocuments()).toBe(2);
  });

  it("rejects a request key reused with changed executable input", async () => {
    await launch("request-1");
    job.payload.command = "echo changed";
    agent.allowedCommands = ["echo changed"];
    await agent.save();
    await expect(launch("request-1")).rejects.toMatchObject({
      code: "REQUEST_KEY_CONFLICT",
      statusCode: 409,
    });
    expect(await JobRun.countDocuments()).toBe(1);
  });

  it("records the exact offline target as rejected and never substitutes", async () => {
    agent.status = "offline";
    agent.socketId = null;
    await agent.save();
    const rejected = await launch();
    expect(rejected.shouldQueue).toBe(false);
    expect(rejected.run).toMatchObject({
      status: "REJECTED",
      reasonCode: "TARGET_AGENT_OFFLINE",
    });
    expect(String(rejected.run.targetAgentId)).toBe(String(agent._id));
  });

  it("enforces the selected agent allowedUsers and allowedJobs restrictions", async () => {
    agent.allowedUsers = [new User()._id];
    await agent.save();
    await expect(launch()).rejects.toBeInstanceOf(ManualRunError);
    await expect(launch()).rejects.toMatchObject({ code: "AGENT_USER_NOT_ALLOWED" });
  });

  it("fails closed when the selected agent has no command allowlist", async () => {
    agent.allowedCommands = [];
    await agent.save();
    await expect(launch()).rejects.toMatchObject({
      code: "AGENT_COMMAND_NOT_ALLOWED",
      statusCode: 403,
    });
    expect(await JobRun.countDocuments()).toBe(0);
  });

  it("rejects a command outside the selected agent allowlist", async () => {
    agent.allowedCommands = ["uptime"];
    await agent.save();
    await expect(launch()).rejects.toMatchObject({ code: "AGENT_COMMAND_NOT_ALLOWED" });
    expect(await JobRun.countDocuments()).toBe(0);
  });

  it("treats wildcard-looking entries as literal commands", async () => {
    agent.allowedCommands = ["echo *"];
    await agent.save();
    await expect(launch()).rejects.toMatchObject({ code: "AGENT_COMMAND_NOT_ALLOWED" });
  });

  it("claims a durable attempt only once and never redispatches queue redelivery", async () => {
    const created = await launch();
    await markRunQueued(created.run.runId);
    const data = buildQueueData(created.run, job, created.agent);
    const claims = await Promise.all([
      claimRunForDispatch(data),
      claimRunForDispatch(data),
    ]);
    expect(claims.filter((result) => result.claimed)).toHaveLength(1);
    expect(claims.filter((result) => !result.claimed)).toHaveLength(1);
    expect(claims.find((result) => !result.claimed).run.status).toBe("DISPATCHING");
    const persisted = await JobRun.findOne({ runId: created.run.runId });
    expect(persisted.transitions.filter((entry) => entry.to === "DISPATCHING")).toHaveLength(1);
  });

  it("keeps prospective reconciliation stamping default-off", async () => {
    const created = await launch();
    const recovered = await markRunUnknown(created.run.runId, "TARGET_DISCONNECTED", [
      "ACCEPTED",
    ]);

    expect(recovered).toMatchObject({ status: "UNKNOWN" });
    expect(recovered.reconciliationSafetyVersion).toBeUndefined();
    expect(recovered.nonDispatchProof).toBeUndefined();
    expect(recovered.operatorResolution).toBeUndefined();
  });

  it("makes proof recovery win atomically when it reaches the run before dispatch claim", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const created = await launchProspectiveFixture();
    const data = buildQueueData(created.run, job, created.agent);

    const recovered = await markRunUnknown(created.run.runId, "TARGET_DISCONNECTED", [
      "ACCEPTED",
    ]);
    const claim = await claimRunForDispatch(data);
    const persisted = await JobRun.findOne({ runId: created.run.runId }).lean();

    expect(recovered).toMatchObject({ status: "UNKNOWN" });
    expect(claim).toMatchObject({ claimed: false });
    expect(persisted).toMatchObject({
      status: "UNKNOWN",
      reconciliationSafetyVersion: 1,
      nonDispatchProof: {
        version: 1,
        attemptId: data.attemptId,
        fromTransitionSequence: 1,
        terminalTransitionSequence: 2,
      },
    });
    expect(String(persisted.nonDispatchProof.targetAgentId)).toBe(String(agent._id));
    expect(persisted.operatorResolution).toBeUndefined();
    expect(persisted.transitions.filter((entry) => entry.to === "DISPATCHING")).toHaveLength(0);
  });

  it("makes dispatch claim win atomically when it reaches the run before proof recovery", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const created = await launchProspectiveFixture();
    const data = buildQueueData(created.run, job, created.agent);

    const claim = await claimRunForDispatch(data);
    const recovered = await markRunUnknown(created.run.runId, "TARGET_DISCONNECTED", [
      "DISPATCHING",
    ]);
    const persisted = await JobRun.findOne({ runId: created.run.runId }).lean();

    expect(claim).toMatchObject({ claimed: true });
    expect(recovered).toMatchObject({ status: "UNKNOWN" });
    expect(persisted).toMatchObject({
      status: "UNKNOWN",
      reconciliationSafetyVersion: 1,
    });
    expect(persisted.nonDispatchProof).toBeUndefined();
    expect(persisted.operatorResolution).toBeUndefined();
    expect(persisted.transitions.filter((entry) => entry.to === "DISPATCHING")).toHaveLength(1);
    expect(persisted.transitions.filter((entry) => entry.to === "UNKNOWN")).toHaveLength(1);
  });

  it("permits exactly one winner in a real concurrent dispatch-versus-proof race", async () => {
    process.env.AXON_OPERATOR_RESOLUTION_ENABLED = "true";
    const created = await launchProspectiveFixture();
    const data = buildQueueData(created.run, job, created.agent);

    const [recovered, claim] = await Promise.all([
      markRunUnknown(created.run.runId, "TARGET_DISCONNECTED", ["ACCEPTED"]),
      claimRunForDispatch(data),
    ]);
    const persisted = await JobRun.findOne({ runId: created.run.runId }).lean();
    const proofWon = persisted.status === "UNKNOWN" && Boolean(persisted.nonDispatchProof);
    const dispatchWon = persisted.status === "DISPATCHING" && !persisted.nonDispatchProof;

    expect(proofWon || dispatchWon).toBe(true);
    expect(claim.claimed).toBe(dispatchWon);
    if (proofWon) {
      expect(recovered.status).toBe("UNKNOWN");
      expect(persisted.transitions.filter((entry) => entry.to === "DISPATCHING")).toHaveLength(0);
    } else {
      expect(recovered.status).toBe("DISPATCHING");
      expect(persisted.transitions.filter((entry) => entry.to === "DISPATCHING")).toHaveLength(1);
    }
  });

  it("preserves the first terminal outcome when a late result arrives", async () => {
    const created = await launch();
    await markRunQueued(created.run.runId);
    const data = buildQueueData(created.run, job, created.agent);
    await claimRunForDispatch(data);
    const first = await completeRun(created.run.runId, data.attemptId, {
      status: "FAILED",
      outcome: "COMPLETED",
      exitCode: 1,
      reasonCode: "NONZERO_EXIT",
    });
    const late = await completeRun(created.run.runId, data.attemptId, {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: null,
    });
    expect(first.status).toBe("FAILED");
    expect(late.status).toBe("FAILED");
    expect(late.terminalSummary).toMatchObject({
      status: "FAILED",
      exitCode: 1,
      reasonCode: "NONZERO_EXIT",
    });
    expect(late.transitions.filter((entry) => entry.to === "FAILED")).toHaveLength(1);
    expect((await JobRun.findOne({ runId: created.run.runId })).status).toBe("FAILED");
  });

  it("retries an identical terminal CAS after a transient write failure", async () => {
    const { created, data } = await claimLaunch();
    const originalFindOneAndUpdate = JobRun.findOneAndUpdate.bind(JobRun);
    const terminalWrite = vi
      .spyOn(JobRun, "findOneAndUpdate")
      .mockRejectedValueOnce(new Error("transient mongo write failure"))
      .mockImplementation(originalFindOneAndUpdate);

    const confirmation = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: null,
    });

    expect(confirmation.disposition).toBe("CONFIRMED_MATCH");
    expect(terminalWrite).toHaveBeenCalledTimes(2);
    expect(terminalWrite.mock.calls[1][1]).toEqual(terminalWrite.mock.calls[0][1]);
    expect(terminalWrite.mock.calls[0][1].$set.completedAt).toEqual(
      terminalWrite.mock.calls[0][1].$push.transitions.$each[0].at,
    );
    const persisted = await JobRun.findOne({ runId: created.run.runId });
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0].attemptId).toBe(data.attemptId);
    expect(persisted.queueJobId).toBe(data.attemptId);
    expect(persisted.transitions.filter((entry) => entry.to === "SUCCEEDED")).toHaveLength(1);
  });

  it("confirms a commit-then-throw write by reading back its receipt", async () => {
    const { created, data } = await claimLaunch();
    const originalFindOneAndUpdate = JobRun.findOneAndUpdate.bind(JobRun);
    const terminalWrite = vi
      .spyOn(JobRun, "findOneAndUpdate")
      .mockImplementationOnce(async (...args) => {
        await originalFindOneAndUpdate(...args);
        throw new Error("reply lost after commit");
      })
      .mockImplementation(originalFindOneAndUpdate);

    const confirmation = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "FAILED",
      outcome: "COMPLETED",
      exitCode: 7,
      reasonCode: "NONZERO_EXIT",
    });

    expect(confirmation.disposition).toBe("CONFIRMED_MATCH");
    expect(terminalWrite).toHaveBeenCalledTimes(1);
    expect(confirmation.run.terminalSummary).toMatchObject({
      status: "FAILED",
      outcome: "COMPLETED",
      exitCode: 7,
      reasonCode: "NONZERO_EXIT",
    });
  });

  it("returns persistence unknown after three failed write cycles", async () => {
    const { created, data } = await claimLaunch();
    const terminalWrite = vi
      .spyOn(JobRun, "findOneAndUpdate")
      .mockRejectedValue(new Error("mongo write unavailable"));

    const confirmation = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: null,
    });

    expect(confirmation.disposition).toBe("PERSISTENCE_UNKNOWN");
    expect(terminalWrite).toHaveBeenCalledTimes(3);
    expect(confirmation.error).toMatchObject({ message: "mongo write unavailable" });
    expect(confirmation.run.status).toBe("DISPATCHING");
  });

  it("returns persistence unknown after three exhausted terminal CAS attempts", async () => {
    const { created, data } = await claimLaunch();
    const terminalWrite = vi.spyOn(JobRun, "findOneAndUpdate").mockResolvedValue(null);

    const confirmation = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: null,
    });

    expect(confirmation.disposition).toBe("PERSISTENCE_UNKNOWN");
    expect(terminalWrite).toHaveBeenCalledTimes(3);
    expect(confirmation.run.status).toBe("DISPATCHING");
  });

  it("confirms an exact duplicate and rejects conflicting terminal evidence", async () => {
    const { created, data } = await claimLaunch();
    const failed = {
      status: "FAILED",
      outcome: "COMPLETED",
      exitCode: 9,
      reasonCode: "NONZERO_EXIT",
    };
    const first = await confirmRunCompletion(created.run.runId, data.attemptId, failed);
    const duplicate = await confirmRunCompletion(created.run.runId, data.attemptId, failed);
    const conflict = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: null,
    });

    expect(first.disposition).toBe("CONFIRMED_MATCH");
    expect(duplicate.disposition).toBe("CONFIRMED_MATCH");
    expect(conflict.disposition).toBe("CONFLICT");
    expect(conflict.run.terminalSummary).toMatchObject(failed);
    expect(conflict.run.transitions.filter((entry) => entry.to === "FAILED")).toHaveLength(1);
  });

  it("keeps UNKNOWN terminal and the original attempt identity immutable", async () => {
    const { created, data } = await claimLaunch();
    const unknown = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      exitCode: null,
      reasonCode: "EXECUTION_RESULT_UNKNOWN",
    });
    const conflict = await confirmRunCompletion(created.run.runId, data.attemptId, {
      status: "SUCCEEDED",
      outcome: "COMPLETED",
      exitCode: 0,
      reasonCode: null,
    });
    const wrongAttempt = await confirmRunCompletion(created.run.runId, "different-attempt", {
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      exitCode: null,
      reasonCode: "EXECUTION_RESULT_UNKNOWN",
    });

    expect(unknown.disposition).toBe("CONFIRMED_MATCH");
    expect(conflict.disposition).toBe("CONFLICT");
    expect(wrongAttempt.disposition).toBe("CONFLICT");
    const persisted = await JobRun.findOne({ runId: created.run.runId });
    expect(persisted.status).toBe("UNKNOWN");
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0].attemptId).toBe(data.attemptId);
    expect(persisted.terminalSummary).toMatchObject({
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      reasonCode: "EXECUTION_RESULT_UNKNOWN",
    });
  });
});
