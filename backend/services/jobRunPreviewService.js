import { createHash, randomUUID } from "crypto";
import Agent from "../models/agent.js";
import Job from "../models/job.js";
import JobRun from "../models/jobRun.js";
import JobRunPreview from "../models/jobRunPreview.js";
import User from "../models/user.js";
import { environment } from "../config/environment.js";
import { hasResourceAccess } from "../middlewares/jwt.js";
import { getExecutionPolicyViolation } from "./executionPolicy.js";

export const APPROVAL_PREVIEW_VERSION = 1;
export const APPROVAL_PREVIEW_TTL_MS = 300_000;
export const APPROVAL_PROTOCOL_VERSION = 2;
export const APPROVAL_MAX_OUTPUT_BYTES = 65_536;

export class ApprovalError extends Error {
  constructor(code, message, statusCode = 400, runId = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.runId = runId;
  }
}

const ids = (values) => (values ?? []).map(String);
const dateMs = (value) => (value ? new Date(value).getTime() : null);
const plain = (value) => (value?.toObject ? value.toObject() : value ?? {});

export function requiredReleaseId() {
  const releaseId = String(environment.AXON_RELEASE_ID ?? "").trim();
  if (!releaseId) {
    throw new ApprovalError(
      "RELEASE_ID_REQUIRED",
      "A non-empty AXON_RELEASE_ID is required for approved execution",
      503,
    );
  }
  return releaseId;
}

function executionTimeoutMs(job) {
  const value = Number(job.timeout ?? 30) * 1000;
  if (!Number.isSafeInteger(value) || value < 100 || value > 300_000) {
    throw new ApprovalError(
      "INVALID_EXECUTION_TIMEOUT",
      "Shell execution timeout must be between 0.1 and 300 seconds",
    );
  }
  return value;
}

export function approvalActionVersion(command) {
  return createHash("sha256").update(String(command), "utf8").digest("hex");
}

function normalizedNotifications(job) {
  return {
    onSuccess: Boolean(job.notifications?.onSuccess ?? false),
    onFailure: Boolean(job.notifications?.onFailure ?? true),
    recipients: [...(job.notifications?.recipients ?? [])].map(String),
  };
}

function normalizedSink(job) {
  const sink = plain(job.sink);
  return {
    type: sink.type ?? null,
    uri: sink.uri ?? null,
    databaseName: sink.databaseName ?? null,
    collectionName: sink.collectionName ?? null,
    exportFormat: [...(sink.exportFormat ?? [])],
    encryptionAlg: sink.encryptionAlg ?? "AES-256-GCM",
  };
}

export function buildApprovalSnapshot({ previewId, issuedAt, expiresAt, user, job, agent }) {
  const command = String(job.payload?.command ?? "");
  const preview = {
    jobId: String(job._id),
    jobName: String(job.name),
    targetAgentId: String(job.targetAgentId),
    targetLabel: String(agent.name),
    command,
    actionVersion: approvalActionVersion(command),
    timeoutMs: executionTimeoutMs(job),
    maxOutputBytes: APPROVAL_MAX_OUTPUT_BYTES,
    requiredReleaseId: requiredReleaseId(),
    notifications: normalizedNotifications(job),
  };
  const material = {
    executionProfile: environment.AXON_EXECUTION_PROFILE,
    protocolVersion: APPROVAL_PROTOCOL_VERSION,
    triggerType: "MANUAL_API",
    automaticRetryCount: 0,
    actor: { role: String(user.role) },
    job: {
      ownerId: String(job.userId),
      allowedUsers: ids(job.permissions?.allowedUsers),
      allowedRoles: [...(job.permissions?.allowedRoles ?? [])],
      type: String(job.type),
      targetAgentId: job.targetAgentId ? String(job.targetAgentId) : null,
      command,
      timeoutMs: preview.timeoutMs,
      maxOutputBytes: preview.maxOutputBytes,
      enabled: Boolean(job.enabled),
      status: String(job.status ?? "active"),
      schedule: String(job.schedule),
      scheduleType: String(job.scheduleType ?? "Cron"),
      timezone: String(job.timezone ?? "UTC"),
      executionWindow: {
        enabled: Boolean(job.executionWindow?.enabled ?? false),
        startTime: String(job.executionWindow?.startTime ?? "00:00"),
        endTime: String(job.executionWindow?.endTime ?? "23:59"),
        activeDays: [...(job.executionWindow?.activeDays ?? [])],
      },
      retryLimit: Number(job.retryLimit ?? 0),
      dependsOn: ids(job.dependsOn),
      webhookUrl: job.webhookUrl ?? null,
      sink: normalizedSink(job),
    },
    agent: {
      tokenVersion: Number(agent.tokenVersion ?? 0),
      decommissionedAt: dateMs(agent.decommissionedAt),
      allowedUsers: ids(agent.allowedUsers),
      allowedJobs: ids(agent.allowedJobs),
      allowedCommands: [...(agent.allowedCommands ?? [])],
      sandboxMode: String(agent.sandboxMode ?? "none"),
    },
  };
  return {
    previewVersion: APPROVAL_PREVIEW_VERSION,
    previewId: String(previewId),
    orgId: String(job.orgId),
    actorId: String(user._id),
    jobId: String(job._id),
    issuedAt: dateMs(issuedAt),
    expiresAt: dateMs(expiresAt),
    preview,
    material,
  };
}

