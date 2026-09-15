import AuditLog from "../models/auditLog.js";
import { getJobHistory, verifyOrgChain } from "../services/auditService.js";
import { getRecentLogs } from "../services/logStreamBroker.js";
import { createChildLogger } from "../config/logger.js";
import { auditChainVerificationFailures } from "../metrics.js";
import Job from "../models/job.js";
import { resourceAccessFilter } from "../middlewares/jwt.js";

const logger = createChildLogger({ module: "audit-controller" });

async function accessibleJobIds(user) {
  return Job.find(resourceAccessFilter(user)).distinct("_id");
}

async function auditListFilter(user) {
  if (user.role === "admin") return { orgId: user.orgId };
  return {
    orgId: user.orgId,
    jobId: { $in: await accessibleJobIds(user) },
  };
}

async function canReadAuditRecord(user, auditRecord) {
  if (user.role === "admin") return true;
  return Boolean(
    await Job.exists({
      _id: auditRecord.jobId,
      ...resourceAccessFilter(user),
    }),
  );
}

export async function getAuditHistoryForJob(req, res) {
  try {
    const history = await getJobHistory(
      req.resource._id,
      req.user.orgId,
      req.query.limit || 50,
      req.query.skip || 0,
    );

    return res.status(200).json(history);
  } catch (err) {
    logger.error(
      { err, jobId: req.params?.jobId, orgId: req.user?.orgId },
      "Failed to fetch job audit history",
    );
    return res.status(500).json({ message: "Failed to fetch audit history" });
  }
}

export async function getRecentAuditActivity(req, res) {
  try {
    const limit = req.query.limit || 8;
    const history = await AuditLog.find(await auditListFilter(req.user))
      .sort({ startedAt: -1 })
      .limit(Number(limit));

    return res.status(200).json(history);
  } catch (err) {
    logger.error({ err, orgId: req.user?.orgId }, "Failed to fetch recent audit activity");
    return res.status(500).json({ message: "Failed to fetch recent audit activity" });
  }
}

export async function getAuditLogLines(req, res) {
  try {
    const limit = req.query.limit || 20;
    const history = await AuditLog.find(await auditListFilter(req.user))
      .sort({ startedAt: -1 })
      .limit(Number(limit));

    return res.status(200).json(history);
  } catch (err) {
    logger.error({ err, orgId: req.user?.orgId }, "Failed to fetch audit log lines");
    return res.status(500).json({ message: "Failed to fetch audit logs" });
  }
}

export async function exportAuditHistory(req, res) {
  const startDate = new Date(req.query.startDate);
  const endDate = new Date(req.query.endDate);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return res.status(400).json({ message: "Invalid date range" });
  }

  try {
    const accessFilter = await auditListFilter(req.user);
    const history = await AuditLog.find({
      ...accessFilter,
      startedAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ startedAt: -1 })
      .limit(Number(req.query.limit || 100));

    return res.status(200).json(history);
  } catch (err) {
    logger.error({ err, orgId: req.user?.orgId }, "Failed to export audit history");
    return res.status(500).json({ message: "Failed to export audit history" });
  }
}

export async function getAuditRun(req, res) {
  try {
    const auditRecord = await AuditLog.findOne({
      _id: req.params.auditId,
      orgId: req.user.orgId,
    });

    if (!auditRecord) {
      return res.status(404).json({ message: "Audit record not found" });
    }
    if (!(await canReadAuditRecord(req.user, auditRecord))) {
      return res.status(404).json({ message: "Audit record not found" });
    }

    return res.status(200).json(auditRecord);
  } catch (err) {
    logger.error(
      { err, auditId: req.params?.auditId, orgId: req.user?.orgId },
      "Failed to fetch audit run",
    );
    return res.status(500).json({ message: "Failed to fetch audit run" });
  }
}

export async function getAuditRunLogs(req, res) {
  try {
    const auditRecord = await AuditLog.findOne({
      _id: req.params.auditId,
      orgId: req.user.orgId,
    });

    if (!auditRecord) {
      return res.status(404).json({ message: "Audit record not found" });
    }
    if (!(await canReadAuditRecord(req.user, auditRecord))) {
      return res.status(404).json({ message: "Audit record not found" });
    }

    const count = req.query.count ? Number(req.query.count) : 100;
    const logs = await getRecentLogs(auditRecord.runId ?? auditRecord.jobId, count);

    return res.status(200).json(logs);
  } catch (err) {
    logger.error(
      { err, auditId: req.params?.auditId, orgId: req.user?.orgId },
      "Failed to fetch audit run logs",
    );
    return res.status(500).json({ message: "Failed to fetch audit run logs" });
  }
}

export async function verifyChain(req, res) {
  try {
    const result = await verifyOrgChain(req.user.orgId);
    if (!result.valid) {
      auditChainVerificationFailures.inc();
    }
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ err, orgId: req.user?.orgId }, "Failed to verify audit chain");
    return res.status(500).json({ message: "Failed to verify audit chain" });
  }
}
