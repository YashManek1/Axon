import express from "express";
import { authResource, authRoles, authUser } from "../middlewares/jwt.js";
import Job from "../models/job.js";
import {
  exportAuditHistory,
  getAuditLogLines,
  getAuditHistoryForJob,
  getAuditRun,
  getAuditRunLogs,
  getRecentAuditActivity,
  verifyChain,
} from "../controllers/auditC.js";

const router = express.Router();

router.get("/job/:jobId", authUser, authResource(Job, "jobId"), getAuditHistoryForJob);
router.get("/recent", authUser, getRecentAuditActivity);
router.get("/logs", authUser, getAuditLogLines);
router.get("/export", authUser, exportAuditHistory);
router.get("/run/:auditId/logs", authUser, getAuditRunLogs);
router.get("/run/:auditId", authUser, getAuditRun);
router.get("/verify-chain", authUser, authRoles("admin"), verifyChain);

export default router;
