import { describe, expect, it } from "vitest";
import {
  buildExecutionResourceKey,
  calculateExecutionLockTtlSeconds,
} from "../services/executionResource.js";

describe("execution resource identity", () => {
  it("maps different jobs on the same organization target to one resource", () => {
    const first = buildExecutionResourceKey({ orgId: "org-1", targetAgentId: "agent-1", jobId: "job-1" });
    const second = buildExecutionResourceKey({ orgId: "org-1", targetAgentId: "agent-1", jobId: "job-2" });
    expect(first).toBe("org:org-1:agent:agent-1");
    expect(second).toBe(first);
  });

  it("keeps different organizations and targets isolated", () => {
    expect(buildExecutionResourceKey({ orgId: "org-1", targetAgentId: "agent-1", jobId: "job-1" }))
      .not.toBe(buildExecutionResourceKey({ orgId: "org-2", targetAgentId: "agent-1", jobId: "job-2" }));
    expect(buildExecutionResourceKey({ orgId: "org-1", targetAgentId: "agent-1", jobId: "job-1" }))
      .not.toBe(buildExecutionResourceKey({ orgId: "org-1", targetAgentId: "agent-2", jobId: "job-2" }));
  });

  it("falls back to the legacy job identity only for invalid targetless work", () => {
    expect(buildExecutionResourceKey({ orgId: "org-1", jobId: "job-1" }))
      .toBe("legacy-job:job-1");
  });
});

describe("execution resource lock lifetime", () => {
  it("covers the remaining dispatch window, command timeout, and completion margin", () => {
    expect(calculateExecutionLockTtlSeconds({
      timeoutMs: 300_000,
      startBefore: 1_060_000,
      now: 1_000_000,
    })).toBe(405);
  });

  it("clamps untrusted queue bounds and keeps a safe minimum", () => {
    expect(calculateExecutionLockTtlSeconds({ timeoutMs: 1, startBefore: 9_000_000, now: 0 }))
      .toBe(106);
    expect(calculateExecutionLockTtlSeconds({ timeoutMs: Number.MAX_SAFE_INTEGER, now: 0 }))
      .toBe(345);
    expect(calculateExecutionLockTtlSeconds({ timeoutMs: 100, startBefore: 0, now: 0 }))
      .toBe(60);
  });
});
