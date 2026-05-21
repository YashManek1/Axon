import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJobExecutionRouter } from "../services/jobExecutionRouter.js";

class MockSocket extends EventEmitter {
  emit(eventName, payload) {
    if (eventName === "execute_command") {
      this.lastCommand = payload;
      return true;
    }

    return super.emit(eventName, payload);
  }
}

function createRouterWithSocket(agentId = "agent-1") {
  const socket = new MockSocket();
  const io = {
    sockets: {
      sockets: new Map([[agentId, socket]]),
    },
  };

  return {
    socket,
    router: createJobExecutionRouter(io),
  };
}

describe("jobExecutionRouter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatchCommandToAgent resolves when matching command_result is emitted", async () => {
    const { router, socket } = createRouterWithSocket();

    const promise = router.dispatchCommandToAgent(
      "job-1",
      "agent-1",
      "echo ok",
      1000,
    );

    socket.emit("command_result", {
      jobId: "job-1",
      stdout: "ok",
      stderr: "",
      exitCode: 0,
    });

    await expect(promise).resolves.toEqual({
      jobId: "job-1",
      stdout: "ok",
      stderr: "",
      exitCode: 0,
    });
  });

  it("dispatchCommandToAgent ignores command_result with a different jobId", async () => {
    const { router, socket } = createRouterWithSocket();
    let settled = false;

    const promise = router.dispatchCommandToAgent(
      "job-1",
      "agent-1",
      "echo ok",
      1000,
    );
    promise
      .then(() => {
        settled = true;
      })
      .catch(() => {
        settled = true;
      });

    socket.emit("command_result", {
      jobId: "job-2",
      stdout: "wrong job",
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    const expectation = expect(promise).rejects.toMatchObject({
      code: "EXECUTION_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });

  it("dispatchCommandToAgent rejects when the socket disconnects", async () => {
    const { router, socket } = createRouterWithSocket();

    const promise = router.dispatchCommandToAgent(
      "job-1",
      "agent-1",
      "echo ok",
      1000,
    );

    socket.emit("disconnect");

    await expect(promise).rejects.toMatchObject({
      code: "AGENT_DISCONNECTED",
      message: "AGENT_DISCONNECTED",
    });
  });

  it("dispatchCommandToAgent rejects on timeout and removes listeners", async () => {
    const { router, socket } = createRouterWithSocket();

    const promise = router.dispatchCommandToAgent(
      "job-1",
      "agent-1",
      "echo ok",
      1000,
    );

    const expectation = expect(promise).rejects.toMatchObject({
      code: "EXECUTION_TIMEOUT",
      message: "EXECUTION_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
    expect(socket.listenerCount("command_result")).toBe(0);
  });

  it("dispatchCommandToAgent rejects when no socket is found", async () => {
    const router = createJobExecutionRouter({
      sockets: {
        sockets: new Map(),
      },
    });

    await expect(
      router.dispatchCommandToAgent("job-1", "missing-agent", "echo ok"),
    ).rejects.toMatchObject({
      code: "AGENT_NOT_CONNECTED",
    });
  });
});