export function serializeApprovalSnapshot(snapshot) {
  const preview = snapshot.preview;
  const material = snapshot.material;
  return JSON.stringify([
    snapshot.previewVersion,
    snapshot.previewId,
    snapshot.orgId,
    snapshot.actorId,
    snapshot.jobId,
    snapshot.issuedAt,
    snapshot.expiresAt,
    [
      preview.jobId,
      preview.jobName,
      preview.targetAgentId,
      preview.targetLabel,
      preview.command,
      preview.actionVersion,
      preview.timeoutMs,
      preview.maxOutputBytes,
      preview.requiredReleaseId,
      [
        preview.notifications.onSuccess,
        preview.notifications.onFailure,
        preview.notifications.recipients,
      ],
    ],
    material.executionProfile,
    material.protocolVersion,
    material.triggerType,
    material.automaticRetryCount,
    material.actor.role,
    material.job.ownerId,
    material.job.allowedUsers,
    material.job.allowedRoles,
    material.job.type,
    material.job.targetAgentId,
    material.job.command,
    material.job.timeoutMs,
    material.job.maxOutputBytes,
    material.job.enabled,
    material.job.status,
    material.job.schedule,
    material.job.scheduleType,
    material.job.timezone,
    [
      material.job.executionWindow.enabled,
      material.job.executionWindow.startTime,
      material.job.executionWindow.endTime,
      material.job.executionWindow.activeDays,
    ],
    material.job.retryLimit,
    material.job.dependsOn,
    material.job.webhookUrl,
    [
      material.job.sink.type,
      material.job.sink.uri,
      material.job.sink.databaseName,
      material.job.sink.collectionName,
      material.job.sink.exportFormat,
      material.job.sink.encryptionAlg,
    ],
    material.agent.tokenVersion,
    material.agent.decommissionedAt,
    material.agent.allowedUsers,
    material.agent.allowedJobs,
    material.agent.allowedCommands,
    material.agent.sandboxMode,
  ]);
}

export function hashApprovalSnapshot(snapshot) {
  return createHash("sha256").update(serializeApprovalSnapshot(snapshot), "utf8").digest("hex");
}

function includesId(values, expected) {
  return (values ?? []).some((value) => String(value) === String(expected));
}

function validateDefinition(user, job, agent) {
  if (job.type !== "shell" || !job.payload?.command || !job.targetAgentId) {
    throw new ApprovalError("SHELL_JOB_REQUIRED", "A targeted shell job is required", 409);
  }
  if (job.dependsOn?.length) {
    throw new ApprovalError("SHELL_DEPENDENCIES_UNSUPPORTED", "Dependent shell runs are not supported", 409);
  }
  const violation = getExecutionPolicyViolation(job);
  if (violation) throw new ApprovalError(violation.code, violation.message, 409);
  if (!hasResourceAccess(user, job)) {
    throw new ApprovalError("JOB_ACCESS_REVOKED", "Job access is no longer authorized", 403);
  }
  if (agent.decommissionedAt || String(agent.orgId) !== String(job.orgId)) {
    throw new ApprovalError("TARGET_AGENT_UNAVAILABLE", "The selected agent is unavailable", 409);
  }
  if (agent.allowedUsers?.length && !includesId(agent.allowedUsers, user._id)) {
    throw new ApprovalError("AGENT_USER_NOT_ALLOWED", "The selected agent does not allow this user", 403);
  }
  if (agent.allowedJobs?.length && !includesId(agent.allowedJobs, job._id)) {
    throw new ApprovalError("AGENT_JOB_NOT_ALLOWED", "The selected agent does not allow this job", 403);
  }
  if (!(agent.allowedCommands ?? []).some((value) => value === String(job.payload.command))) {
    throw new ApprovalError("AGENT_COMMAND_NOT_ALLOWED", "The selected agent has not approved this command", 403);
  }
  if (agent.status !== "online" || !agent.socketId) {
    throw new ApprovalError("TARGET_AGENT_OFFLINE", "The exact selected agent is offline", 409);
  }
}

