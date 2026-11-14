import { createHash, randomUUID } from "crypto";
import Agent from "../models/agent.js";
import JobRun from "../models/jobRun.js";
import {
  ApprovalError,
  resolveApprovedPreview,
  verifyPersistedApproval,
} from "./jobRunPreviewService.js";

export const DISPATCH_START_WINDOW_MS = 60_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 65_536;
export const MANUAL_RUN_RECOVERY_STALE_MS = 30_000;
const MAX_TRANSITIONS = 64;
const TERMINAL_STATUSES = new Set([
  "SUCCEEDED", "FAILED", "TIMED_OUT", "REJECTED", "CANCELLED", "UNKNOWN",
]);
const TERMINAL_CONFIRMATION_CYCLES = 3;
const ACCEPTANCE_READBACK_CYCLES = 3;

export function isOperatorResolutionEnabled() {
  return process.env.AXON_OPERATOR_RESOLUTION_ENABLED === "true";
}

export const TERMINAL_CONFIRMATION_DISPOSITIONS = Object.freeze({
  CONFIRMED_MATCH: "CONFIRMED_MATCH",
  CONFLICT: "CONFLICT",
  PERSISTENCE_UNKNOWN: "PERSISTENCE_UNKNOWN",
});

export class ManualRunError extends Error {
  constructor(code, message, statusCode = 400, runId = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.runId = runId;
  }
}

function includesId(values, expected) {
  return (values ?? []).some((value) => String(value) === String(expected));
}

function matchesCommandPattern(pattern, command) {
  return pattern === command;
}

function fingerprint(values) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function buildIdentity() {
  return {
    runId: randomUUID(),
    targetExecutionId: randomUUID(),
    attemptId: randomUUID(),
    operationId: randomUUID(),
  };
}

async function findRequestKeyRun(orgId, userId, requestKey) {
  if (!requestKey) return null;
  return JobRun.findOne({ orgId, "triggeredBy.userId": userId, requestKey });
}

function transitionEntry(run, to, source, reasonCode, at) {
  return {
    sequence: run.transitionSequence + 1,
    from: run.status,
    to,
    at,
    reasonCode: reasonCode ?? null,
    source,
    queueJobId: run.queueJobId,
    attemptId: run.attempts[0]?.attemptId ?? null,
  };
}

async function compareAndSetTransition({
  run,
  expectedStatuses,
  expectedAttemptStatuses,
  nextStatus,
  source,
  reasonCode = null,
  set = {},
  extraFilter = {},
  overwriteImmutable = false,
  at = new Date(),
}) {
  const attempt = run.attempts[0];
  const filter = {
    runId: run.runId,
    status: { $in: expectedStatuses },
    transitionSequence: run.transitionSequence,
    attempts: {
      $elemMatch: {
        attemptId: attempt.attemptId,
        status: { $in: expectedAttemptStatuses },
      },
    },
    ...extraFilter,
  };
  return JobRun.findOneAndUpdate(
    filter,
    {
      $set: { status: nextStatus, ...set },
      $inc: { transitionSequence: 1 },
      $push: {
        transitions: {
          $each: [transitionEntry(run, nextStatus, source, reasonCode, at)],
          $slice: -MAX_TRANSITIONS,
        },
      },
    },
    { new: true, runValidators: true, overwriteImmutable },
  );
}

async function loadRun(runId) {
  const run = await JobRun.findOne({ runId });
  if (!run) {
    throw new ManualRunError("RUN_NOT_FOUND", "The durable job run does not exist", 409, runId);
  }
  return run;
}

