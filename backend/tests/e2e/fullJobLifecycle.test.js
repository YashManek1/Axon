import crypto from "crypto";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { EventEmitter } from "events";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let app;
let redisConnection;
let immediateAdds;
let scheduledAdds;
let modules;

class MockSocket extends EventEmitter {
  constructor(agentId, orgId) {
    super();
    this.emittedCommands = [];
    this.agentId = String(agentId);
    this.orgId = String(orgId);
    this.clientType = "agent";
    this.authGeneration = 0;
    this.protocolVersions = [2];
  }

  emit(eventName, payload) {
    if (eventName === "execute_command") {
      this.emittedCommands.push(payload);
      return true;
    }

    return super.emit(eventName, payload);
  }

  off(eventName, listener) {
    return this.removeListener(eventName, listener);
  }
}

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  redisConnection = new Redis();
  immediateAdds = [];
  scheduledAdds = [];

  vi.doMock("../../config/queue.js", () => ({
    redisConnection,
    scheduledJobsQueue: {
      add: vi.fn(async (...args) => {
        scheduledAdds.push(args);
        return { id: `scheduled-${scheduledAdds.length}` };
      }),
      removeRepeatable: vi.fn(),
    },
    immediateJobsQueue: {
      add: vi.fn(async (...args) => {
        immediateAdds.push(args);
        return { id: `immediate-${immediateAdds.length}` };
      }),
      removeRepeatable: vi.fn(),
    },
  }));

  const [
    { default: userRoutes },
    { default: jobRoutes },
    { default: auditRoutes },
    { default: agentProvisioningRoutes },
    { requestId },
    worker,
    dagStateManager,
    telemetryBuffer,
    distributedLock,
    { default: Organization },
    { default: Agent },
    { default: AuditLog },
    { default: ExecutionTargetHold },
  ] = await Promise.all([
    import("../../routes/userR.js"),
    import("../../routes/jobR.js"),
    import("../../routes/auditR.js"),
    import("../../routes/agentProvisioningR.js"),
    import("../../middleware/requestId.js"),
    import("../../workers/jobWorker.js"),
    import("../../services/dagStateManager.js"),
    import("../../services/agentTelemetryBuffer.js"),
    import("../../services/distributedLock.js"),
    import("../../models/organization.js"),
    import("../../models/agent.js"),
    import("../../models/auditLog.js"),
    import("../../models/executionTargetHold.js"),
  ]);

  modules = {
    worker,
    dagStateManager,
    telemetryBuffer,
    distributedLock,
    Organization,
    Agent,
    AuditLog,
    ExecutionTargetHold,
  };

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId);
  app.use("/user", userRoutes);
  app.use("/jobs", jobRoutes);
  app.use("/audit", auditRoutes);
  app.use("/agents", agentProvisioningRoutes);
}, 30_000);

beforeEach(async () => {
  immediateAdds.length = 0;
  scheduledAdds.length = 0;
  await redisConnection.flushdb();
});

async function createUserAndOrg(prefix) {
  const response = await request(app).post("/user/register").send({
    username: `${prefix}-user`,
    email: `${prefix}@example.com`,
    password: "correct-password",
    orgName: `${prefix}-org`,
    orgDescription: "Lifecycle test org",
  });

  // Org API keys use the wire format axk_<keyId>_<secret>; only the secret is
  // hashed, and lookup is by the indexed keyId. Seeding the old flat
  // `apiKeyHash` field no longer resolves an org, so registration returns null.
  const keyId = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const apiKey = `axk_${keyId}_${secret}`;
  await modules.Organization.findByIdAndUpdate(response.body.user.orgId, {
    apiKeys: [
      {
        keyId,
        hash: await bcrypt.hash(secret, 10),
        label: `${prefix} lifecycle key`,
        createdAt: new Date(),
      },
    ],
  });

  return {
    user: response.body.user,
    token: response.body.token,
    orgApiKey: apiKey,
  };
}

