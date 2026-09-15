import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAgent: vi.fn(),
  historyCreate: vi.fn(),
  dispatch: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  acknowledged: vi.fn(),
  auditCreate: vi.fn(),
  auditUpdate: vi.fn(),
  setState: vi.fn(),
  acquireSlot: vi.fn(),
  publishLogChunk: vi.fn(),
  findUser: vi.fn(),
  findJob: vi.fn(),
  hasResourceAccess: vi.fn(),
}));

vi.mock("../config/queue.js", () => ({ redisConnection: {} }));
vi.mock("../models/agent.js", () => ({ default: { findOne: mocks.findAgent } }));
vi.mock("../models/user.js", () => ({ default: { findOne: mocks.findUser } }));
vi.mock("../models/job.js", () => ({ default: { findOne: mocks.findJob } }));
vi.mock("../middlewares/jwt.js", () => ({ hasResourceAccess: mocks.hasResourceAccess }));
vi.mock("../models/jobHistory.js", () => ({
  default: { create: mocks.historyCreate },
}));
vi.mock("../services/jobExecutionRouter.js", () => ({
  configureJobExecutionRouter: vi.fn(),
  dispatchCommandToAgent: mocks.dispatch,
}));
vi.mock("../services/jobRunService.js", () => ({
  claimRunForDispatch: mocks.claim,
  completeRun: mocks.complete,
  markRunAcknowledged: mocks.acknowledged,
}));
vi.mock("../services/distributedLock.js", () => ({
  releaseJobLock: vi.fn(),
}));
vi.mock("../services/dagStateManager.js", () => ({
  acquireExecutionSlot: mocks.acquireSlot,
  checkDependenciesMet: vi.fn(),
  setJobState: mocks.setState,
}));
vi.mock("../services/auditService.js", () => ({
  createAuditRecord: mocks.auditCreate,
  updateAuditRecord: mocks.auditUpdate,
}));
vi.mock("../services/logStreamBroker.js", () => ({ publishLogChunk: mocks.publishLogChunk }));
vi.mock("../services/notificationService.js", () => ({ sendJobNotification: vi.fn() }));
vi.mock("./telemetryFlushWorker.js", () => ({
  FLUSH_AGENT_TELEMETRY_JOB_NAME: "flush-agent-telemetry",
  flushAgentTelemetry: vi.fn(),
}));

import { jobProcessor } from "../workers/jobWorker.js";

const DATA = {
  protocolVersion: 2,
  orgId: "507f1f77bcf86cd799439011",
  jobId: "507f1f77bcf86cd799439012",
  targetAgentId: "507f1f77bcf86cd799439013",
  targetSocketId: "socket-1",
  runId: "run-1",
  targetExecutionId: "target-execution-1",
  attemptId: "attempt-1",
  operationId: "operation-1",
  actionVersion: "a".repeat(64),
  payload: { command: "echo ok" },
  allowedCommands: ["echo ok"],
  timeoutMs: 30_000,
  startBefore: 2_000_000_000_000,
  maxOutputBytes: 65_536,
  triggeredBy: { userId: "507f1f77bcf86cd799439014" },
  triggerType: "MANUAL_API",
};

function queueJob(data = DATA) {
  return { id: "bull-1", name: "dispatch-job", queueName: "immediate-jobs", data };
}

function result(exitCode) {
  return {
    protocolVersion: 2,
    jobId: DATA.jobId,
    targetAgentId: DATA.targetAgentId,
    runId: DATA.runId,
    targetExecutionId: DATA.targetExecutionId,
    attemptId: DATA.attemptId,
    operationId: DATA.operationId,
    outcome: "completed",
    exitCode,
    stdout: "",
    stderr: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditCreate.mockResolvedValue({ _id: "audit-1" });
  mocks.claim.mockResolvedValue({ claimed: true, run: { status: "DISPATCHING" } });
  mocks.findAgent.mockResolvedValue({
    _id: DATA.targetAgentId,
    allowedUsers: [],
    allowedJobs: [],
    allowedCommands: DATA.allowedCommands,
    tokenVersion: 0,
  });
  mocks.complete.mockResolvedValue({});
  mocks.acknowledged.mockResolvedValue({});
  mocks.historyCreate.mockResolvedValue({});
  mocks.acquireSlot.mockResolvedValue({ acquired: true, fencingToken: 1 });
  mocks.publishLogChunk.mockResolvedValue(undefined);
  mocks.findUser.mockResolvedValue({ _id: DATA.triggeredBy.userId, role: "operator" });
  mocks.findJob.mockResolvedValue({
    _id: DATA.jobId,
    orgId: DATA.orgId,
    permissions: { allowedUsers: [], allowedRoles: [] },
  });
  mocks.hasResourceAccess.mockReturnValue(true);
});