export async function createManualShellRun({
  job,
  orgId,
  userId,
  requestKey,
  ipAddress,
  userAgent,
  now = Date.now(),
}) {
  if (job.type !== "shell" || !job.payload?.command) {
    throw new ManualRunError("SHELL_JOB_REQUIRED", "The v2 run path only accepts shell jobs");
  }
  if (job.dependsOn?.length) {
    throw new ManualRunError(
      "SHELL_DEPENDENCIES_UNSUPPORTED",
      "Dependent shell workflows are disabled until run-scoped coordination is implemented",
      409,
    );
  }
  if (!job.targetAgentId) {
    throw new ManualRunError(
      "TARGET_AGENT_REQUIRED",
      "Bind this legacy shell job to an agent before running it",
      409,
    );
  }

  const normalizedRequestKey =
    typeof requestKey === "string" && requestKey.trim() ? requestKey.trim() : null;
  const agent = await Agent.findOne({
    _id: job.targetAgentId,
    orgId,
    decommissionedAt: null,
  });
  if (!agent) {
    throw new ManualRunError(
      "TARGET_AGENT_UNAVAILABLE",
      "The selected agent does not exist in this organization or is decommissioned",
      409,
    );
  }

  if (agent.allowedUsers?.length && !includesId(agent.allowedUsers, userId)) {
    throw new ManualRunError(
      "AGENT_USER_NOT_ALLOWED",
      "The selected agent does not allow this user",
      403,
    );
  }
  if (agent.allowedJobs?.length && !includesId(agent.allowedJobs, job._id)) {
    throw new ManualRunError(
      "AGENT_JOB_NOT_ALLOWED",
      "The selected agent does not allow this job",
      403,
    );
  }

  const command = String(job.payload.command);
  const allowedCommands = [...(agent.allowedCommands ?? [])];
  if (
    allowedCommands.length === 0 ||
    !allowedCommands.some((pattern) => matchesCommandPattern(pattern, command))
  ) {
    throw new ManualRunError(
      "AGENT_COMMAND_NOT_ALLOWED",
      "The selected agent has not approved this command",
      403,
    );
  }

  const timeoutMs = Number(job.timeout ?? 30) * 1000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) {
    throw new ManualRunError(
      "INVALID_EXECUTION_TIMEOUT",
      "Shell execution timeout must be between 0.1 and 300 seconds",
    );
  }

  const identity = buildIdentity();
  const action = {
    actionVersion: createHash("sha256").update(command, "utf8").digest("hex"),
    command,
    allowedCommands,
    timeoutMs,
    startBefore: now + DISPATCH_START_WINDOW_MS,
    maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
  };
  const requestFingerprint = fingerprint([
    String(orgId),
    String(job._id),
    String(job.targetAgentId),
    String(userId),
    action.actionVersion,
    action.command,
    action.allowedCommands,
    action.timeoutMs,
    action.maxOutputBytes,
  ]);

  const existing = await findRequestKeyRun(orgId, userId, normalizedRequestKey);
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new ManualRunError(
        "REQUEST_KEY_CONFLICT",
        "This request key was already used for a different launch",
        409,
        existing.runId,
      );
    }
    return { run: existing, agent, created: false, shouldQueue: false };
  }

  const targetOnline = agent.status === "online" && Boolean(agent.socketId);
  const attemptStatus = targetOnline ? "PENDING" : "REJECTED";
  const runStatus = targetOnline ? "ACCEPTED" : "REJECTED";
  const reasonCode = targetOnline ? null : "TARGET_AGENT_OFFLINE";
  const createdAt = new Date(now);

  let run;
  try {
    run = await JobRun.create({
      runId: identity.runId,
      orgId,
      jobId: job._id,
      targetAgentId: job.targetAgentId,
      targetSocketId: String(agent.socketId || "offline"),
      queueJobId: identity.attemptId,
      requestKey: normalizedRequestKey,
      requestFingerprint,
      triggeredBy: { userId, ipAddress, userAgent },
      action,
      status: runStatus,
      reasonCode,
      transitionSequence: 1,
      transitions: [{
        sequence: 1,
        from: null,
        to: runStatus,
        at: createdAt,
        reasonCode,
        source: "API",
        queueJobId: identity.attemptId,
        attemptId: identity.attemptId,
      }],
      terminalSummary: targetOnline ? undefined : {
        status: "REJECTED",
        outcome: "REJECTED",
        exitCode: null,
        reasonCode,
        completedAt: createdAt,
      },
      attempts: [
        {
          attemptId: identity.attemptId,
          targetExecutionId: identity.targetExecutionId,
          operationId: identity.operationId,
          sequence: 1,
          status: attemptStatus,
          outcome: targetOnline ? undefined : "REJECTED",
          reasonCode,
          completedAt: targetOnline ? undefined : createdAt,
        },
      ],
      completedAt: targetOnline ? undefined : createdAt,
    });
  } catch (error) {
    if (error?.code === 11000 && normalizedRequestKey) {
      const winner = await findRequestKeyRun(orgId, userId, normalizedRequestKey);
      if (winner?.requestFingerprint === requestFingerprint) {
        return { run: winner, agent, created: false, shouldQueue: false };
      }
      throw new ManualRunError(
        "REQUEST_KEY_CONFLICT",
        "This request key was already used for a different launch",
        409,
        winner?.runId ?? null,
      );
    }
    throw error;
  }

  return { run, agent, created: true, shouldQueue: targetOnline };
}

