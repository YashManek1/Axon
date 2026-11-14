import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Validates the strict behavioral boundary between:
 * 1. Prospective never-dispatched UNKNOWN (with valid nonDispatchProof)
 *    -> Eligible for operator release intent and hold cleanup.
 * 2. Real connected-agent dispatched UNKNOWN (reached DISPATCHING/ACKNOWLEDGED)
 *    -> Strictly blocked from release; hold remains permanently retained.
 */

export function classifyUnknownOutcome(run) {
  const attempt = run.attempts?.[0];
  const proof = run.nonDispatchProof;

  // A run that reached DISPATCHING or ACKNOWLEDGED cannot have a valid never-dispatched proof
  const wasDispatched = Boolean(
    attempt?.dispatchedAt ||
    attempt?.acknowledgedAt ||
    run.transitions?.some(t => ["DISPATCHING", "ACKNOWLEDGED"].includes(t.to))
  );

  if (wasDispatched) {
    return {
      type: "DISPATCHED_UNKNOWN",
      eligibleForHoldResolution: false,
      blockedReason: "NO_SUPPORTED_PROOF",
      holdRetained: true,
      safeRetryPermitted: false,
    };
  }

  // Pre-dispatch failure with atomic non-dispatch witness
  const hasValidProof = Boolean(
    run.reconciliationSafetyVersion === 1 &&
    proof &&
    proof.version === 1 &&
    proof.attemptId === attempt?.attemptId &&
    !attempt?.dispatchedAt &&
    !attempt?.acknowledgedAt
  );

  if (hasValidProof) {
    return {
      type: "NEVER_DISPATCHED_UNKNOWN",
      eligibleForHoldResolution: true,
      blockedReason: null,
      holdRetained: run.operatorResolution ? false : true,
      safeRetryPermitted: false, // Never auto-retries; requires explicit fresh preview/approval
    };
  }

  // Legacy or unproven UNKNOWN
  return {
    type: "UNPROVEN_UNKNOWN",
    eligibleForHoldResolution: false,
    blockedReason: "NO_SUPPORTED_PROOF",
    holdRetained: true,
    safeRetryPermitted: false,
  };
}

test("connected-agent dispatched UNKNOWN is strictly non-reconcilable and retains hold", () => {
  const dispatchedRun = {
    runId: randomUUID(),
    status: "UNKNOWN",
    reconciliationSafetyVersion: 1,
    attempts: [{
      attemptId: randomUUID(),
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      dispatchedAt: new Date(),
      acknowledgedAt: new Date(),
    }],
    transitions: [
      { sequence: 1, from: "ACCEPTED", to: "DISPATCHING", at: new Date() },
      { sequence: 2, from: "DISPATCHING", to: "ACKNOWLEDGED", at: new Date() },
      { sequence: 3, from: "ACKNOWLEDGED", to: "UNKNOWN", at: new Date() },
    ],
    nonDispatchProof: null,
  };

  const classification = classifyUnknownOutcome(dispatchedRun);
  assert.equal(classification.type, "DISPATCHED_UNKNOWN");
  assert.equal(classification.eligibleForHoldResolution, false);
  assert.equal(classification.blockedReason, "NO_SUPPORTED_PROOF");
  assert.equal(classification.holdRetained, true);
  assert.equal(classification.safeRetryPermitted, false);
});

test("prospective never-dispatched UNKNOWN allows operator release intent without auto-retry", () => {
  const attemptId = randomUUID();
  const proofId = randomUUID();
  const neverDispatchedRun = {
    runId: randomUUID(),
    status: "UNKNOWN",
    reconciliationSafetyVersion: 1,
    attempts: [{
      attemptId,
      status: "UNKNOWN",
      outcome: "UNKNOWN",
      dispatchedAt: null,
      acknowledgedAt: null,
    }],
    transitions: [
      { sequence: 1, from: "ACCEPTED", to: "UNKNOWN", at: new Date() },
    ],
    nonDispatchProof: {
      version: 1,
      proofId,
      attemptId,
      fromTransitionSequence: 0,
      terminalTransitionSequence: 1,
      recordedAt: new Date(),
    },
  };

  const classification = classifyUnknownOutcome(neverDispatchedRun);
  assert.equal(classification.type, "NEVER_DISPATCHED_UNKNOWN");
  assert.equal(classification.eligibleForHoldResolution, true);
  assert.equal(classification.blockedReason, null);
  assert.equal(classification.safeRetryPermitted, false);
});

test("legacy UNKNOWN without safety version or proof is blocked fail-closed", () => {
  const legacyRun = {
    runId: randomUUID(),
    status: "UNKNOWN",
    attempts: [{
      attemptId: randomUUID(),
      status: "UNKNOWN",
      outcome: "UNKNOWN",
    }],
    transitions: [
      { sequence: 1, from: "ACCEPTED", to: "UNKNOWN", at: new Date() },
    ],
  };

  const classification = classifyUnknownOutcome(legacyRun);
  assert.equal(classification.type, "UNPROVEN_UNKNOWN");
  assert.equal(classification.eligibleForHoldResolution, false);
  assert.equal(classification.blockedReason, "NO_SUPPORTED_PROOF");
  assert.equal(classification.holdRetained, true);
});
