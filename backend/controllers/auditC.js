import AuditLog from "../models/auditLog.js";
import { getJobHistory, getOrgHistory } from "../services/auditService.js";
import { getRecentLogs } from "../services/logStreamBroker.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "audit-controller" });

export async function getAuditHistoryForJob(req, res) {
  try {
    const history = await getJobHistory(
      req.params.jobId,
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
    const history = await AuditLog.find({ orgId: req.user.orgId })
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
    const history = await AuditLog.find({ orgId: req.user.orgId })
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
    const history = await getOrgHistory(
      req.user.orgId,
      startDate,
      endDate,
      req.query.limit || 100,
    );

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

    const count = req.query.count ? Number(req.query.count) : 100;
    const logs = await getRecentLogs(auditRecord.jobId, count);

    return res.status(200).json(logs);
  } catch (err) {
    logger.error(
      { err, auditId: req.params?.auditId, orgId: req.user?.orgId },
      "Failed to fetch audit run logs",
    );
    return res.status(500).json({ message: "Failed to fetch audit run logs" });
  }
}