async function loadCurrentDefinition(orgId, actorId, jobId) {
  const [user, job] = await Promise.all([
    User.findOne({ _id: actorId, orgId }),
    Job.findOne({ _id: jobId, orgId }),
  ]);
  if (!user || !job) {
    throw new ApprovalError("PREVIEW_STALE", "The approved definition is no longer current", 409);
  }
  const agent = await Agent.findOne({ _id: job.targetAgentId, orgId });
  if (!agent) throw new ApprovalError("TARGET_AGENT_UNAVAILABLE", "The selected agent is unavailable", 409);
  validateDefinition(user, job, agent);
  return { user, job, agent };
}

export async function createJobRunPreview({ orgId, actorId, jobId, now = Date.now() }) {
  const { user, job, agent } = await loadCurrentDefinition(orgId, actorId, jobId);
  const previewId = randomUUID();
  const issuedAt = new Date(now);
  const expiresAt = new Date(now + APPROVAL_PREVIEW_TTL_MS);
  const snapshot = buildApprovalSnapshot({ previewId, issuedAt, expiresAt, user, job, agent });
  const previewHash = hashApprovalSnapshot(snapshot);
  const record = await JobRunPreview.create({
    previewId,
    previewVersion: APPROVAL_PREVIEW_VERSION,
    previewHash,
    orgId,
    actorId,
    jobId,
    issuedAt,
    expiresAt,
    preview: snapshot.preview,
    material: snapshot.material,
  });
  return {
    previewId: record.previewId,
    previewVersion: record.previewVersion,
    previewHash: record.previewHash,
    expiresAt: record.expiresAt.toISOString(),
    preview: record.preview,
  };
}

export async function resolveApprovedPreview({ orgId, actorId, jobId, previewId, previewHash, now = Date.now() }) {
  const record = await JobRunPreview.findOne({ previewId, orgId, actorId, jobId });
  if (!record) throw new ApprovalError("PREVIEW_NOT_FOUND", "The requested preview was not found", 404);
  const savedSnapshot = {
    previewVersion: record.previewVersion,
    previewId: record.previewId,
    orgId: String(record.orgId),
    actorId: String(record.actorId),
    jobId: String(record.jobId),
    issuedAt: dateMs(record.issuedAt),
    expiresAt: dateMs(record.expiresAt),
    preview: plain(record.preview),
    material: plain(record.material),
  };
  if (hashApprovalSnapshot(savedSnapshot) !== record.previewHash) {
    throw new ApprovalError("APPROVAL_CORRUPT", "The saved preview failed integrity validation", 500);
  }
  if (record.previewHash !== previewHash) throw new ApprovalError("PREVIEW_MISMATCH", "The preview hash does not match", 409);
  if (record.expiresAt.getTime() <= now) throw new ApprovalError("PREVIEW_EXPIRED", "The preview has expired", 410);
  const { user, job, agent } = await loadCurrentDefinition(orgId, actorId, jobId);
  const snapshot = buildApprovalSnapshot({
    previewId: record.previewId,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    user,
    job,
    agent,
  });
  if (hashApprovalSnapshot(snapshot) !== record.previewHash) {
    throw new ApprovalError("PREVIEW_STALE", "The approved definition changed after preview", 409);
  }
  return { record, user, job, agent, snapshot };
}

export function approvalSnapshotFromRun(run) {
  const approval = run?.approval;
  if (!approval) throw new ApprovalError("APPROVAL_REQUIRED", "This run has no durable approval", 409, run?.runId);
  return {
    previewVersion: approval.previewVersion,
    previewId: approval.previewId,
    orgId: String(run.orgId),
    actorId: String(run.triggeredBy?.userId),
    jobId: String(run.jobId),
    issuedAt: dateMs(approval.issuedAt),
    expiresAt: dateMs(approval.expiresAt),
    preview: plain(approval.preview),
    material: plain(approval.material),
  };
}

export function verifyPersistedApproval(run) {
  const snapshot = approvalSnapshotFromRun(run);
  if (
    snapshot.previewVersion !== APPROVAL_PREVIEW_VERSION ||
    hashApprovalSnapshot(snapshot) !== run.approval.previewHash
  ) {
    throw new ApprovalError("APPROVAL_CORRUPT", "The durable approval snapshot failed integrity validation", 409, run.runId);
  }
  return snapshot;
}

