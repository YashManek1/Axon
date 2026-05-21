import AuditLog from "../models/auditLog.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "audit-service" });

const mutableFields = new Set([
  "status",
  "completedAt",
  "durationMs",
  "exitCode",
  "stdoutSummary",
  "stderrSummary",
]);

function summarize(value) {
  if (value === undefined || value === null) {
    return value;
  }

  return String(value).slice(0, 10000);
}

export async function createAuditRecord(data) {
  try {
    const auditRecord = new AuditLog(data);
    return await auditRecord.save();
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

  const safeUpdates = { ...updates };

  if ("stdoutSummary" in safeUpdates) {
    safeUpdates.stdoutSummary = summarize(safeUpdates.stdoutSummary);
  }

  if ("stderrSummary" in safeUpdates) {
    safeUpdates.stderrSummary = summarize(safeUpdates.stderrSummary);
  }

  return AuditLog.findByIdAndUpdate(auditId, safeUpdates, {
    new: true,
    runValidators: true,
  });
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
