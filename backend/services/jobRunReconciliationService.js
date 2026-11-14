import { createHash } from "crypto";
import Agent from "../models/agent.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import User from "../models/user.js";
import { hasResourceAccess } from "../middlewares/jwt.js";
import {
  observeExecutionTargetHold,
  releaseProofAuthorizedExecutionTargetHold,
} from "./executionTargetHoldService.js";
import { isOperatorResolutionEnabled } from "./jobRunService.js";

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUTATION_ROLES = new Set(["admin", "operator"]);
const MAX_ATTEMPTS = 3;

export class JobRunReconciliationError extends Error {
  constructor(code, message, statusCode, details = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const sameId = (left, right) => String(left) === String(right);
const includesId = (values, value) => values.some((item) => sameId(item, value));

function persistenceUnavailable(verifiedResolution = null) {
  return new JobRunReconciliationError(
    "RECONCILIATION_UNAVAILABLE",
    "Reconciliation evidence is unavailable",
    503,
    verifiedResolution
      ? { resolutionId: verifiedResolution.resolutionId, releaseIntentRecorded: true }
      : {},
  );
}

function normalizeUuid(value) {
  return typeof value === "string" && CANONICAL_UUID.test(value)
    ? value.toLowerCase()
    : null;
}

function fingerprintRequest(resolutionId, body) {
  return createHash("sha256")
    .update(JSON.stringify({
      resolutionId,
      proofId: body.proofId,
      expectedTransitionSequence: body.expectedTransitionSequence,
      reason: body.reason,
    }))
    .digest("hex");
}

function supportedProof(run) {
  const attempt = run?.attempts?.[0];
  const proof = run?.nonDispatchProof;
  const priorTransition = run?.transitions?.find(
    (transition) => transition.sequence === proof?.fromTransitionSequence,
  );
  const terminalTransition = run?.transitions?.find(
    (transition) => transition.sequence === proof?.terminalTransitionSequence,
  );
  return Boolean(
    run?.status === "UNKNOWN" &&
    run?.reconciliationSafetyVersion === 1 &&
    run?.attempts?.length === 1 &&
    attempt?.status === "UNKNOWN" &&
    attempt?.outcome === "UNKNOWN" &&
    !attempt?.dispatchedAt &&
    !attempt?.acknowledgedAt &&
    proof?.version === 1 &&
    normalizeUuid(proof?.proofId) &&
    proof?.attemptId === attempt?.attemptId &&
    sameId(proof?.targetAgentId, run?.targetAgentId) &&
    proof?.fromTransitionSequence + 1 === proof?.terminalTransitionSequence &&
    proof?.terminalTransitionSequence === run?.transitionSequence &&
    proof?.recordedAt instanceof Date &&
    priorTransition?.to === terminalTransition?.from &&
    terminalTransition?.to === "UNKNOWN" &&
    ["ACCEPTED", "QUEUED"].includes(terminalTransition?.from) &&
    terminalTransition?.source === "RECOVERY" &&
    terminalTransition?.attemptId === attempt?.attemptId &&
    terminalTransition?.at instanceof Date &&
    terminalTransition.at.getTime() === proof.recordedAt.getTime()
  );
}

function targetAllows(agent, actorId, jobId) {
  return Boolean(
    agent &&
    !agent.decommissionedAt &&
    (!agent.allowedUsers?.length || includesId(agent.allowedUsers, actorId)) &&
    (!agent.allowedJobs?.length || includesId(agent.allowedJobs, jobId)),
  );
}

async function loadScopedRun({ orgId, jobId, runId }) {
  return JobRun.findOne({ orgId, jobId, runId }).lean();
}

async function currentAuthorization({ orgId, jobId, run, actorId, mutation }) {
  let actor;
  let job;
  let agent;
  try {
    [actor, job] = await Promise.all([
      User.findOne({ _id: actorId, orgId }).lean(),
      Job.findOne({ _id: jobId, orgId }).lean(),
    ]);
  } catch (_error) {
    throw persistenceUnavailable();
  }
  if (!actor) {
    throw new JobRunReconciliationError(
      "AUTHENTICATION_REQUIRED",
      "Current authentication is no longer valid",
      401,
    );
  }
  if (!job) {
    throw new JobRunReconciliationError("RUN_NOT_FOUND", "Run not found", 404);
  }
  if (!hasResourceAccess(actor, job)) {
    throw new JobRunReconciliationError("RESOURCE_ACCESS_DENIED", "Access denied", 403);
  }
  if (mutation && !MUTATION_ROLES.has(actor.role)) {
    throw new JobRunReconciliationError("MUTATION_ROLE_DENIED", "Access denied", 403);
  }
  if (!sameId(job.targetAgentId, run.targetAgentId)) {
    return { actor, job, agent: null, targetAllowed: false };
  }
  try {
    agent = await Agent.findOne({
      _id: run.targetAgentId,
      orgId,
      decommissionedAt: null,
    }).lean();
  } catch (_error) {
    throw persistenceUnavailable();
  }
  return {
    actor,
    job,
    agent,
    targetAllowed: targetAllows(agent, actor._id, job._id),
  };
}

function requireTargetAuthorization(authorization) {
  if (!authorization.targetAllowed) {
    throw new JobRunReconciliationError("TARGET_ACCESS_DENIED", "Access denied", 403);
  }
}

function publicProof(run) {
  if (!run?.nonDispatchProof) return null;
  return {
    version: run.nonDispatchProof.version,
    proofId: run.nonDispatchProof.proofId,
    recordedAt: run.nonDispatchProof.recordedAt,
    terminalTransitionSequence: run.nonDispatchProof.terminalTransitionSequence,
  };
}

function publicResolution(run) {
  if (!run?.operatorResolution) return null;
  return {
    resolutionId: run.operatorResolution.resolutionId,
    actorId: String(run.operatorResolution.actorId),
    actorRole: run.operatorResolution.actorRole,
    recordedAt: run.operatorResolution.recordedAt,
    purpose: run.operatorResolution.purpose,
    reason: run.operatorResolution.reason,
  };
}

export async function getJobRunReconciliation({ orgId, jobId, runId, actorId }) {
  const normalizedRunId = normalizeUuid(runId);
  if (!normalizedRunId) {
    throw new JobRunReconciliationError("INVALID_RUN_ID", "Invalid run ID", 400);
  }
  let run;
  try {
    run = await loadScopedRun({ orgId, jobId, runId: normalizedRunId });
  } catch (_error) {
    throw persistenceUnavailable();
  }
  if (!run) {
    throw new JobRunReconciliationError("RUN_NOT_FOUND", "Run not found", 404);
  }

  const authorization = await currentAuthorization({
    orgId,
    jobId,
    run,
    actorId,
    mutation: false,
  });
  let originalHoldObservation = "UNAVAILABLE";
  let evidenceAvailable = true;
  try {
    const observation = await observeExecutionTargetHold({
      organizationId: orgId,
      targetAgentId: run.targetAgentId,
      runId: run.runId,
      attemptId: run.attempts?.[0]?.attemptId,
    });
    originalHoldObservation = observation.observation;
  } catch (_error) {
    evidenceAvailable = false;
  }

  const featureEnabled = isOperatorResolutionEnabled();
  const proofSupported = supportedProof(run);
  const actorOwnsResolution =
    !run.operatorResolution || sameId(run.operatorResolution.actorId, authorization.actor._id);
  let blockedReason = null;
  if (!featureEnabled) blockedReason = "FEATURE_DISABLED";
  else if (!MUTATION_ROLES.has(authorization.actor.role) || !actorOwnsResolution) {
    blockedReason = "READ_ONLY_ACTOR";
  } else if (!proofSupported) blockedReason = "NO_SUPPORTED_PROOF";
  else if (!authorization.targetAllowed) blockedReason = "TARGET_ACCESS_DENIED";
  else if (!evidenceAvailable) blockedReason = "EVIDENCE_UNAVAILABLE";

  return {
    runId: run.runId,
    attemptId: run.attempts?.[0]?.attemptId ?? null,
    targetAgentId: String(run.targetAgentId),
    status: run.status,
    transitionSequence: run.transitionSequence,
    eligible: blockedReason === null,
    blockedReason,
    proof: publicProof(run),
    resolution: publicResolution(run),
    originalHoldObservation,
  };
}

function resolutionMatches(run, expected) {
  const resolution = run?.operatorResolution;
  return Boolean(
    resolution?.version === 1 &&
    resolution?.resolutionId === expected.resolutionId &&
    resolution?.requestFingerprint === expected.requestFingerprint &&
    sameId(resolution?.actorId, expected.actorId) &&
    resolution?.actorRole === expected.actorRole &&
    resolution?.proofId === expected.proofId &&
    resolution?.terminalTransitionSequence === expected.terminalTransitionSequence &&
    resolution?.purpose === "RELEASE_NEVER_DISPATCHED" &&
    resolution?.reason === expected.reason,
  );
}

function validateMutationProof(run, body) {
  if (!supportedProof(run)) {
    throw new JobRunReconciliationError(
      "NO_SUPPORTED_PROOF",
      "Run is not eligible for reconciliation",
      409,
    );
  }
  if (
    normalizeUuid(body.proofId) !== normalizeUuid(run.nonDispatchProof.proofId) ||
    body.expectedTransitionSequence !== run.nonDispatchProof.terminalTransitionSequence
  ) {
    throw new JobRunReconciliationError(
      "STALE_RECONCILIATION_EVIDENCE",
      "Reconciliation evidence is stale",
      409,
    );
  }
}

export async function resolveNeverDispatchedRun({
  orgId,
  jobId,
  runId,
  actorId,
  resolutionId,
  body,
}) {
  const normalizedRunId = normalizeUuid(runId);
  const normalizedResolutionId = normalizeUuid(resolutionId);
  if (!normalizedRunId || !normalizedResolutionId) {
    throw new JobRunReconciliationError("INVALID_ID", "Invalid reconciliation ID", 400);
  }
  if (!isOperatorResolutionEnabled()) {
    throw new JobRunReconciliationError(
      "FEATURE_DISABLED",
      "Operator reconciliation is disabled",
      409,
    );
  }

  const canonicalBody = {
    proofId: normalizeUuid(body.proofId),
    expectedTransitionSequence: body.expectedTransitionSequence,
    reason: body.reason.trim(),
  };
  const requestFingerprint = fingerprintRequest(normalizedResolutionId, canonicalBody);
  let verifiedRun = null;
  let verifiedResolution = null;

  for (let attemptNumber = 0; attemptNumber < MAX_ATTEMPTS; attemptNumber += 1) {
    let run;
    try {
      run = await loadScopedRun({ orgId, jobId, runId: normalizedRunId });
    } catch (_error) {
      continue;
    }
    if (!run) {
      throw new JobRunReconciliationError("RUN_NOT_FOUND", "Run not found", 404);
    }
    const authorization = await currentAuthorization({
      orgId,
      jobId,
      run,
      actorId,
      mutation: true,
    });
    requireTargetAuthorization(authorization);
    validateMutationProof(run, canonicalBody);
    const expected = {
      resolutionId: normalizedResolutionId,
      requestFingerprint,
      actorId: authorization.actor._id,
      actorRole: authorization.actor.role,
      proofId: canonicalBody.proofId,
      terminalTransitionSequence: canonicalBody.expectedTransitionSequence,
      reason: canonicalBody.reason,
    };
    if (run.operatorResolution) {
      if (!resolutionMatches(run, expected)) {
        throw new JobRunReconciliationError(
          "RESOLUTION_CONFLICT",
          "A conflicting reconciliation intent already exists",
          409,
        );
      }
      verifiedRun = run;
      verifiedResolution = run.operatorResolution;
      break;
    }

    // Revalidate at the commit boundary; role and resource changes fail closed.
    const commitAuthorization = await currentAuthorization({
      orgId,
      jobId,
      run,
      actorId,
      mutation: true,
    });
    requireTargetAuthorization(commitAuthorization);
    if (
      commitAuthorization.actor.role !== expected.actorRole ||
      !sameId(commitAuthorization.actor._id, expected.actorId)
    ) {
      throw new JobRunReconciliationError("AUTHORIZATION_CHANGED", "Access denied", 403);
    }
    const operatorResolution = {
      version: 1,
      ...expected,
      recordedAt: new Date(),
      purpose: "RELEASE_NEVER_DISPATCHED",
    };
    try {
      const updated = await JobRun.findOneAndUpdate(
        {
          orgId,
          jobId,
          runId: normalizedRunId,
          status: "UNKNOWN",
          transitionSequence: canonicalBody.expectedTransitionSequence,
          reconciliationSafetyVersion: 1,
          "nonDispatchProof.version": 1,
          "nonDispatchProof.proofId": canonicalBody.proofId,
          "nonDispatchProof.attemptId": run.attempts[0].attemptId,
          "nonDispatchProof.targetAgentId": run.targetAgentId,
          "nonDispatchProof.terminalTransitionSequence": canonicalBody.expectedTransitionSequence,
          "attempts.0.attemptId": run.attempts[0].attemptId,
          "attempts.0.status": "UNKNOWN",
          "attempts.0.outcome": "UNKNOWN",
          "attempts.0.dispatchedAt": { $exists: false },
          "attempts.0.acknowledgedAt": { $exists: false },
          "attempts.1": { $exists: false },
          operatorResolution: { $exists: false },
        },
        { $set: { operatorResolution } },
        { new: true, runValidators: true, overwriteImmutable: true },
      ).lean();
      if (updated && resolutionMatches(updated, expected)) {
        verifiedRun = updated;
        verifiedResolution = updated.operatorResolution;
        break;
      }
    } catch (_error) {
      // A fresh scoped read on the next bounded iteration resolves write ambiguity.
    }
  }

  if (!verifiedRun || !verifiedResolution) {
    throw persistenceUnavailable();
  }

  const holdIdentity = {
    organizationId: orgId,
    targetAgentId: verifiedRun.targetAgentId,
    runId: verifiedRun.runId,
    attemptId: verifiedRun.attempts[0].attemptId,
  };
  for (let attemptNumber = 0; attemptNumber < MAX_ATTEMPTS; attemptNumber += 1) {
    let observation;
    try {
      observation = await observeExecutionTargetHold(holdIdentity);
    } catch (_error) {
      continue;
    }
    if (observation.observation === "ABSENT") {
      return {
        resolutionId: verifiedResolution.resolutionId,
        runId: verifiedRun.runId,
        status: "UNKNOWN",
        releaseIntentRecorded: true,
        originalHoldObservation: "ABSENT",
        targetAvailability: "NOT_ESTABLISHED",
      };
    }

    // Authorization is deliberately refreshed after observing the hold and
    // immediately before the exact-owner delete boundary.
    const deleteAuthorization = await currentAuthorization({
      orgId,
      jobId,
      run: verifiedRun,
      actorId,
      mutation: true,
    });
    requireTargetAuthorization(deleteAuthorization);
    if (
      !sameId(deleteAuthorization.actor._id, verifiedResolution.actorId) ||
      deleteAuthorization.actor.role !== verifiedResolution.actorRole
    ) {
      throw new JobRunReconciliationError("AUTHORIZATION_CHANGED", "Access denied", 403);
    }

    try {
      await releaseProofAuthorizedExecutionTargetHold({
        owner: observation.owner,
        proofId: verifiedRun.nonDispatchProof.proofId,
        resolutionId: verifiedResolution.resolutionId,
      });
    } catch (_error) {
      // Re-read within the bounded loop; failure never broadens the delete tuple.
    }
  }
  throw persistenceUnavailable(verifiedResolution);
}

export async function resolveDispatchedQuiescentRun({
  runId,
  resolutionId,
  body,
}) {
  const normalizedRunId = normalizeUuid(runId);
  const normalizedResolutionId = normalizeUuid(resolutionId);
  if (!normalizedRunId || !normalizedResolutionId) {
    throw new JobRunReconciliationError("INVALID_ID", "Invalid reconciliation ID", 400);
  }
  const certificate = body?.certificate;
  if (!certificate || certificate.version !== 1) {
    throw new JobRunReconciliationError(
      "INVALID_CERTIFICATE",
      "Valid quiescence certificate is required",
      400,
    );
  }

  throw new JobRunReconciliationError(
    "DISPATCHED_RECONCILIATION_UNAVAILABLE",
    "Dispatched UNKNOWN reconciliation is unavailable",
    409,
  );
}