export async function createApprovedShellRun({
  orgId,
  userId,
  jobId,
  requestKey,
  previewId,
  previewHash,
  ipAddress,
  userAgent,
  now = Date.now(),
  insertRun = (definition) => JobRun.create(definition),
}) {
  const requestFingerprint = approvedRequestFingerprint({
    orgId,
    userId,
    jobId,
    previewId,
    previewHash,
  });
  const replay = await findRequestKeyRun(orgId, userId, requestKey);
  if (replay) {
    if (!isExactApprovedReplay(replay, {
      jobId,
      previewId,
      previewHash,
      requestFingerprint,
    })) {
      throw new ApprovalError(
        "REQUEST_KEY_CONFLICT",
        "This request key was already used for a different launch",
        409,
        replay.runId,
      );
    }
    return { run: replay, created: false, shouldQueue: false };
  }

  const { record, agent, snapshot } = await resolveApprovedPreview({
    orgId,
    actorId: userId,
    jobId,
    previewId,
    previewHash,
    now,
  });
  const identity = buildIdentity();
  const createdAt = new Date(now);
  const action = {
    actionVersion: snapshot.preview.actionVersion,
    command: snapshot.preview.command,
    allowedCommands: [...snapshot.material.agent.allowedCommands],
    timeoutMs: snapshot.preview.timeoutMs,
    startBefore: now + DISPATCH_START_WINDOW_MS,
    maxOutputBytes: snapshot.preview.maxOutputBytes,
  };
  const definition = {
    runId: identity.runId,
    orgId,
    jobId,
    targetAgentId: snapshot.preview.targetAgentId,
    targetSocketId: String(agent.socketId),
    queueJobId: identity.attemptId,
    requestKey,
    requestFingerprint,
    reconciliationSafetyVersion: isOperatorResolutionEnabled() ? 1 : undefined,
    approval: {
      previewId: record.previewId,
      previewVersion: record.previewVersion,
      previewHash: record.previewHash,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      acceptedAt: createdAt,
      preview: snapshot.preview,
      material: snapshot.material,
    },
    triggeredBy: { userId, ipAddress, userAgent },
    triggerType: "MANUAL_API",
    action,
    status: "ACCEPTED",
    transitionSequence: 1,
    transitions: [{
      sequence: 1,
      from: null,
      to: "ACCEPTED",
      at: createdAt,
      reasonCode: null,
      source: "API",
      queueJobId: identity.attemptId,
      attemptId: identity.attemptId,
    }],
    attempts: [{
      attemptId: identity.attemptId,
      targetExecutionId: identity.targetExecutionId,
      operationId: identity.operationId,
      sequence: 1,
      status: "PENDING",
    }],
  };

  try {
    const run = await insertRun(definition);
    return { run, created: true, shouldQueue: true };
  } catch (insertError) {
    const recovered = await readBackApprovedAcceptance({
      orgId,
      userId,
      jobId,
      requestKey,
      previewId,
      previewHash,
      requestFingerprint,
    });
    if (recovered.disposition === "MATCH") {
      return { run: recovered.run, created: false, shouldQueue: false };
    }
    if (recovered.disposition === "REQUEST_KEY_CONFLICT") {
      throw new ApprovalError(
        "REQUEST_KEY_CONFLICT",
        "This request key was already used for a different launch",
        409,
        recovered.run?.runId ?? null,
      );
    }
    if (recovered.disposition === "PREVIEW_ALREADY_CONSUMED") {
      throw new ApprovalError(
        "PREVIEW_ALREADY_CONSUMED",
        "This preview was already accepted with another request key",
        409,
        recovered.run?.runId ?? null,
      );
    }
    throw new ApprovalError(
      "LAUNCH_ACCEPTANCE_UNKNOWN",
      "The launch write could not be confirmed; do not retry with a new key or preview",
      503,
    );
  }
}

