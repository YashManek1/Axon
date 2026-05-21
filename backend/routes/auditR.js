import express from "express";
import { authUser } from "../middlewares/jwt.js";
import {
  exportAuditHistory,
  getAuditLogLines,
  getAuditHistoryForJob,
  getAuditRun,
  getAuditRunLogs,
  getRecentAuditActivity,
} from "../controllers/auditC.js";

const router = express.Router();

router.get("/job/:jobId", authUser, getAuditHistoryForJob);
router.get("/recent", authUser, getRecentAuditActivity);
router.get("/logs", authUser, getAuditLogLines);
router.get("/export", authUser, exportAuditHistory);
router.get("/run/:auditId/logs", authUser, getAuditRunLogs);
router.get("/run/:auditId", authUser, getAuditRun);

export default router;
