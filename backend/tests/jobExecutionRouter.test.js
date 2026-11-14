import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobExecutionRouter } from "../services/jobExecutionRouter.js";

const ENVELOPE = {
  protocolVersion: 2,
  orgId: "org-1",
  jobId: "job-1",
  targetAgentId: "agent-1",
  runId: "run-1",
  targetExecutionId: "target-execution-1",
  attemptId: "attempt-1",
  operationId: "operation-1",
  actionVersion: "a".repeat(64),
  command: "echo ok",
  allowedCommands: ["echo hello"],
  timeoutMs: 1_000,
  startBefore: 2_000_000_000_000,
  maxOutputBytes: 65_536,
};

class MockSocket extends EventEmitter {
  constructor(agentId, orgId, releaseId = process.env.AXON_RELEASE_ID) {
    super();
    this.agentId = agentId;
    this.orgId = orgId;
    this.clientType = "agent";
    this.authGeneration = 0;
    this.protocolVersions = [2];
    this.releaseId = releaseId;
    this.commands = [];
  }
  emit(name, payload) {
    if (name === "execute_command") {
      this.commands.push(payload);
      return true;
    }
    return super.emit(name, payload);
  }
}

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

describe("protocol-v2 job execution router", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits only to the exact selected socket and accepts fully correlated result", async () => {
    const selected = new MockSocket("agent-1", "org-1");
    const other = new MockSocket("agent-2", "org-1");
    const router = createJobExecutionRouter({
      sockets: { sockets: new Map([["socket-1", selected], ["socket-2", other]]) },
    });
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    selected.emit("job_ack", correlated());
    selected.emit("command_result", correlated({ outcome: "completed", exitCode: 0 }));
    await expect(dispatch.resultPromise).resolves.toMatchObject({ exitCode: 0 });
    expect(selected.commands).toHaveLength(1);
    expect(other.commands).toHaveLength(0);
  });

  it("fails closed when socket ownership changed and never falls back", async () => {
    const stale = new MockSocket("agent-2", "org-1");
    const other = new MockSocket("agent-1", "org-1");
    const router = createJobExecutionRouter({
      sockets: { sockets: new Map([["stale", stale], ["other", other]]) },
    });
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "stale", 0);
    await expect(dispatch.ackPromise).rejects.toMatchObject({
      code: "TARGET_SOCKET_OWNERSHIP_CHANGED",
    });
    await dispatch.resultPromise.catch(() => {});
    expect(stale.commands).toHaveLength(0);
    expect(other.commands).toHaveLength(0);
  });

  it("ignores a correlation mismatch", async () => {
    const selected = new MockSocket("agent-1", "org-1");
    const router = createJobExecutionRouter({
      sockets: { sockets: new Map([["socket-1", selected]]) },
    });
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    const ack = dispatch.ackPromise.catch((error) => error);
    selected.emit("command_result", correlated({ attemptId: "wrong", exitCode: 0 }));
    const result = expect(dispatch.resultPromise).rejects.toMatchObject({
      code: "DISPATCH_OUTCOME_UNKNOWN",
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    await ack;
  });

  it("marks lost result unknown after a valid acknowledgment", async () => {
    const selected = new MockSocket("agent-1", "org-1");
    const router = createJobExecutionRouter({
      sockets: { sockets: new Map([["socket-1", selected]]) },
    });
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    selected.emit("job_ack", correlated());
    await dispatch.ackPromise;
    const result = expect(dispatch.resultPromise).rejects.toMatchObject({
      code: "EXECUTION_RESULT_UNKNOWN",
    });
    await vi.advanceTimersByTimeAsync(30_999);
    selected.emit("command_result", correlated({ attemptId: "wrong", exitCode: 0 }));
    await vi.advanceTimersByTimeAsync(1);
    await result;
  });

  it("rejects a legacy-capability socket without emitting", async () => {
    const selected = new MockSocket("agent-1", "org-1");
    selected.protocolVersions = [];
    const router = createJobExecutionRouter({
      sockets: { sockets: new Map([["socket-1", selected]]) },
    });
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    await expect(dispatch.ackPromise).rejects.toMatchObject({
      code: "AGENT_PROTOCOL_UNSUPPORTED",
    });
    await dispatch.resultPromise.catch(() => {});
    expect(selected.commands).toHaveLength(0);
  });

  it("rejects a socket authenticated under an older credential generation", async () => {
    const selected = new MockSocket("agent-1", "org-1");
    selected.authGeneration = 1;
    const router = createJobExecutionRouter({
      sockets: { sockets: new Map([["socket-1", selected]]) },
    });
    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 2);
    await expect(dispatch.ackPromise).rejects.toMatchObject({
      code: "TARGET_SOCKET_OWNERSHIP_CHANGED",
    });
    await dispatch.resultPromise.catch(() => {});
    expect(selected.commands).toHaveLength(0);
  });

  it("dispatches when the authenticated agent release matches", async () => {
    const selected = new MockSocket("agent-1", "org-1", "release-a");
    const router = createJobExecutionRouter(
      { sockets: { sockets: new Map([["socket-1", selected]]) } },
      { expectedReleaseId: "release-a" },
    );

    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    selected.emit("job_ack", correlated());
    selected.emit("command_result", correlated({ outcome: "completed", exitCode: 0 }));

    await expect(dispatch.resultPromise).resolves.toMatchObject({ exitCode: 0 });
    expect(selected.commands).toHaveLength(1);
  });

  it.each([
    ["different", "release-b"],
    ["missing", null],
  ])("fails closed when the authenticated agent release is %s", async (_case, releaseId) => {
    const selected = new MockSocket("agent-1", "org-1", releaseId);
    const router = createJobExecutionRouter(
      { sockets: { sockets: new Map([["socket-1", selected]]) } },
      { expectedReleaseId: "release-a" },
    );

    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    await expect(dispatch.ackPromise).rejects.toMatchObject({
      code: "AGENT_RELEASE_MISMATCH",
    });
    await expect(dispatch.resultPromise).rejects.toMatchObject({
      code: "AGENT_RELEASE_MISMATCH",
    });
    expect(selected.commands).toHaveLength(0);
  });

  it("keeps legacy sockets compatible when no release is configured", async () => {
    const selected = new MockSocket("agent-1", "org-1");
    const router = createJobExecutionRouter(
      { sockets: { sockets: new Map([["socket-1", selected]]) } },
      { expectedReleaseId: null },
    );

    const dispatch = router.dispatchCommandToAgent(ENVELOPE, "socket-1", 0);
    selected.emit("job_ack", correlated());
    selected.emit("command_result", correlated({ outcome: "completed", exitCode: 0 }));

    await expect(dispatch.resultPromise).resolves.toMatchObject({ exitCode: 0 });
    expect(selected.commands).toHaveLength(1);
  });
});