export function buildQueueData(run, job = {}, agent = {}) {
  const attempt = run.attempts[0];
  const saved = run.approval ? verifyPersistedApproval(run) : null;
  return {
    protocolVersion: 2,
    jobId: String(run.jobId),
    orgId: String(run.orgId),
    targetAgentId: String(run.targetAgentId),
    targetSocketId: String(agent.socketId ?? run.targetSocketId),
    runId: run.runId,
    targetExecutionId: attempt.targetExecutionId,
    attemptId: attempt.attemptId,
    operationId: attempt.operationId,
    actionVersion: run.action.actionVersion,
    payload: { command: run.action.command },
    allowedCommands: [...run.action.allowedCommands],
    timeoutMs: run.action.timeoutMs,
    startBefore: run.action.startBefore,
    maxOutputBytes: run.action.maxOutputBytes,
    triggeredBy: run.triggeredBy,
    triggerType: run.triggerType,
    notifications: saved ? saved.preview.notifications : job.notifications,
    jobName: saved ? saved.preview.jobName : job.name,
  };
}

function approvedRequestFingerprint({ orgId, userId, jobId, previewId, previewHash }) {
  return fingerprint([
    String(orgId),
    String(userId),
    String(jobId),
    String(previewId),
    String(previewHash),
  ]);
}

function isExactApprovedReplay(run, { jobId, previewId, previewHash, requestFingerprint }) {
  return (
    String(run?.jobId) === String(jobId) &&
    run?.requestFingerprint === requestFingerprint &&
    run?.approval?.previewId === previewId &&
    run?.approval?.previewHash === previewHash
  );
}

async function readBackApprovedAcceptance({
  orgId,
  userId,
  jobId,
  requestKey,
  previewId,
  previewHash,
  requestFingerprint,
}) {
  let lastError = null;
  for (let cycle = 0; cycle < ACCEPTANCE_READBACK_CYCLES; cycle += 1) {
    try {
      const [byKey, byPreview] = await Promise.all([
        findRequestKeyRun(orgId, userId, requestKey),
        JobRun.findOne({ orgId, "approval.previewId": previewId }),
      ]);
      if (byKey && byPreview && String(byKey._id) !== String(byPreview._id)) {
        return { run: null, disposition: "AMBIGUOUS" };
      }
      if (byKey) {
        if (isExactApprovedReplay(byKey, {
          jobId,
          previewId,
          previewHash,
          requestFingerprint,
        })) {
          return { run: byKey, disposition: "MATCH" };
        }
        return { run: byKey, disposition: "REQUEST_KEY_CONFLICT" };
      }
      if (byPreview) return { run: byPreview, disposition: "PREVIEW_ALREADY_CONSUMED" };
      lastError = null;
    } catch (error) {
      lastError = error;
    }
  }
  return { run: null, disposition: "UNKNOWN", error: lastError };
}

function hasRecoverableDispatchIntent(run) {
  const attempt = run.attempts?.[0];
  try {
    verifyPersistedApproval(run);
  } catch {
    return false;
  }
  return (
    run.status === "ACCEPTED" &&
    run.attempts?.length === 1 &&
    attempt?.status === "PENDING" &&
    Boolean(attempt.attemptId) &&
    String(run.queueJobId) === String(attempt.attemptId) &&
    Boolean(attempt.targetExecutionId) &&
    Boolean(attempt.operationId) &&
    Boolean(run.action?.actionVersion) &&
    Boolean(run.action?.command) &&
    Array.isArray(run.action?.allowedCommands) &&
    run.action.allowedCommands.length > 0 &&
    Number.isSafeInteger(run.action?.timeoutMs) &&
    Number.isFinite(run.action?.startBefore) &&
    Number.isSafeInteger(run.action?.maxOutputBytes)
  );
}

export async function markRunQueued(runId, source = "QUEUE") {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const run = await loadRun(runId);
    if (["QUEUED", "DISPATCHING", "ACKNOWLEDGED"].includes(run.status) || TERMINAL_STATUSES.has(run.status)) {
      return run;
    }
    if (run.status !== "ACCEPTED" || run.attempts[0]?.status !== "PENDING") {
      throw new ManualRunError("RUN_STATE_CONFLICT", "Run cannot transition to queued", 409, runId);
    }
    const queuedAt = new Date();
    const updated = await compareAndSetTransition({
      run,
      expectedStatuses: ["ACCEPTED"],
      expectedAttemptStatuses: ["PENDING"],
      nextStatus: "QUEUED",
      source,
      set: { queuedAt },
    });
    if (updated) return updated;
  }
  throw new ManualRunError("RUN_TRANSITION_CONFLICT", "Run state changed during queue persistence", 409, runId);
}

