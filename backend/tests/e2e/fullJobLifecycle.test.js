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
  constructor() {
    super();
    this.emittedCommands = [];
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
  ]);

  modules = {
    worker,
    dagStateManager,
    telemetryBuffer,
    distributedLock,
    Organization,
    Agent,
    AuditLog,
  };

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId);
  app.use("/user", userRoutes);
  app.use("/jobs", jobRoutes);
  app.use("/audit", auditRoutes);
  app.use("/agents", agentProvisioningRoutes);
});

beforeEach(async () => {
  immediateAdds.length = 0;
  scheduledAdds.length = 0;
  await redisConnection.flushall();
});

async function createUserAndOrg(prefix) {
  const response = await request(app).post("/user/register").send({
    username: `${prefix}-user`,
    email: `${prefix}@example.com`,
    password: "correct-password",
    orgName: `${prefix}-org`,
    orgDescription: "Lifecycle test org",
  });

  const apiKey = `${prefix}-org-api-key`;
  await modules.Organization.findByIdAndUpdate(response.body.user.orgId, {
    apiKeyHash: await bcrypt.hash(apiKey, 10),
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
      enabled: overrides.enabled ?? true,
      dependsOn: overrides.dependsOn || [],
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
  it("A shell job is scheduled, dispatched to an agent, and produces an audit record", async () => {
    const session = await createUserAndOrg("lifecycle");
    await registerAgent(session);

    const socket = new MockSocket();
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["agent-socket-1", socket]]) },
    });

    const job = await createShellJob(session.token);
    await expect(modules.dagStateManager.getJobState(job._id)).resolves.toBe("QUEUED");

    const triggerResponse = await request(app)
      .post(`/jobs/runJobNow/${job._id}`)
      .set("Authorization", auth(session.token));

    expect(triggerResponse.status).toBe(200);

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

    socket.emit("command_result", {
      jobId: command.jobId,
      stdout: "ok\n",
      stderr: "",
      exitCode: 0,
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
    await registerAgent(session, "deps-socket");
    const socket = new MockSocket();
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["deps-socket", socket]]) },
    });

    const jobA = await createShellJob(session.token, { name: "job-a" });
    const jobB = await createShellJob(session.token, {
      name: "job-b",
      dependsOn: [jobA._id],
    });

    await modules.dagStateManager.setJobState(jobA._id, "FAILED");

    const triggerResponse = await request(app)
      .post(`/jobs/runJobNow/${jobB._id}`)
      .set("Authorization", auth(session.token));

    expect(triggerResponse.status).toBe(200);
    await modules.worker.jobProcessor(latestImmediateJob());

    const audit = await modules.AuditLog.findOne({ jobId: jobB._id });
    expect(audit.status).toBe("FAILED");
    expect(audit.stderrSummary).toContain("Dependencies not met");
    expect(socket.emittedCommands).toHaveLength(0);
  });

  it("Duplicate job dispatch is prevented by distributed lock", async () => {
    const session = await createUserAndOrg("duplicate");
    await registerAgent(session, "duplicate-socket");
    const socket = new MockSocket();
    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["duplicate-socket", socket]]) },
    });

    const job = await createShellJob(session.token);

    await modules.distributedLock.acquireJobLock(job._id);
    const result = await modules.worker.jobProcessor({
      id: "duplicate-attempt",
      name: "dispatch-job",
      queueName: "immediate-jobs",
      data: {
        jobId: job._id,
        payload: job.payload,
        orgId: job.orgId,
        triggeredBy: {
          userId: session.user._id,
          ipAddress: "127.0.0.1",
          userAgent: "vitest",
        },
        triggerType: "MANUAL_API",
        dependsOn: [],
      },
    });

    expect(result).toEqual({
      status: "skipped",
      jobId: job._id,
      reason: "lock-held",
    });
    expect(socket.emittedCommands).toHaveLength(0);
    await expect(modules.AuditLog.countDocuments({ jobId: job._id })).resolves.toBe(1);
  });
});
