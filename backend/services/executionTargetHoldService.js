import ExecutionTargetHold from "../models/executionTargetHold.js";
import JobRun from "../models/jobRun.js";

const CONCLUSIVE_OUTCOMES = new Set(["COMPLETED", "REJECTED", "TIMED_OUT", "CANCELLED"]);
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function ownerFilter({ organizationId, targetAgentId, runId, attemptId, fencingToken }) {
  return { organizationId, targetAgentId, runId, attemptId, fencingToken };
}

export async function assertUniqueTargetIndexReady() {
  await ExecutionTargetHold.init();
  const indexes = await ExecutionTargetHold.collection.indexes();
  const ready = indexes.some((index) =>
    index.name === "execution_target_owner" &&
    index.unique === true &&
    index.key?.organizationId === 1 &&
    index.key?.targetAgentId === 1 &&
    Object.keys(index.key).length === 2 &&
    index.sparse !== true &&
    index.partialFilterExpression === undefined,
  );
  if (!ready) {
    throw new Error("Execution target unique index is not ready");
  }
}

function matchesProofAuthorizedRelease(run, owner, proofId, resolutionId) {
  const attempt = run?.attempts?.[0];
  const proof = run?.nonDispatchProof;
  const resolution = run?.operatorResolution;
  const priorTransition = run?.transitions?.find(
    (transition) => transition.sequence === proof?.fromTransitionSequence,
  );
  const terminalTransition = run?.transitions?.find(
    (transition) => transition.sequence === proof?.terminalTransitionSequence,
  );
  const reason = typeof resolution?.reason === "string" ? resolution.reason.trim() : "";
  return (
    run?.status === "UNKNOWN" &&
    run?.reconciliationSafetyVersion === 1 &&
    run?.attempts?.length === 1 &&
    attempt?.status === "UNKNOWN" &&
    attempt?.outcome === "UNKNOWN" &&
    !attempt?.dispatchedAt &&
    !attempt?.acknowledgedAt &&
    proof?.version === 1 &&
    CANONICAL_UUID.test(proof?.proofId ?? "") &&
    proof?.proofId === proofId &&
    proof?.attemptId === owner.attemptId &&
    String(proof?.targetAgentId) === String(owner.targetAgentId) &&
    proof?.terminalTransitionSequence === run.transitionSequence &&
    proof?.fromTransitionSequence + 1 === proof?.terminalTransitionSequence &&
    proof?.recordedAt instanceof Date &&
    priorTransition?.to === terminalTransition?.from &&
    terminalTransition?.from !== undefined &&
    ["ACCEPTED", "QUEUED"].includes(terminalTransition?.from) &&
    terminalTransition?.to === "UNKNOWN" &&
    terminalTransition?.source === "RECOVERY" &&
    terminalTransition?.attemptId === attempt?.attemptId &&
    terminalTransition?.at instanceof Date &&
    terminalTransition.at.getTime() === proof.recordedAt.getTime() &&
    resolution?.version === 1 &&
    CANONICAL_UUID.test(resolution?.resolutionId ?? "") &&
    resolution?.resolutionId === resolutionId &&
    SHA256_HEX.test(resolution?.requestFingerprint ?? "") &&
    resolution?.actorId &&
    ["admin", "operator"].includes(resolution?.actorRole) &&
    resolution?.recordedAt instanceof Date &&
    resolution?.proofId === proofId &&
    resolution?.terminalTransitionSequence === proof?.terminalTransitionSequence &&
    resolution?.purpose === "RELEASE_NEVER_DISPATCHED" &&
    reason.length >= 1 &&
    reason.length <= 500 &&
    resolution.reason === reason
  );
}

export async function observeExecutionTargetHold(owner) {
  await assertUniqueTargetIndexReady();
  const currentOwner = await ExecutionTargetHold.findOne({
    organizationId: owner.organizationId,
    targetAgentId: owner.targetAgentId,
    runId: owner.runId,
    attemptId: owner.attemptId,
  })
    .select({ _id: 0, organizationId: 1, targetAgentId: 1, runId: 1, attemptId: 1, fencingToken: 1 })
    .lean();

  return currentOwner
    ? { observation: "PRESENT", owner: currentOwner }
    : { observation: "ABSENT", owner: null };
}

export async function releaseQuiescenceAuthorizedExecutionTargetHold() {
  // Dispatched UNKNOWN release is not an accepted recovery boundary. This
  // helper is also reached by delayed workers, so retain unconditionally and
  // before any database operation, including for legacy persisted intents.
  return { released: false, retained: true, authorized: false };
}

export async function releaseProofAuthorizedExecutionTargetHold({
  owner,
  proofId,
  resolutionId,
}) {
  // This helper is also called by stale queue workers, outside the HTTP
  // reconciliation gate. Keep the migration switch authoritative here so a
  // previously persisted intent cannot release ownership after the feature is
  // disabled during rollback.
  if (process.env.AXON_OPERATOR_RESOLUTION_ENABLED !== "true") {
    return { released: false, retained: true, authorized: false };
  }

  await assertUniqueTargetIndexReady();
  const run = await JobRun.findOne({
    orgId: owner.organizationId,
    runId: owner.runId,
    targetAgentId: owner.targetAgentId,
    "attempts.0.attemptId": owner.attemptId,
  })
    .select({
      _id: 0,
      status: 1,
      transitionSequence: 1,
      reconciliationSafetyVersion: 1,
      nonDispatchProof: 1,
      operatorResolution: 1,
      attempts: 1,
      transitions: 1,
    })
    .lean();

  if (!matchesProofAuthorizedRelease(run, owner, proofId, resolutionId)) {
    return { released: false, retained: true, authorized: false };
  }

  const result = await ExecutionTargetHold.deleteOne(ownerFilter(owner));
  return {
    released: result.deletedCount === 1,
    retained: result.deletedCount !== 1,
    authorized: true,
  };
}

export async function acquireExecutionTargetHold(owner) {
  // An unindexed create can admit two owners during startup or migration.
  await assertUniqueTargetIndexReady();
  try {
    await ExecutionTargetHold.create(ownerFilter(owner));
    return { acquired: true };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const currentOwner = await ExecutionTargetHold.findOne({
      organizationId: owner.organizationId,
      targetAgentId: owner.targetAgentId,
    })
      .select({ _id: 0, runId: 1, attemptId: 1, fencingToken: 1 })
      .lean();

    return { acquired: false, owner: currentOwner };
  }
}

export async function releaseExecutionTargetHold(owner, outcome) {
  if (!CONCLUSIVE_OUTCOMES.has(outcome)) {
    return { released: false, retained: true };
  }

  const result = await ExecutionTargetHold.deleteOne(ownerFilter(owner));
  return { released: result.deletedCount === 1 };
}