export async function markQueueFailure(runId, reasonCode = "QUEUE_PERSIST_FAILED") {
  const run = await loadRun(runId);
  if (TERMINAL_STATUSES.has(run.status)) return run;
  const completedAt = new Date();
  const updated = await compareAndSetTransition({
    run,
    expectedStatuses: ["ACCEPTED"],
    expectedAttemptStatuses: ["PENDING"],
    nextStatus: "REJECTED",
    source: "QUEUE",
    reasonCode,
    set: {
      reasonCode,
      completedAt,
      requiresReview: false,
      "attempts.0.status": "REJECTED",
      "attempts.0.outcome": "REJECTED",
      "attempts.0.reasonCode": reasonCode,
      "attempts.0.completedAt": completedAt,
      terminalSummary: {
        status: "REJECTED", outcome: "REJECTED", exitCode: null, reasonCode, completedAt,
      },
    },
  });
  if (updated) return updated;
  return loadRun(runId);
}

export async function markRunUnknown(runId, reasonCode, expectedStatuses) {
  const run = await loadRun(runId);
  if (TERMINAL_STATUSES.has(run.status)) return run;
  const attempt = run.attempts[0];
  const completedAt = new Date();
  const canMintNonDispatchProof =
    isOperatorResolutionEnabled() &&
    run.reconciliationSafetyVersion === 1 &&
    ["ACCEPTED", "QUEUED"].includes(run.status) &&
    expectedStatuses.includes(run.status) &&
    run.attempts.length === 1 &&
    attempt?.status === "PENDING" &&
    !attempt.dispatchedAt &&
    !attempt.acknowledgedAt &&
    !run.nonDispatchProof &&
    !run.operatorResolution;
  const nonDispatchProof = canMintNonDispatchProof
    ? {
        version: 1,
        proofId: randomUUID(),
        attemptId: attempt.attemptId,
        targetAgentId: run.targetAgentId,
        fromTransitionSequence: run.transitionSequence,
        terminalTransitionSequence: run.transitionSequence + 1,
        recordedAt: completedAt,
      }
    : null;
  const updated = await compareAndSetTransition({
    run,
    expectedStatuses,
    expectedAttemptStatuses: [attempt.status],
    nextStatus: "UNKNOWN",
    source: "RECOVERY",
    reasonCode,
    set: {
      requiresReview: true,
      reasonCode,
      completedAt,
      "attempts.0.status": "UNKNOWN",
      "attempts.0.outcome": "UNKNOWN",
      "attempts.0.reasonCode": reasonCode,
      "attempts.0.completedAt": completedAt,
      terminalSummary: {
        status: "UNKNOWN", outcome: "UNKNOWN", exitCode: null, reasonCode, completedAt,
      },
      ...(nonDispatchProof ? { nonDispatchProof } : {}),
    },
    extraFilter: nonDispatchProof
      ? {
          reconciliationSafetyVersion: 1,
          nonDispatchProof: { $exists: false },
          operatorResolution: { $exists: false },
          "attempts.0.dispatchedAt": { $exists: false },
          "attempts.0.acknowledgedAt": { $exists: false },
          "attempts.1": { $exists: false },
        }
      : {},
    overwriteImmutable: Boolean(nonDispatchProof),
    at: completedAt,
  });
  return updated ?? loadRun(runId);
}

