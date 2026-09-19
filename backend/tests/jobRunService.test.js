import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "crypto";
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
  createManualShellRun,
  markRunQueued,
} from "../services/jobRunService.js";

let org;
let user;
let agent;
let job;

beforeEach(async () => {
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
});
