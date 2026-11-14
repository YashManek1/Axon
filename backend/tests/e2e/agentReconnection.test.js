import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let redisConnection;
let modules;

class MockSocket extends EventEmitter {
  constructor(agentId, orgId, id = "reconnect-socket") {
    super();
    this.emittedCommands = [];
    this.id = id;
    this.connected = true;
    this.agentId = String(agentId);
    this.orgId = String(orgId);
    this.clientType = "agent";
    this.authGeneration = 0;
    this.protocolVersions = [2];
    this.releaseId = process.env.AXON_RELEASE_ID;
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

  disconnect() {
    this.connected = false;
    this.emit("disconnect");
  }
}

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  redisConnection = new Redis();

  vi.doMock("../../config/queue.js", () => ({
    redisConnection,
    scheduledJobsQueue: { add: vi.fn(), removeRepeatable: vi.fn() },
    immediateJobsQueue: { add: vi.fn(), removeRepeatable: vi.fn() },
  }));

  const [
    worker,
    dagStateManager,
    telemetryBuffer,
    { default: Agent },
    { default: AuditLog },
    { default: Job },
    { default: Organization },
    { default: User },
    { default: JobRun },
    jobRuns,
    jobRunPreviews,
    agentLifecycle,
  ] = await Promise.all([
    import("../../workers/jobWorker.js"),
    import("../../services/dagStateManager.js"),
    import("../../services/agentTelemetryBuffer.js"),
    import("../../models/agent.js"),
    import("../../models/auditLog.js"),
    import("../../models/job.js"),
    import("../../models/organization.js"),
    import("../../models/user.js"),
    import("../../models/jobRun.js"),
    import("../../services/jobRunService.js"),
    import("../../services/jobRunPreviewService.js"),
    import("../../services/agentConnectionLifecycle.js"),
  ]);

  modules = {
    worker,
    dagStateManager,
    telemetryBuffer,
    Agent,
    AuditLog,
    Job,
    Organization,
    User,
    JobRun,
    jobRuns,
    jobRunPreviews,
    agentLifecycle,
  };
});

beforeEach(async () => {
  await redisConnection.flushdb();
});

async function createFixture() {
  const org = await modules.Organization.create({
    name: `reconnect-org-${Date.now()}-${Math.random()}`,
    description: "Agent reconnection org",
  });
  const user = await modules.User.create({
    username: `reconnect-user-${Date.now()}-${Math.random()}`,
    email: `reconnect-${Date.now()}-${Math.random()}@example.com`,
    password: "hashed-password",
    orgId: org._id,
  });
  const agent = await modules.Agent.create({
    name: "reconnecting-agent",
    orgId: org._id,
    hardwareUuid: `reconnect-hw-${Date.now()}-${Math.random()}`,
    apiKey: "agent-key",
    status: "online",
    socketId: "reconnect-socket",
    allowedCommands: ["sleep 60"],
  });
  const job = await modules.Job.create({
    userId: user._id,
    orgId: org._id,
    name: "long-running-shell",
    type: "shell",
    schedule: "* * * * *",
    payload: { command: "sleep 60" },
    targetAgentId: agent._id,
    enabled: false,
  });

  return { org, user, agent, job };
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

describe("agent reconnection e2e", () => {
  it("disconnect records an unknown outcome without redispatch", async () => {
    const { org, user, agent, job } = await createFixture();
    const socket = new MockSocket(agent._id, org._id);

    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["reconnect-socket", socket]]) },
    });

    const preview = await modules.jobRunPreviews.createJobRunPreview({
      orgId: org._id,
      actorId: user._id,
      jobId: job._id,
    });
    const created = await modules.jobRuns.createApprovedShellRun({
      orgId: org._id,
      userId: user._id,
      jobId: job._id,
      requestKey: randomUUID(),
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });
    await modules.jobRuns.markRunQueued(created.run.runId);
    const queueData = modules.jobRuns.buildQueueData(created.run);

    const processorPromise = modules.worker.jobProcessor({
      id: queueData.attemptId,
      name: "dispatch-job",
      queueName: "immediate-jobs",
      data: queueData,
    });

    await waitForSocketCommand(socket);
    await expect(modules.dagStateManager.getJobState(job._id)).resolves.toBe("RUNNING");

    socket.emit("disconnect");
    await expect(processorPromise).rejects.toMatchObject({
      code: "EXECUTION_OUTCOME_UNKNOWN",
    });

    const persistedRun = await modules.JobRun.findOne({ runId: created.run.runId });
    expect(persistedRun).toMatchObject({ status: "UNKNOWN", requiresReview: true });
    expect(socket.emittedCommands).toHaveLength(1);
    const audit = await modules.AuditLog.findOne({ jobId: job._id });
    expect(audit).toMatchObject({
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      reasonCode: "EXECUTION_OUTCOME_UNKNOWN",
      runId: created.run.runId,
      targetExecutionId: queueData.targetExecutionId,
      attemptId: queueData.attemptId,
      operationId: queueData.operationId,
    });
    expect(audit.stderrSummary).toContain("disconnected");

    const reconnectedSocket = new MockSocket(agent._id, org._id, "reconnect-socket-2");
    await expect(
      modules.agentLifecycle.attachAgentConnection(reconnectedSocket),
    ).resolves.toBe(true);
    const reconnectIdentity = {
      socketId: reconnectedSocket.id,
      tokenVersion: reconnectedSocket.authGeneration,
      connectionGeneration: reconnectedSocket.agent.connectionGeneration,
    };
    await modules.telemetryBuffer.recordHeartbeat(agent._id, {
      os: "linux",
      arch: "x64",
      cpuLoad: 4,
      ramTotal: 1024,
      ramUsed: 128,
    }, reconnectIdentity);

    const telemetry = await modules.telemetryBuffer.getAgentTelemetry(
      agent._id,
      reconnectIdentity,
    );
    expect(telemetry.status).toBe("ONLINE");
  });
});
