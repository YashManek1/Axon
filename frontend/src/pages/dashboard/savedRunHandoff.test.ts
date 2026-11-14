import { describe, expect, it } from "vitest";
import { formatSavedRunHandoff, normalizeMongoId, normalizeRunUuid } from "./savedRunHandoff";

const jobId = "507f1f77bcf86cd799439011";
const targetId = "507f1f77bcf86cd799439012";
const runId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const sample = {
  jobId: jobId.toUpperCase(), runId: runId.toUpperCase(), targetAgentId: targetId.toUpperCase(), status: "ACKNOWLEDGED", requiresReview: true,
  createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:01:00.000Z",
  attempts: [{ attemptId, sequence: 0, targetExecutionId: "33333333-3333-4333-8333-333333333333", operationId: "44444444-4444-4444-8444-444444444444", status: "ACKNOWLEDGED", outcome: "COMPLETED", dispatchedAt: "2026-10-02T00:00:01.000Z", acknowledgedAt: "2026-10-02T00:00:02.000Z", completedAt: "2026-10-02T00:00:03.000Z", exitCode: 0 }],
  terminalSummary: { status: "SUCCEEDED", outcome: "COMPLETED", completedAt: "2026-10-02T00:01:00.000Z", exitCode: 0 },
};

describe("formatSavedRunHandoff", () => {
  it.each([null, 42, {}, "", ` ${jobId}`, `${jobId}\n`, "g".repeat(24)])("does not repair invalid Mongo identity %j", (value) => {
    expect(normalizeMongoId(value)).toBeNull();
    expect(formatSavedRunHandoff(sample, value, runId)).toEqual({ error: "invalid-identity" });
  });
  it.each([null, 42, {}, ` ${runId}`, `${runId}\n`, "11111111-1111-0111-8111-111111111111", "11111111-1111-9111-8111-111111111111", "11111111-1111-4111-7111-111111111111"]) ("rejects invalid UUID %j", (value) => {
    expect(normalizeRunUuid(value)).toBeNull();
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("accepts canonical UUID version %i", (version) => {
    expect(normalizeRunUuid(`AAAAAAAA-AAAA-${version}AAA-BAAA-AAAAAAAAAAAA`)).toBe(`aaaaaaaa-aaaa-${version}aaa-baaa-aaaaaaaaaaaa`);
  });
  it.each(["1", "2026-02-30T00:00:00.000Z", "2026-10-02", "2026-10-02T00:00:00", "2026-10-02T00:00:00+00:00", "2026-10-02T24:00:00.000Z", "2026-10-02T00:00:00.000Z\n", null, 0])("does not reinterpret malformed UTC timestamp %j", (createdAt) => {
    const result = formatSavedRunHandoff({ ...sample, createdAt }, jobId, runId);
    expect("handoff" in result && result.handoff.text).toContain("Created at (UTC): Unavailable");
  });
  it("accepts UTC seconds, preserves zero and handles invalid retrieval dates without throwing", () => {
    const result = formatSavedRunHandoff({ ...sample, createdAt: "2026-10-02T00:00:00Z" }, jobId, runId, new Date(NaN));
    expect("handoff" in result && result.handoff.text).toContain("Created at (UTC): 2026-10-02T00:00:00.000Z");
    expect("handoff" in result && result.handoff.text).toContain("Retrieved at (UTC): Unavailable");
    expect("handoff" in result && result.handoff.text).toContain("sequence: 0");
    expect("handoff" in result && result.handoff.text).toContain("exit code: 0");
  });
  it.each(["ACCEPTED", "QUEUED", "DISPATCHING", "ACKNOWLEDGED", "SUCCEEDED", "FAILED", "TIMED_OUT", "REJECTED", "CANCELLED", "UNKNOWN"])("allows saved status %s without asserting readiness", (status) => {
    const result = formatSavedRunHandoff({ ...sample, status, terminalSummary: { status } }, jobId, runId);
    const text = "handoff" in result ? result.handoff.text : "";
    expect(text).toContain(`Saved status: ${status}`);
    expect(text).toContain(`Terminal status: ${status}`);
    expect(text).toContain("does not authorize retry, hold release");
  });
  it.each(["PENDING", "DISPATCHING", "ACKNOWLEDGED", "SUCCEEDED", "FAILED", "TIMED_OUT", "REJECTED", "CANCELLED", "UNKNOWN"])("allows attempt status %s", (status) => {
    const result = formatSavedRunHandoff({ ...sample, attempts: [{ ...sample.attempts[0], status }] }, jobId, runId);
    expect("handoff" in result && result.handoff.text).toContain(`Attempt 1 status: ${status}`);
  });
  it.each(["COMPLETED", "REJECTED", "TIMED_OUT", "CANCELLED", "UNKNOWN"])("allows recognized outcome %s", (outcome) => {
    const result = formatSavedRunHandoff({ ...sample, attempts: [{ outcome }], terminalSummary: { outcome } }, jobId, runId);
    expect("handoff" in result && result.handoff.text).toContain(`Attempt 1 outcome: ${outcome}`);
    expect("handoff" in result && result.handoff.text).toContain(`Terminal outcome: ${outcome}`);
  });
  it("never echoes nested secrets or mutates the received DTO", () => {
    const payload = { ...sample, name: "SECRET_NAME", command: "SECRET_COMMAND", approval: "SECRET_APPROVAL", requester: "SECRET_REQUESTER", status: "SECRET_STATUS", attempts: [{ ...sample.attempts[0], reasonCode: "SECRET_REASON", output: "SECRET_OUTPUT", status: "SECRET_ATTEMPT", outcome: "SECRET_OUTCOME" }], terminalSummary: { ...sample.terminalSummary, reasonCode: "SECRET_TERMINAL", logs: "SECRET_LOGS" } };
    const before = JSON.stringify(payload);
    Object.freeze(payload); Object.freeze(payload.attempts); Object.freeze(payload.attempts[0]); Object.freeze(payload.terminalSummary);
    const result = formatSavedRunHandoff(payload, jobId, runId);
    expect("handoff" in result && result.handoff.text).not.toContain("SECRET_");
    expect(JSON.stringify(payload)).toBe(before);
  });
  it("handles missing and malformed optional objects with fixed fallback text", () => {
    const result = formatSavedRunHandoff({ jobId, runId, attempts: [null, false, []], terminalSummary: [] }, jobId, runId);
    expect("handoff" in result && result.handoff.text).toContain("Requires review: Not recorded");
    expect("handoff" in result && result.handoff.text).toContain("Attempt 3 status: Unrecognized / unavailable");
    expect("handoff" in result && result.handoff.text).toContain("Terminal outcome: Not recorded");
  });
  it("excludes retrieval time from evidence comparison", () => {
    const first = formatSavedRunHandoff(sample, jobId, runId, new Date("2026-10-02T00:00:00Z"));
    const second = formatSavedRunHandoff(sample, jobId, runId, new Date("2026-10-02T00:00:01Z"));
    if (!("handoff" in first) || !("handoff" in second)) throw new Error("fixture identity rejected");
    expect(first.handoff.canonical).toBe(second.handoff.canonical);
    expect(first.handoff.text).not.toBe(second.handoff.text);
  });
  it("normalizes canonical identities and emits allowlisted plaintext only", () => {
    const result = formatSavedRunHandoff({ ...sample, reasonCode: "SECRET_REASON", transitions: [{ reasonCode: "SECRET_TRANSITION" }], logs: "SECRET_LOG", request: "SECRET_REQUEST", output: "SECRET_OUTPUT" }, jobId, runId, new Date("2026-10-02T02:00:00.000Z"));
    expect("handoff" in result && result.handoff.text).toContain(`Original job ID: ${jobId}`);
    expect("handoff" in result && result.handoff.text).toContain("exit code: 0");
    expect("handoff" in result && result.handoff.text).not.toMatch(/SECRET_REASON|SECRET_TRANSITION|SECRET_LOG|SECRET_REQUEST|SECRET_OUTPUT/);
  });

  it("rejects malformed or mismatched required identities without repairing them", () => {
    expect(formatSavedRunHandoff({ ...sample, jobId: " job" }, jobId, runId)).toEqual({ error: "identity-mismatch" });
    expect(formatSavedRunHandoff(sample, "not-an-id", runId)).toEqual({ error: "invalid-identity" });
    expect(formatSavedRunHandoff({ ...sample, runId: "55555555-5555-4555-8555-555555555555" }, jobId, runId)).toEqual({ error: "identity-mismatch" });
  });

  it("redacts invalid optional identifiers and malformed values", () => {
    const result = formatSavedRunHandoff({ ...sample, targetAgentId: "agent-secret", createdAt: "not-date", attempts: [{ attemptId: "secret", sequence: -1, status: "ACKNOWLEDGED", targetExecutionId: "no", operationId: "bad", outcome: "not-an-outcome", exitCode: "0" }] }, jobId, runId);
    const text = "handoff" in result ? result.handoff.text : "";
    expect(text).toContain("Not recorded / invalid identifier");
    expect(text).toContain("Created at (UTC): Unavailable");
    expect(text).toContain("outcome: Unrecognized / unavailable");
    expect(text).not.toContain("agent-secret");
  });

  it("preserves array order and states explicit truncation", () => {
    const attempts = Array.from({ length: 22 }, (_, index) => ({ attemptId, sequence: index, status: "PENDING" }));
    const result = formatSavedRunHandoff({ ...sample, attempts }, jobId, runId);
    const text = "handoff" in result ? result.handoff.text : "";
    expect(text).toContain("Attempt 20 sequence: 19");
    expect(text).toContain("Attempts omitted: 2");
    expect(text).not.toContain("Attempt 21");
  });
});
