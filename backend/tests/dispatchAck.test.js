import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobExecutionRouter } from "../services/jobExecutionRouter.js";

const ENVELOPE = {
  protocolVersion: 2,
  orgId: "org-1",
  jobId: "job-x",
  targetAgentId: "agent-1",
  runId: "run-1",
  targetExecutionId: "target-execution-1",
  attemptId: "attempt-1",
  operationId: "operation-1",
  actionVersion: "a".repeat(64),
  command: "echo hi",
  allowedCommands: ["echo hello"],
  timeoutMs: 2_000,
  startBefore: 2_000_000_000_000,
  maxOutputBytes: 65_536,
};

function correlated(extra = {}) {
  return {
    protocolVersion: 2,
    jobId: ENVELOPE.jobId,
    targetAgentId: ENVELOPE.targetAgentId,
    runId: ENVELOPE.runId,
    targetExecutionId: ENVELOPE.targetExecutionId,
    attemptId: ENVELOPE.attemptId,
    operationId: ENVELOPE.operationId,
    ...extra,
  };
}

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.agentId = "agent-1";
    this.orgId = "org-1";
    this.clientType = "agent";
    this.authGeneration = 0;
    this.protocolVersions = [2];
    this.releaseId = process.env.AXON_RELEASE_ID;
  }

  emit(eventName, payload) {
    if (eventName === "execute_command") {
      this.lastCommand = payload;
      return true;
    }
    return super.emit(eventName, payload);
  }
}

function makeRouter() {
  const socket = new MockSocket();
  const io = { sockets: { sockets: new Map([["socket-1", socket]]) } };
  return { socket, router: createJobExecutionRouter(io) };
}

describe("protocol-v2 dispatch acknowledgement", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("classifies a missing acknowledgment as unknown after five seconds", async () => {
    const { router } = makeRouter();
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    const ack = expect(dispatch.ackPromise).rejects.toMatchObject({
      code: "DISPATCH_OUTCOME_UNKNOWN",
    });
    const result = expect(dispatch.resultPromise).rejects.toMatchObject({
      code: "DISPATCH_OUTCOME_UNKNOWN",
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all([ack, result]);
  });

  it("a correlated result proves receipt even when the separate ack was lost", async () => {
    const { router, socket } = makeRouter();
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    const result = correlated({ outcome: "completed", exitCode: 0 });
    socket.emit("command_result", result);
    await expect(dispatch.ackPromise).resolves.toEqual(result);
    await expect(dispatch.resultPromise).resolves.toEqual(result);
  });

  it("cleans up listeners after a correlated result", async () => {
    const { router, socket } = makeRouter();
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    socket.emit("job_ack", correlated());
    await dispatch.ackPromise;
    socket.emit("command_result", correlated({ outcome: "completed", exitCode: 0 }));
    await dispatch.resultPromise;
    expect(socket.listenerCount("job_ack")).toBe(0);
    expect(socket.listenerCount("command_result")).toBe(0);
    expect(socket.listenerCount("disconnect")).toBe(0);
  });

  it("classifies a missing result after acknowledgment as unknown", async () => {
    const { router, socket } = makeRouter();
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    socket.emit("job_ack", correlated());
    await dispatch.ackPromise;
    const result = expect(dispatch.resultPromise).rejects.toMatchObject({
      code: "EXECUTION_RESULT_UNKNOWN",
    });
    await vi.advanceTimersByTimeAsync(ENVELOPE.timeoutMs + 30_000);
    await result;
  });
});