async function registerAgent({ token, orgApiKey }, socketId = "agent-socket-1") {
  const response = await request(app)
    .post("/agents/register")
    .set("X-Axon-API-Key", orgApiKey)
    .send({ name: "test-agent", hardwareUuid: `hw-${socketId}` });

  await modules.Agent.findByIdAndUpdate(response.body.agentId, {
    status: "online",
    socketId,
    allowedCommands: ["echo ok", "sleep 60"],
  });
  await modules.telemetryBuffer.recordHeartbeat(response.body.agentId, {
    os: "linux",
    arch: "x64",
    cpuLoad: 12,
    ramTotal: 1024,
    ramUsed: 256,
  });

  const agent = await modules.Agent.findById(response.body.agentId);
  expect(await agent.matchApiKey(response.body.apiKey)).toBe(true);

  return { agentId: response.body.agentId, apiKey: response.body.apiKey, token };
}

function auth(token) {
  return `Bearer ${token}`;
}

async function createShellJob(token, overrides = {}) {
  const response = await request(app)
    .post("/jobs/createJob")
    .set("Authorization", auth(token))
    .send({
      name: overrides.name || "shell-job",
      type: "shell",
      schedule: "* * * * *",
      payload: { command: overrides.command || "echo ok" },
      enabled: false,
      dependsOn: overrides.dependsOn || [],
      targetAgentId: overrides.targetAgentId,
    });

  expect(response.status).toBe(201);
  return response.body.job;
}

function latestImmediateJob(queueName = "immediate-jobs") {
  const [name, data] = immediateAdds[immediateAdds.length - 1];
  return {
    id: `${queueName}-test-job`,
    name,
    queueName,
    data,
  };
}

