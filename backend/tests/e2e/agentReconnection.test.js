import { EventEmitter } from "events";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let redisConnection;
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
  ] = await Promise.all([
    import("../../workers/jobWorker.js"),
    import("../../services/dagStateManager.js"),
    import("../../services/agentTelemetryBuffer.js"),
    import("../../models/agent.js"),
    import("../../models/auditLog.js"),
    import("../../models/job.js"),
    import("../../models/organization.js"),
    import("../../models/user.js"),
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
  };
});

beforeEach(async () => {
  await redisConnection.flushall();
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
  });
  const job = await modules.Job.create({
    userId: user._id,
    orgId: org._id,
    name: "long-running-shell",
    type: "shell",
    schedule: "* * * * *",
    payload: { command: "sleep 60" },
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
  it("Agent reconnection does not lose running job state", async () => {
    const { org, user, agent, job } = await createFixture();
    const socket = new MockSocket();

    modules.worker.configureJobWorker({
      sockets: { sockets: new Map([["reconnect-socket", socket]]) },
    });

    await modules.dagStateManager.setJobState(job._id, "RUNNING");

    const processorPromise = modules.worker.jobProcessor({
      id: "running-job",
      name: "dispatch-job",
      queueName: "immediate-jobs",
      data: {
        jobId: job._id,
        payload: job.payload,
        orgId: org._id,
        triggeredBy: {
          userId: user._id,
          ipAddress: "127.0.0.1",
          userAgent: "vitest",
        },
        triggerType: "MANUAL_API",
        dependsOn: [],
      },
    });

    await waitForSocketCommand(socket);
    await expect(modules.dagStateManager.getJobState(job._id)).resolves.toBe("RUNNING");

    socket.emit("disconnect");
    await expect(processorPromise).resolves.toMatchObject({
      status: "failure",
      jobId: expect.anything(),
    });

    const audit = await modules.AuditLog.findOne({ jobId: job._id });
    expect(audit.status).toBe("FAILED");
    expect(audit.stderrSummary).toContain("AGENT_DISCONNECTED");

    await modules.telemetryBuffer.recordHeartbeat(agent._id, {
      os: "linux",
      arch: "x64",
      cpuLoad: 4,
      ramTotal: 1024,
      ramUsed: 128,
    });

    const telemetry = await modules.telemetryBuffer.getAgentTelemetry(agent._id);
    expect(telemetry.status).toBe("ONLINE");
  });
});