export async function claimRunForDispatch(data) {
  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
    const run = await loadRun(data.runId);
    const attempt = run.attempts.find((candidate) => candidate.attemptId === data.attemptId);
    if (!attempt) {
      throw new ManualRunError(
        "RUN_CORRELATION_MISMATCH",
        "The queue item does not match the durable run attempt",
        409,
        run.runId,
      );
    }
    const immutableMatches =
      String(run.orgId) === String(data.orgId) &&
      String(run.jobId) === String(data.jobId) &&
      String(run.targetAgentId) === String(data.targetAgentId) &&
      run.targetSocketId === data.targetSocketId &&
      run.action.actionVersion === data.actionVersion &&
      run.action.command === data.payload?.command &&
      JSON.stringify(run.action.allowedCommands) === JSON.stringify(data.allowedCommands) &&
      run.action.timeoutMs === data.timeoutMs &&
      run.action.startBefore === data.startBefore &&
      run.action.maxOutputBytes === data.maxOutputBytes &&
      attempt.targetExecutionId === data.targetExecutionId &&
      attempt.operationId === data.operationId;
    if (!immutableMatches) {
      throw new ManualRunError(
        "RUN_CORRELATION_MISMATCH",
        "The queue item does not match the durable run identity",
        409,
        run.runId,
      );
    }
    if (!["ACCEPTED", "QUEUED"].includes(run.status) || attempt.status !== "PENDING") {
      return { claimed: false, run };
    }
    const dispatchedAt = new Date();
    const claimed = await compareAndSetTransition({
      run,
      expectedStatuses: ["ACCEPTED", "QUEUED"],
      expectedAttemptStatuses: ["PENDING"],
      nextStatus: "DISPATCHING",
      source: "WORKER",
      set: {
        "attempts.0.status": "DISPATCHING",
        "attempts.0.dispatchedAt": dispatchedAt,
      },
      extraFilter: {
        nonDispatchProof: { $exists: false },
        operatorResolution: { $exists: false },
      },
    });
    if (claimed) return { claimed: true, run: claimed };
  }
  return { claimed: false, run: await loadRun(data.runId) };
}

export async function markRunAcknowledged(runId, attemptId) {
  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
    const run = await loadRun(runId);
    const attempt = run.attempts[0];
    if (attempt?.attemptId !== attemptId) {
      throw new ManualRunError("RUN_CORRELATION_MISMATCH", "Acknowledgment attempt does not match", 409, runId);
    }
    if (run.status === "ACKNOWLEDGED" || TERMINAL_STATUSES.has(run.status)) return run;
    if (run.status !== "DISPATCHING" || attempt.status !== "DISPATCHING") {
      throw new ManualRunError("RUN_STATE_CONFLICT", "Run cannot be acknowledged from its current state", 409, runId);
    }
    const acknowledgedAt = new Date();
    const updated = await compareAndSetTransition({
      run,
      expectedStatuses: ["DISPATCHING"],
      expectedAttemptStatuses: ["DISPATCHING"],
      nextStatus: "ACKNOWLEDGED",
      source: "WORKER",
      set: {
        "attempts.0.status": "ACKNOWLEDGED",
        "attempts.0.acknowledgedAt": acknowledgedAt,
      },
    });
    if (updated) return updated;
  }
  throw new ManualRunError("RUN_TRANSITION_CONFLICT", "Run changed during acknowledgment", 409, runId);
}

export async function completeRun(runId, attemptId, result) {
  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber += 1) {
    const run = await loadRun(runId);
    const attempt = run.attempts[0];
    if (attempt?.attemptId !== attemptId) {
      throw new ManualRunError("RUN_CORRELATION_MISMATCH", "Result attempt does not match", 409, runId);
    }
    if (TERMINAL_STATUSES.has(run.status)) return run;
    if (!["DISPATCHING", "ACKNOWLEDGED"].includes(run.status) ||
        !["DISPATCHING", "ACKNOWLEDGED"].includes(attempt.status)) {
      throw new ManualRunError("RUN_STATE_CONFLICT", "Run cannot complete from its current state", 409, runId);
    }
    const completedAt = new Date();
    const updated = await compareAndSetTransition({
      run,
      expectedStatuses: ["DISPATCHING", "ACKNOWLEDGED"],
      expectedAttemptStatuses: ["DISPATCHING", "ACKNOWLEDGED"],
      nextStatus: result.status,
      source: "WORKER",
      reasonCode: result.reasonCode ?? null,
      set: {
        requiresReview: result.status === "UNKNOWN",
        reasonCode: result.reasonCode ?? null,
        completedAt,
        "attempts.0.status": result.status,
        "attempts.0.outcome": result.outcome,
        "attempts.0.exitCode": result.exitCode ?? null,
        "attempts.0.reasonCode": result.reasonCode ?? null,
        "attempts.0.completedAt": completedAt,
        terminalSummary: {
          status: result.status,
          outcome: result.outcome,
          exitCode: result.exitCode ?? null,
          reasonCode: result.reasonCode ?? null,
          completedAt,
        },
      },
    });
    if (updated) return updated;
  }
  return loadRun(runId);
}