async function waitForSocketCommand(socket) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (socket.emittedCommands.length > 0) {
      return socket.emittedCommands[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error("Timed out waiting for execute_command");
}

describe("full job lifecycle e2e", () => {
  it("A targeted manual shell run is dispatched and produces an audit record", async () => {
    const session = await createUserAndOrg("lifecycle");
    const registered = await registerAgent(session);

    const socket = new MockSocket(registered.agentId, session.user.orgId);
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["agent-socket-1", socket]]) },
    });

    const job = await createShellJob(session.token, {
      targetAgentId: registered.agentId,
    });
    expect(scheduledAdds).toHaveLength(0);

    const triggerResponse = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", auth(session.token));

    expect(triggerResponse.status).toBe(200);
    expect(triggerResponse.body.runId).toEqual(expect.any(String));

    const workerJob = latestImmediateJob();
    let continueAfterPending;
    workerJob.data.__testHooks = {
      afterAuditCreated: () =>
        new Promise((resolve) => {
          continueAfterPending = resolve;
        }),
    };
    const processorPromise = modules.worker.jobProcessor(workerJob);

    await vi.waitFor(async () => {
      const pendingAudit = await modules.AuditLog.findOne({ jobId: job._id });
      expect(pendingAudit?.status).toBe("PENDING");
    });

    continueAfterPending();
    const command = await waitForSocketCommand(socket);

    await vi.waitFor(async () => {
      const dispatchedAudit = await modules.AuditLog.findOne({ jobId: job._id });
      expect(dispatchedAudit?.status).toBe("DISPATCHED");
    });

    const correlation = {
      protocolVersion: command.protocolVersion,
      jobId: command.jobId,
      targetAgentId: command.targetAgentId,
      runId: command.runId,
      targetExecutionId: command.targetExecutionId,
      attemptId: command.attemptId,
      operationId: command.operationId,
    };
    socket.emit("job_ack", correlation);

    await vi.waitFor(async () => {
      const ackedAudit = await modules.AuditLog.findOne({ jobId: job._id });
      expect(ackedAudit?.status).toBe("DISPATCHED_ACKED");
    });

    socket.emit("command_result", {
      ...correlation,
      outcome: "completed",
      stdout: "ok\n",
      stderr: "",
      exitCode: 0,
      reasonCode: null,
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 10,
    });

    await expect(processorPromise).resolves.toMatchObject({
      status: "success",
      jobId: expect.anything(),
    });

    const completedAudit = await modules.AuditLog.findOne({ jobId: job._id });
    expect(String(command.jobId)).toBe(job._id);
    expect(command.command).toBe("echo ok");
    expect(completedAudit).toEqual(
      expect.objectContaining({ status: "COMPLETED", exitCode: 0 }),
    );
    await expect(modules.dagStateManager.getJobState(job._id)).resolves.toBe("COMPLETED");

    const auditResponse = await request(app)
      .get(`/audit/job/${job._id}`)
      .set("Authorization", auth(session.token));

    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body).toHaveLength(1);
    expect(auditResponse.body[0]).toEqual(
      expect.objectContaining({ status: "COMPLETED", jobId: String(job._id) }),
    );
  });

  it("A job with unmet dependencies does not execute", async () => {
    const session = await createUserAndOrg("deps");
    const registered = await registerAgent(session, "deps-socket");
    const socket = new MockSocket(registered.agentId, session.user.orgId);
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["deps-socket", socket]]) },
    });

    const jobA = await createShellJob(session.token, {
      name: "job-a",
      targetAgentId: registered.agentId,
    });
    const jobB = await createShellJob(session.token, {
      name: "job-b",
      dependsOn: [jobA._id],
      targetAgentId: registered.agentId,
    });

    await modules.dagStateManager.setJobState(jobA._id, "FAILED");

    const triggerResponse = await request(app)
      .post(`/jobs/runJobNow/${jobB._id}`)
      .set("Authorization", auth(session.token));

    expect(triggerResponse.status).toBe(409);
    expect(triggerResponse.body.code).toBe("SHELL_DEPENDENCIES_UNSUPPORTED");
    expect(immediateAdds).toHaveLength(0);
    expect(socket.emittedCommands).toHaveLength(0);
  });

  it("A second accepted run is rejected while its target resource is occupied", async () => {
    const session = await createUserAndOrg("duplicate");
    const registered = await registerAgent(session, "duplicate-socket");
    const socket = new MockSocket(registered.agentId, session.user.orgId);
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["duplicate-socket", socket]]) },
    });

    const job = await createShellJob(session.token, {
      targetAgentId: registered.agentId,
    });
    const triggerResponse = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", auth(session.token));
    expect(triggerResponse.status).toBe(200);

    const resourceKey = `org:${String(job.orgId)}:agent:${registered.agentId}`;
    await modules.distributedLock.acquireJobLock(resourceKey, "existing-worker", 375);
    await expect(modules.worker.jobProcessor(latestImmediateJob())).rejects.toMatchObject({
      code: "CONCURRENT_TARGET_EXECUTION",
      runId: triggerResponse.body.runId,
    });

    expect(socket.emittedCommands).toHaveLength(0);
    await expect(modules.AuditLog.countDocuments({ jobId: job._id })).resolves.toBe(1);
  });
  it("blocks worker dispatch when a durable target hold survives without a Redis lease", async () => {
    const session = await createUserAndOrg("durable-overlap");
    const registered = await registerAgent(session, "durable-overlap-socket");
    const socket = new MockSocket(registered.agentId, session.user.orgId);
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["durable-overlap-socket", socket]]) },
    });

    const job = await createShellJob(session.token, {
      targetAgentId: registered.agentId,
    });
    const triggerResponse = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", auth(session.token));
    expect(triggerResponse.status).toBe(200);

    const originalOwner = {
      organizationId: job.orgId,
      targetAgentId: registered.agentId,
      runId: "unresolved-run",
      attemptId: "unresolved-attempt",
      fencingToken: 41,
    };
    await modules.ExecutionTargetHold.create(originalOwner);

    await expect(modules.worker.jobProcessor(latestImmediateJob())).rejects.toMatchObject({
      code: "CONCURRENT_TARGET_EXECUTION",
      runId: triggerResponse.body.runId,
    });

    expect(socket.emittedCommands).toHaveLength(0);
    await expect(
      modules.ExecutionTargetHold.findOne({
        organizationId: job.orgId,
        targetAgentId: registered.agentId,
      })
        .select("runId attemptId fencingToken")
        .lean(),
    ).resolves.toMatchObject({
      runId: originalOwner.runId,
      attemptId: originalOwner.attemptId,
      fencingToken: originalOwner.fencingToken,
    });
  });

});