export async function validateApprovalForDispatch({ run, queueData, currentUser, currentJob, currentAgent }) {
  const saved = verifyPersistedApproval(run);
  if (!currentUser || !["admin", "operator", "user"].includes(currentUser.role)) {
    throw new ApprovalError("EXECUTION_AUTHORIZATION_REVOKED", "The approving actor is no longer authorized", 403, run.runId);
  }
  validateDefinition(currentUser, currentJob, currentAgent);
  const current = buildApprovalSnapshot({
    previewId: saved.previewId,
    issuedAt: new Date(saved.issuedAt),
    expiresAt: new Date(saved.expiresAt),
    user: currentUser,
    job: currentJob,
    agent: currentAgent,
  });
  if (hashApprovalSnapshot(current) !== run.approval.previewHash) {
    throw new ApprovalError("APPROVAL_STALE", "Approval-bound execution material changed", 409, run.runId);
  }
  const attempt = run.attempts?.[0];
  const queueMatches =
    Number(queueData?.protocolVersion) === saved.material.protocolVersion &&
    String(queueData?.orgId) === saved.orgId &&
    String(queueData?.jobId) === saved.jobId &&
    String(queueData?.targetAgentId) === saved.preview.targetAgentId &&
    String(queueData?.runId) === String(run.runId) &&
    String(queueData?.targetExecutionId) === String(attempt?.targetExecutionId) &&
    String(queueData?.attemptId) === String(attempt?.attemptId) &&
    String(queueData?.operationId) === String(attempt?.operationId) &&
    String(queueData?.triggerType) === saved.material.triggerType &&
    String(queueData?.actionVersion) === saved.preview.actionVersion &&
    String(queueData?.payload?.command) === saved.preview.command &&
    Number(queueData?.timeoutMs) === saved.preview.timeoutMs &&
    Number(queueData?.maxOutputBytes) === saved.preview.maxOutputBytes &&
    JSON.stringify(queueData?.allowedCommands ?? []) ===
      JSON.stringify(saved.material.agent.allowedCommands) &&
    String(run.targetAgentId) === saved.preview.targetAgentId &&
    String(run.action?.actionVersion) === saved.preview.actionVersion &&
    String(run.action?.command) === saved.preview.command &&
    Number(run.action?.timeoutMs) === saved.preview.timeoutMs &&
    Number(run.action?.maxOutputBytes) === saved.preview.maxOutputBytes &&
    JSON.stringify(run.action?.allowedCommands ?? []) ===
      JSON.stringify(saved.material.agent.allowedCommands);
  if (!queueMatches) {
    throw new ApprovalError("QUEUE_APPROVAL_MISMATCH", "Queued execution data does not match approval", 409, run.runId);
  }
  if (
    String(queueData?.jobName) !== saved.preview.jobName ||
    JSON.stringify(queueData?.notifications ?? null) !== JSON.stringify(saved.preview.notifications)
  ) {
    throw new ApprovalError("QUEUE_APPROVAL_MISMATCH", "Queued display or notification data does not match approval", 409, run.runId);
  }
  return saved;
}

export async function ensureApprovalIndexes() {
  const exactKey = (index, entries) =>
    JSON.stringify(Object.entries(index?.key ?? {})) === JSON.stringify(entries);
  const exactPartialFilter = (index, field) =>
    JSON.stringify(index?.partialFilterExpression ?? null) ===
    JSON.stringify({ [field]: { $type: "string" } });
  try {
    // createIndexes is additive. It never drops or rewrites an incompatible
    // production index; an incompatibility therefore fails startup closed.
    await Promise.all([JobRunPreview.createIndexes(), JobRun.createIndexes()]);
    const [previewIndexes, runIndexes] = await Promise.all([
      JobRunPreview.collection.indexes(),
      JobRun.collection.indexes(),
    ]);
    const missing = [];
    if (!previewIndexes.some(
      (index) => index.unique && exactKey(index, [["previewId", 1]]),
    )) missing.push("preview previewId unique");
    if (!previewIndexes.some(
      (index) => index.expireAfterSeconds === 0 && exactKey(index, [["expiresAt", 1]]),
    )) missing.push("preview expiry TTL");
    if (!runIndexes.some(
      (index) =>
        index.unique &&
        exactKey(index, [["orgId", 1], ["triggeredBy.userId", 1], ["requestKey", 1]]) &&
        exactPartialFilter(index, "requestKey"),
    )) missing.push("actor-scoped request-key unique partial");
    if (!runIndexes.some(
      (index) =>
        index.unique &&
        exactKey(index, [["approval.previewId", 1]]) &&
        exactPartialFilter(index, "approval.previewId"),
    )) missing.push("global approval previewId unique partial");
    if (missing.length) {
      throw new Error(`missing or incompatible definitions: ${missing.join(", ")}`);
    }
    return true;
  } catch (error) {
    throw new Error(
      `Manual-run approval indexes are not ready; workers, recovery, and HTTP admission must remain stopped. ` +
      `Do not auto-drop indexes or rewrite records; use a quiesced, backed-up operator migration. ${error.message}`,
      { cause: error },
    );
  }
}
