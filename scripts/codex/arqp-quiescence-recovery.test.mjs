import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";

/**
 * Validates the Agent Reconnect Quiescence Proof (ARQP) machine protocol
 * per docs/decisions/R2-02-dispatched-unknown-recovery-contract-v1.md.
 */

export function verifyQuiescenceCertificate({
  run,
  certificate,
  agentCurrentGeneration,
}) {
  const attempt = run.attempts?.[0];

  // 1. Must be an UNKNOWN run
  if (run.status !== "UNKNOWN") {
    return { valid: false, reason: "RUN_NOT_UNKNOWN" };
  }

  // 2. Certificate attemptId must match run attemptId exactly
  if (certificate.attemptId !== attempt?.attemptId) {
    return { valid: false, reason: "ATTEMPT_ID_MISMATCH" };
  }

  // 3. Target agent ID must match
  if (certificate.targetAgentId !== String(run.targetAgentId)) {
    return { valid: false, reason: "TARGET_AGENT_MISMATCH" };
  }

  // 4. Must be confirmed strictly after a restart or verified dead
  if (!certificate.processDeadConfirmed || !certificate.journalTerminalConfirmed) {
    return { valid: false, reason: "PROCESS_NOT_CONFIRMED_QUIESCENT" };
  }

  // 5. Connection generation must be strictly newer than the attempt dispatch generation
  if (certificate.generation <= attempt.dispatchedGeneration) {
    return { valid: false, reason: "STALE_OR_PRIOR_GENERATION" };
  }

  if (certificate.generation !== agentCurrentGeneration) {
    return { valid: false, reason: "GENERATION_NOT_CURRENT" };
  }

  return {
    valid: true,
    certificateHash: crypto.createHash("sha256").update(JSON.stringify(certificate)).digest("hex"),
  };
}

test("ARQP accepts valid quiescence certificate from newer agent generation", () => {
  const attemptId = crypto.randomUUID();
  const agentId = "agent-node-01";

  const run = {
    status: "UNKNOWN",
    targetAgentId: agentId,
    attempts: [{
      attemptId,
      dispatchedGeneration: 1,
    }],
  };

  const certificate = {
    version: 1,
    attemptId,
    targetAgentId: agentId,
    processDeadConfirmed: true,
    journalTerminalConfirmed: true,
    generation: 2,
    verifiedAt: new Date().toISOString(),
  };

  const result = verifyQuiescenceCertificate({
    run,
    certificate,
    agentCurrentGeneration: 2,
  });

  assert.equal(result.valid, true);
  assert.ok(result.certificateHash);
});

test("ARQP rejects certificate if process death is unconfirmed", () => {
  const attemptId = crypto.randomUUID();
  const agentId = "agent-node-01";

  const run = {
    status: "UNKNOWN",
    targetAgentId: agentId,
    attempts: [{ attemptId, dispatchedGeneration: 1 }],
  };

  const certificate = {
    version: 1,
    attemptId,
    targetAgentId: agentId,
    processDeadConfirmed: false, // Process still possibly alive or orphan
    journalTerminalConfirmed: true,
    generation: 2,
    verifiedAt: new Date().toISOString(),
  };

  const result = verifyQuiescenceCertificate({
    run,
    certificate,
    agentCurrentGeneration: 2,
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "PROCESS_NOT_CONFIRMED_QUIESCENT");
});

test("ARQP rejects certificate if generation is not strictly newer", () => {
  const attemptId = crypto.randomUUID();
  const agentId = "agent-node-01";

  const run = {
    status: "UNKNOWN",
    targetAgentId: agentId,
    attempts: [{ attemptId, dispatchedGeneration: 2 }],
  };

  const certificate = {
    version: 1,
    attemptId,
    targetAgentId: agentId,
    processDeadConfirmed: true,
    journalTerminalConfirmed: true,
    generation: 2, // Same generation — not a proven reconnect/reboot
    verifiedAt: new Date().toISOString(),
  };

  const result = verifyQuiescenceCertificate({
    run,
    certificate,
    agentCurrentGeneration: 2,
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "STALE_OR_PRIOR_GENERATION");
});
