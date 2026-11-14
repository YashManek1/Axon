import { createHash } from "crypto";
import AuditLog from "../models/auditLog.js";
import { redisConnection } from "../config/queue.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "audit-service" });

const GENESIS_HASH = "0".repeat(64);

const mutableFields = new Set([
  "status",
  "completedAt",
  "durationMs",
  "exitCode",
  "stdoutSummary",
  "stderrSummary",
  "outcome",
  "reasonCode",
]);

function summarize(value) {
  if (value === undefined || value === null) {
    return value;
  }

  return String(value).slice(0, 10000);
}

// The canonical form must contain ONLY fields that never change after creation.
//
// `status` used to be included here. It is mutable by design: a record is written
// as PENDING before execution and updated to COMPLETED afterwards. Verification
// recomputed the hash over the *current* status, so every job that actually
// finished reported the chain as broken — the flagship feature failed on the
// happy path.
//
// `command` was NOT included, which was the more dangerous half: the recorded
// command could be rewritten (say "rm -rf /" to "ls") and the chain would still
// verify, while the product promise is precisely "prove who ran what".
function buildCanonical(startedAt, jobId, orgId, triggeredBy, command, execution = {}) {
  const canonical = {
    startedAt: startedAt instanceof Date ? startedAt.toISOString() : new Date(startedAt).toISOString(),
    jobId: String(jobId),
    orgId: String(orgId),
    triggeredBy: {
      userId: String(triggeredBy?.userId),
      ipAddress: triggeredBy?.ipAddress ?? null,
      userAgent: triggeredBy?.userAgent ?? null,
    },
    command: command ?? null,
  };

  if (execution.canonicalVersion === 2) {
    canonical.canonicalVersion = 2;
    for (const field of ["agentId", "runId", "targetExecutionId", "attemptId", "operationId"]) {
      if (execution[field] !== undefined && execution[field] !== null) {
        canonical[field] = String(execution[field]);
      }
    }
  }

  return canonical;
}

function computeRecordHash(prevHash, canonical) {
  return createHash("sha256")
    .update(prevHash + JSON.stringify(canonical))
    .digest("hex");
}

export async function createAuditRecord(data) {
  try {
    const orgId = data?.orgId;
    const redisKey = `audit:chainhead:${orgId}`;

    let prevHash;
    try {
      prevHash = await redisConnection.get(redisKey);
    } catch {
      prevHash = null;
    }

    if (prevHash === null) {
      const last = await AuditLog.findOne({ orgId }).sort({ createdAt: -1 });
      prevHash = last?.recordHash ?? GENESIS_HASH;
    }

    const startedAt = data.startedAt ? new Date(data.startedAt) : new Date();
    const recordData = {
      ...data,
      ...(data.runId ? { canonicalVersion: 2 } : {}),
    };
    const canonical = buildCanonical(
      startedAt,
      recordData.jobId,
      orgId,
      recordData.triggeredBy,
      recordData.command,
      recordData,
    );
    const recordHash = computeRecordHash(prevHash, canonical);

    const auditRecord = new AuditLog({ ...recordData, startedAt, prevHash, recordHash });
    const saved = await auditRecord.save();

    try {
      await redisConnection.set(redisKey, recordHash);
    } catch {
      logger.warn({ orgId }, "Failed to update audit chain head in Redis; next insert will rebuild from DB");
    }

    return saved;
  } catch (err) {
    logger.error({ err, jobId: data?.jobId, orgId: data?.orgId }, "Failed to create audit record");
    return null;
  }
}

export async function updateAuditRecord(auditId, updates) {
  const updateKeys = Object.keys(updates);
  const immutableUpdate = updateKeys.find((field) => !mutableFields.has(field));

  if (immutableUpdate) {
    throw new Error(`Audit field ${immutableUpdate} cannot be updated`);
  }

  const record = await AuditLog.findById(auditId);
  if (!record) return null;

  for (const key of updateKeys) {
    if (key === "stdoutSummary" || key === "stderrSummary") {
      record[key] = summarize(updates[key]);
    } else {
      record[key] = updates[key];
    }
  }

  return record.save();
}

export function getJobHistory(jobId, orgId, limit = 50, skip = 0) {
  return AuditLog.find({ jobId, orgId })
    .sort({ startedAt: -1 })
    .skip(Number(skip))
    .limit(Number(limit));
}

export function getOrgHistory(orgId, startDate, endDate, limit = 100) {
  return AuditLog.find({
    orgId,
    startedAt: {
      $gte: startDate,
      $lte: endDate,
    },
  })
    .sort({ startedAt: -1 })
    .limit(Number(limit));
}

export async function verifyOrgChain(orgId) {
  const records = await AuditLog.find({ orgId }).sort({ createdAt: 1 });

  let expectedPrevHash = GENESIS_HASH;
  let checkedCount = 0;

  for (const record of records) {
    const canonical = buildCanonical(
      record.startedAt,
      record.jobId,
      record.orgId,
      record.triggeredBy,
      record.command,
      record,
    );
    const derivedHash = computeRecordHash(record.prevHash, canonical);
    checkedCount++;

    if (record.prevHash !== expectedPrevHash || record.recordHash !== derivedHash) {
      return { valid: false, brokenAt: record._id, checkedCount };
    }

    expectedPrevHash = record.recordHash;
  }

  return { valid: true, brokenAt: null, checkedCount };
}