function normalizeTerminalResult(result) {
  return {
    status: String(result.status ?? ""),
    outcome: String(result.outcome ?? ""),
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
    reasonCode: result.reasonCode == null ? null : String(result.reasonCode),
  };
}

function terminalReceiptMatches(run, attemptId, expected) {
  const attempt = run.attempts[0];
  const summary = run.terminalSummary;
  return (
    attempt?.attemptId === attemptId &&
    run.status === expected.status &&
    (run.reasonCode ?? null) === expected.reasonCode &&
    attempt.status === expected.status &&
    attempt.outcome === expected.outcome &&
    (attempt.exitCode ?? null) === expected.exitCode &&
    (attempt.reasonCode ?? null) === expected.reasonCode &&
    summary?.status === expected.status &&
    summary?.outcome === expected.outcome &&
    (summary?.exitCode ?? null) === expected.exitCode &&
    (summary?.reasonCode ?? null) === expected.reasonCode
  );
}

export async function confirmRunCompletion(runId, attemptId, result) {
  const normalized = normalizeTerminalResult(result);
  const completedAt = new Date();
  let lastError = null;
  let lastRun = null;

  for (let cycle = 0; cycle < TERMINAL_CONFIRMATION_CYCLES; cycle += 1) {
    let run;
    try {
      run = await loadRun(runId);
      lastRun = run;
    } catch (error) {
      lastError = error;
      continue;
    }

    const attempt = run.attempts[0];
    if (attempt?.attemptId !== attemptId) {
      return {
        disposition: TERMINAL_CONFIRMATION_DISPOSITIONS.CONFLICT,
        run,
        error: new ManualRunError(
          "RUN_CORRELATION_MISMATCH",
          "Result attempt does not match",
          409,
          runId,
        ),
      };
    }

    if (TERMINAL_STATUSES.has(run.status)) {
      return {
        disposition: terminalReceiptMatches(run, attemptId, normalized)
          ? TERMINAL_CONFIRMATION_DISPOSITIONS.CONFIRMED_MATCH
          : TERMINAL_CONFIRMATION_DISPOSITIONS.CONFLICT,
        run,
        error: lastError,
      };
    }

    if (
      !TERMINAL_STATUSES.has(normalized.status) ||
      !["DISPATCHING", "ACKNOWLEDGED"].includes(run.status) ||
      !["DISPATCHING", "ACKNOWLEDGED"].includes(attempt.status)
    ) {
      return {
        disposition: TERMINAL_CONFIRMATION_DISPOSITIONS.CONFLICT,
        run,
        error: new ManualRunError(
          "RUN_STATE_CONFLICT",
          "Run cannot complete from its current state",
          409,
          runId,
        ),
      };
    }

    try {
      const updated = await compareAndSetTransition({
        run,
        expectedStatuses: ["DISPATCHING", "ACKNOWLEDGED"],
        expectedAttemptStatuses: ["DISPATCHING", "ACKNOWLEDGED"],
        nextStatus: normalized.status,
        source: "WORKER",
        reasonCode: normalized.reasonCode,
        at: completedAt,
        set: {
          requiresReview: normalized.status === "UNKNOWN",
          reasonCode: normalized.reasonCode,
          completedAt,
          "attempts.0.status": normalized.status,
          "attempts.0.outcome": normalized.outcome,
          "attempts.0.exitCode": normalized.exitCode,
          "attempts.0.reasonCode": normalized.reasonCode,
          "attempts.0.completedAt": completedAt,
          terminalSummary: { ...normalized, completedAt },
        },
      });
      if (updated) {
        return {
          disposition: terminalReceiptMatches(updated, attemptId, normalized)
            ? TERMINAL_CONFIRMATION_DISPOSITIONS.CONFIRMED_MATCH
            : TERMINAL_CONFIRMATION_DISPOSITIONS.CONFLICT,
          run: updated,
          error: lastError,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  return {
    disposition: TERMINAL_CONFIRMATION_DISPOSITIONS.PERSISTENCE_UNKNOWN,
    run: lastRun,
    error: lastError,
  };
}

export async function enqueueManualRun(queue, queueData, source = "QUEUE") {
  try {
    await queue.add("dispatch-job", queueData, {
      jobId: queueData.attemptId,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1,
    });
  } catch (error) {
    let existing;
    try {
      existing = await queue.getJob(queueData.attemptId);
    } catch {
      await markRunUnknown(
        queueData.runId,
        "QUEUE_STATE_UNVERIFIABLE",
        ["ACCEPTED"],
      );
      throw new ManualRunError(
        "QUEUE_STATE_UNVERIFIABLE",
        "The queue write could not be verified; the run requires review",
        503,
        queueData.runId,
      );
    }
    if (!existing) {
      await markQueueFailure(queueData.runId);
      throw new ManualRunError(
        "QUEUE_PERSIST_FAILED",
        "The queue rejected this run before dispatch",
        503,
        queueData.runId,
      );
    }
  }

  const persisted = await markRunQueued(queueData.runId, source);
  if (persisted.status === "UNKNOWN" || persisted.status === "REJECTED") {
    throw new ManualRunError(
      "RUN_QUEUE_STATE_CONFLICT",
      "The queue item exists but the durable run is not dispatchable",
      503,
      queueData.runId,
    );
  }
  return persisted;
}

export async function enqueueApprovedRun(queue, queueData, source = "QUEUE", acceptedRun = null) {
  // Only callers with proven durable acceptance may fall back when readback fails.
  const readAcceptedRun = async () => {
    try {
      return await loadRun(queueData.runId);
    } catch (error) {
      if (!acceptedRun || acceptedRun.runId !== queueData.runId) throw error;
      return { runId: acceptedRun.runId, status: "ACCEPTED", queueStateConfirmed: false };
    }
  };
  let queuePersisted = false;
  try {
    await queue.add("dispatch-job", queueData, {
      jobId: queueData.attemptId,
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 1,
    });
    queuePersisted = true;
  } catch {
    try {
      queuePersisted = Boolean(await queue.getJob(queueData.attemptId));
    } catch {
      queuePersisted = false;
    }
  }

  if (!queuePersisted) return readAcceptedRun();
  try {
    return await markRunQueued(queueData.runId, source);
  } catch {
    return readAcceptedRun();
  }
}

export async function recoverStaleManualRuns(queue, {
  staleBefore = new Date(Date.now() - MANUAL_RUN_RECOVERY_STALE_MS),
  limit = 100,
} = {}) {
  const runs = await JobRun.find({
    status: { $in: ["ACCEPTED", "QUEUED", "DISPATCHING", "ACKNOWLEDGED"] },
    updatedAt: { $lte: staleBefore },
  }).sort({ updatedAt: 1 }).limit(limit);
  const summary = { inspected: runs.length, enqueued: 0, restored: 0, unknown: 0, errors: 0 };

  for (const run of runs) {
    if (run.status === "ACCEPTED" && !hasRecoverableDispatchIntent(run)) {
      try {
        await markRunUnknown(run.runId, "DISPATCH_INTENT_INVALID", ["ACCEPTED"]);
        summary.unknown += 1;
      } catch {
        summary.errors += 1;
      }
      continue;
    }

    let queueJob;
    try {
      queueJob = await queue.getJob(run.queueJobId);
    } catch {
      try {
        await markRunUnknown(run.runId, "QUEUE_STATE_UNVERIFIABLE", [run.status]);
        summary.unknown += 1;
      } catch {
        summary.errors += 1;
      }
      continue;
    }

    try {
      if (run.status === "ACCEPTED") {
        if (!queueJob) {
          const recovered = await enqueueApprovedRun(queue, buildQueueData(run), "RECOVERY", run);
          if (recovered.status === "QUEUED") {
            summary.enqueued += 1;
          } else {
            summary.restored += 1;
          }
        } else {
          await markRunQueued(run.runId, "RECOVERY");
          summary.restored += 1;
        }
      } else if (!queueJob) {
        await markRunUnknown(
          run.runId,
          run.status === "QUEUED" ? "QUEUE_ITEM_MISSING" : "EXECUTION_EVIDENCE_MISSING",
          [run.status],
        );
        summary.unknown += 1;
      }
    } catch (error) {
      if (error instanceof ManualRunError && error.code === "QUEUE_STATE_UNVERIFIABLE") {
        summary.unknown += 1;
      } else {
        summary.errors += 1;
      }
    }
  }
  return summary;
}
