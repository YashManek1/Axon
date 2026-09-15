import { createHash, randomUUID } from "crypto";
import Agent from "../models/agent.js";
import JobRun from "../models/jobRun.js";

export const DISPATCH_START_WINDOW_MS = 60_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 65_536;

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

  let run;
  try {
    run = await JobRun.create({
      ...identity,
      orgId,
      jobId: job._id,
      targetAgentId: job.targetAgentId,
      requestKey: normalizedRequestKey,
      requestFingerprint,
      triggeredBy: { userId, ipAddress, userAgent },
      action,
      status: runStatus,
      reasonCode,
      attempts: [
        {
          attemptId: identity.attemptId,
          targetExecutionId: identity.targetExecutionId,
          operationId: identity.operationId,
          sequence: 1,
          status: attemptStatus,
          outcome: targetOnline ? undefined : "REJECTED",
          reasonCode,
          completedAt: targetOnline ? undefined : new Date(now),
        },
      ],
      completedAt: targetOnline ? undefined : new Date(now),
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

export function buildQueueData(run, job, agent) {
  const attempt = run.attempts[0];
  return {
    protocolVersion: 2,
    jobId: String(run.jobId),
    orgId: String(run.orgId),
    targetAgentId: String(run.targetAgentId),
    targetSocketId: String(agent.socketId),
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
    notifications: job.notifications,
    jobName: job.name,
  };
}

export async function markRunQueued(runId) {
  return JobRun.findOneAndUpdate(
    { runId, status: "ACCEPTED", "attempts.0.status": "PENDING" },
    { $set: { status: "QUEUED", queuedAt: new Date() } },
    { new: true },
  );
}

export async function markQueueFailure(runId, reasonCode = "QUEUE_PERSIST_FAILED") {
  return JobRun.findOneAndUpdate(
    { runId, status: "ACCEPTED", "attempts.0.status": "PENDING" },
    {
      $set: {
        status: "REJECTED",
        reasonCode,
        completedAt: new Date(),
        "attempts.0.status": "REJECTED",
        "attempts.0.outcome": "REJECTED",
        "attempts.0.reasonCode": reasonCode,
        "attempts.0.completedAt": new Date(),
      },
    },
    { new: true },
  );
}

export async function claimRunForDispatch(data) {
  const immutableMatch = {
    runId: data.runId,
    orgId: data.orgId,
    jobId: data.jobId,
    targetAgentId: data.targetAgentId,
    status: { $in: ["ACCEPTED", "QUEUED"] },
    "action.actionVersion": data.actionVersion,
    "action.command": data.payload?.command,
    "action.allowedCommands": data.allowedCommands,
    "action.timeoutMs": data.timeoutMs,
    "action.startBefore": data.startBefore,
    "action.maxOutputBytes": data.maxOutputBytes,
    attempts: {
      $elemMatch: {
        attemptId: data.attemptId,
        targetExecutionId: data.targetExecutionId,
        operationId: data.operationId,
        status: "PENDING",
      },
    },
  };
  const claimed = await JobRun.findOneAndUpdate(
    immutableMatch,
    {
      $set: {
        status: "DISPATCHING",
        "attempts.$.status": "DISPATCHING",
        "attempts.$.dispatchedAt": new Date(),
      },
    },
    { new: true },
  );
  if (claimed) return { claimed: true, run: claimed };

  const existing = await JobRun.findOne({ runId: data.runId });
  if (!existing) {
    throw new ManualRunError("RUN_NOT_FOUND", "The durable job run does not exist", 409);
  }
  const attempt = existing.attempts.find(
    (candidate) => candidate.attemptId === data.attemptId,
  );
  if (!attempt) {
    throw new ManualRunError(
      "RUN_CORRELATION_MISMATCH",
      "The queue item does not match the durable run attempt",
      409,
      existing.runId,
    );
  }
  return { claimed: false, run: existing };
}

export async function markRunAcknowledged(runId, attemptId) {
  return JobRun.findOneAndUpdate(
    { runId, "attempts.attemptId": attemptId, "attempts.status": "DISPATCHING" },
    {
      $set: {
        status: "ACKNOWLEDGED",
        "attempts.$.status": "ACKNOWLEDGED",
        "attempts.$.acknowledgedAt": new Date(),
      },
    },
    { new: true },
  );
}

export async function completeRun(runId, attemptId, result) {
  const completedAt = new Date();
  return JobRun.findOneAndUpdate(
    {
      runId,
      status: { $in: ["DISPATCHING", "ACKNOWLEDGED"] },
      attempts: {
        $elemMatch: {
          attemptId,
          status: { $in: ["DISPATCHING", "ACKNOWLEDGED"] },
        },
      },
    },
    {
      $set: {
        status: result.status,
        requiresReview: result.status === "UNKNOWN",
        reasonCode: result.reasonCode ?? null,
        completedAt,
        "attempts.$.status": result.status,
        "attempts.$.outcome": result.outcome,
        "attempts.$.exitCode": result.exitCode ?? null,
        "attempts.$.reasonCode": result.reasonCode ?? null,
        "attempts.$.completedAt": completedAt,
      },
    },
    { new: true },
  );
}
