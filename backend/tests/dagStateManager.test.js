import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let redisConnection;
let dagStateManager;

beforeAll(async () => {
  const { default: Redis } = await import("ioredis-mock");
  redisConnection = new Redis();

  vi.doMock("../config/queue.js", () => ({
    redisConnection,
  }));

  dagStateManager = await import("../services/dagStateManager.js");
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await redisConnection.flushall();
});

describe("dagStateManager", () => {
  it("setJobState then getJobState returns the state", async () => {
    await dagStateManager.setJobState("job-1", "COMPLETED");

    await expect(dagStateManager.getJobState("job-1")).resolves.toBe(
      "COMPLETED",
    );
  });

  it("checkDependenciesMet with all deps COMPLETED returns met true", async () => {
    await dagStateManager.setJobState("dep-1", "COMPLETED");
    await dagStateManager.setJobState("dep-2", "COMPLETED");

    await expect(
      dagStateManager.checkDependenciesMet("job-1", ["dep-1", "dep-2"]),
    ).resolves.toEqual({ met: true, blockedBy: [] });
  });

  it("checkDependenciesMet with one dep FAILED returns blocked state", async () => {
    await dagStateManager.setJobState("dep-1", "COMPLETED");
    await dagStateManager.setJobState("dep-2", "FAILED");

    await expect(
      dagStateManager.checkDependenciesMet("job-1", ["dep-1", "dep-2"]),
    ).resolves.toEqual({
      met: false,
      blockedBy: [{ jobId: "dep-2", currentState: "FAILED" }],
    });
  });

  it("checkDependenciesMet with one dep never set returns NEVER_RUN", async () => {
    await dagStateManager.setJobState("dep-1", "COMPLETED");

    await expect(
      dagStateManager.checkDependenciesMet("job-1", ["dep-1", "dep-2"]),
    ).resolves.toEqual({
      met: false,
      blockedBy: [{ jobId: "dep-2", currentState: "NEVER_RUN" }],
    });
  });

  it("checkDependenciesMet executes in one Redis pipeline call", async () => {
    await dagStateManager.setJobState("dep-1", "COMPLETED");
    await dagStateManager.setJobState("dep-2", "COMPLETED");

    const originalPipeline = redisConnection.pipeline.bind(redisConnection);
    const execSpy = vi.fn();

    vi.spyOn(redisConnection, "pipeline").mockImplementation(() => {
      const pipeline = originalPipeline();
      const originalExec = pipeline.exec.bind(pipeline);
      pipeline.exec = (...args) => {
        execSpy();
        return originalExec(...args);
      };
      return pipeline;
    });

    await dagStateManager.checkDependenciesMet("job-1", ["dep-1", "dep-2"]);

    expect(redisConnection.pipeline).toHaveBeenCalledTimes(1);
    expect(execSpy).toHaveBeenCalledTimes(1);
  });

  it("two concurrent checkDependenciesMet calls return the same result", async () => {
    await dagStateManager.setJobState("dep-1", "COMPLETED");
    await dagStateManager.setJobState("dep-2", "FAILED");

    const results = await Promise.all([
      dagStateManager.checkDependenciesMet("job-1", ["dep-1", "dep-2"]),
      dagStateManager.checkDependenciesMet("job-1", ["dep-1", "dep-2"]),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual({
      met: false,
      blockedBy: [{ jobId: "dep-2", currentState: "FAILED" }],
    });
  });

  it("acquireExecutionSlot first call returns acquired true", async () => {
    await expect(
      dagStateManager.acquireExecutionSlot("job-1", "worker-1"),
    ).resolves.toEqual({ acquired: true, existingWorker: null });
  });

  it("acquireExecutionSlot second concurrent call returns acquired false", async () => {
    const results = await Promise.all([
      dagStateManager.acquireExecutionSlot("job-1", "worker-1"),
      dagStateManager.acquireExecutionSlot("job-1", "worker-2"),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);
    expect(results.find((result) => !result.acquired).existingWorker).toEqual(
      expect.any(String),
    );
  });
});