describe("job worker protocol-v2 behavior", () => {
  it.each([
    [0, "success", "SUCCEEDED"],
    [1, "failure", "FAILED"],
  ])("classifies completed exit %i truthfully", async (exitCode, status, runStatus) => {
    mocks.dispatch.mockReturnValue({
      emitted: true,
      ackPromise: Promise.resolve({}),
      resultPromise: Promise.resolve(result(exitCode)),
    });
    if (status === "success") {
      await expect(jobProcessor(queueJob())).resolves.toMatchObject({ status });
    } else {
      await expect(jobProcessor(queueJob())).rejects.toMatchObject({
        code: "NONZERO_EXIT",
      });
    }
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({ status: runStatus, exitCode }),
    );
    expect(mocks.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ exitCode }),
    );
  });

  it("records a lost acknowledgment as UNKNOWN and fails without redispatch", async () => {
    const error = Object.assign(new Error("lost"), { code: "DISPATCH_OUTCOME_UNKNOWN" });
    mocks.dispatch.mockReturnValue({
      emitted: true,
      ackPromise: Promise.reject(error),
      resultPromise: Promise.reject(error),
    });
    await expect(jobProcessor(queueJob())).rejects.toMatchObject({
      code: "DISPATCH_OUTCOME_UNKNOWN",
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({ status: "UNKNOWN" }),
    );
  });

  it("rejects a distinct accepted run when the job execution slot is already held", async () => {
    mocks.acquireSlot.mockResolvedValue({ acquired: false, existingWorker: "other-worker" });
    await expect(jobProcessor(queueJob())).rejects.toMatchObject({
      code: "CONCURRENT_JOB_EXECUTION",
      runId: DATA.runId,
    });
    expect(mocks.claim).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({
        status: "REJECTED",
        outcome: "REJECTED",
        reasonCode: "CONCURRENT_JOB_EXECUTION",
      }),
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("marks the outcome UNKNOWN when acknowledgment persistence fails", async () => {
    mocks.dispatch.mockReturnValue({
      emitted: true,
      ackPromise: Promise.resolve({}),
      resultPromise: Promise.resolve(result(0)),
    });
    mocks.acknowledged.mockRejectedValue(new Error("mongo unavailable"));
    await expect(jobProcessor(queueJob())).rejects.toMatchObject({
      code: "EXECUTION_STATE_PERSISTENCE_UNKNOWN",
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({
        status: "UNKNOWN",
        outcome: "UNKNOWN",
        reasonCode: "EXECUTION_STATE_PERSISTENCE_UNKNOWN",
      }),
    );
  });

  it("preserves a successful run when live output publication fails", async () => {
    mocks.dispatch.mockReturnValue({
      emitted: true,
      ackPromise: Promise.resolve({}),
      resultPromise: Promise.resolve({ ...result(0), stdout: "ok" }),
    });
    mocks.publishLogChunk.mockRejectedValue(new Error("redis unavailable"));
    await expect(jobProcessor(queueJob())).resolves.toMatchObject({ status: "success" });
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({ status: "SUCCEEDED" }),
    );
    expect(mocks.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "success", exitCode: 0 }),
    );
  });

  it.each([
    ["exit 0", { ...result(0), stdout: "known success" }, "SUCCEEDED", 0, "COMPLETED"],
    ["exit 1", { ...result(1), stderr: "known failure" }, "FAILED", 1, "COMPLETED"],
    [
      "unknown agent outcome",
      { ...result(null), outcome: "unexpected", exitCode: null },
      "UNKNOWN",
      null,
      "UNKNOWN",
    ],
  ])("preserves correlated %s evidence when terminal persistence fails", async (
    _case,
    agentResult,
    attemptedStatus,
    exitCode,
    outcome,
  ) => {
    mocks.dispatch.mockReturnValue({
      emitted: true,
      ackPromise: Promise.resolve({}),
      resultPromise: Promise.resolve(agentResult),
    });
    mocks.complete.mockRejectedValueOnce(new Error("mongo write failed"));
    await expect(jobProcessor(queueJob())).rejects.toMatchObject({
      code: "EXECUTION_RESULT_PERSISTENCE_UNKNOWN",
    });
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({ status: attemptedStatus, exitCode }),
    );
    expect(mocks.historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "unknown",
        exitCode,
        reasonCode: "EXECUTION_RESULT_PERSISTENCE_UNKNOWN",
      }),
    );
    expect(mocks.auditUpdate).toHaveBeenCalledWith(
      "audit-1",
      expect.objectContaining({
        status: "UNKNOWN",
        outcome,
        exitCode,
      }),
    );
  });

  it.each([
    ["removed user", null, { _id: DATA.jobId }, true],
    ["demoted viewer", { _id: DATA.triggeredBy.userId, role: "viewer" }, { _id: DATA.jobId }, true],
    ["revoked job access", { _id: DATA.triggeredBy.userId, role: "operator" }, { _id: DATA.jobId }, false],
  ])("rechecks queued authorization for %s and emits nothing", async (_case, user, currentJob, hasAccess) => {
    mocks.findUser.mockResolvedValue(user);
    mocks.findJob.mockResolvedValue(currentJob);
    mocks.hasResourceAccess.mockReturnValue(hasAccess);
    await expect(jobProcessor(queueJob())).rejects.toMatchObject({
      code: "EXECUTION_AUTHORIZATION_REVOKED",
    });
    expect(mocks.complete).toHaveBeenCalledWith(
      DATA.runId,
      DATA.attemptId,
      expect.objectContaining({ status: "REJECTED", outcome: "REJECTED" }),
    );
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch a redelivered attempt that was already claimed", async () => {
    mocks.claim.mockResolvedValue({
      claimed: false,
      run: { status: "UNKNOWN" },
    });
    const processed = await jobProcessor(queueJob());
    expect(processed).toMatchObject({ duplicateDelivery: true, status: "unknown" });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.auditUpdate).toHaveBeenCalledWith(
      "audit-1",
      expect.objectContaining({ status: "SKIPPED" }),
    );
  });

  it("fails closed for a legacy targetless shell queue item", async () => {
    await expect(
      jobProcessor(
        queueJob({ jobId: DATA.jobId, orgId: DATA.orgId, payload: { command: "echo old" } }),
      ),
    ).rejects.toMatchObject({ code: "PROTOCOL_V2_RUN_REQUIRED" });
    expect(mocks.findAgent).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
