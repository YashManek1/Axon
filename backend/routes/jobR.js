import {
  authUser,
  authResource,
  authRoles,
} from "../middlewares/jwt.js";
import {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  toggleJobStatus,
  runJobNow,
  previewJobRun,
  updateJobPermissions,
} from "../controllers/jobC.js";
import {
  getJobRun,
  listJobRuns,
  noStoreRunEvidence,
} from "../controllers/jobRunReadC.js";
import {
  getRunReconciliation,
  postRunReconciliation,
} from "../controllers/jobRunReconciliationC.js";

import express from "express";
import { validateRequest } from "../middleware/validateRequest.js";
import { createJobSchema, previewRunSchema, updateJobSchema } from "../schemas/jobSchemas.js";
import { jobRunReconciliationSchema } from "../schemas/jobRunReconciliationSchemas.js";
import Job from "../models/job.js";

const router = express.Router();

const mutationRoles = authRoles("admin", "operator", "user");

router.post("/createJob", authUser, mutationRoles, validateRequest(createJobSchema), createJob);
router.get("/getJobs", authUser, getJobs);
router.get("/getJobById/:jobId", authUser, authResource(Job, "jobId"), getJobById);
router.get(
  "/:jobId/runs",
  noStoreRunEvidence,
  authUser,
  authResource(Job, "jobId"),
  listJobRuns,
);
router.get(
  "/:jobId/runs/:runId/reconciliation",
  noStoreRunEvidence,
  authUser,
  authResource(Job, "jobId"),
  getRunReconciliation,
);
router.post(
  "/:jobId/runs/:runId/reconciliation",
  noStoreRunEvidence,
  authUser,
  authResource(Job, "jobId"),
  authRoles("admin", "operator"),
  validateRequest(jobRunReconciliationSchema),
  postRunReconciliation,
);
router.get(
  "/:jobId/runs/:runId",
  noStoreRunEvidence,
  authUser,
  authResource(Job, "jobId"),
  getJobRun,
);
router.put("/updateJob/:id", authUser, mutationRoles, (req, res, next) => {
  req.params.jobId = req.params.id;
  return authResource(Job, "jobId")(req, res, next);
}, validateRequest(updateJobSchema), updateJob);
router.delete("/deleteJob/:jobId", authUser, mutationRoles, authResource(Job, "jobId"), deleteJob);
router.patch("/toggleJobStatus/:jobId", authUser, mutationRoles, authResource(Job, "jobId"), toggleJobStatus);
router.post(
  "/previewJobRun/:jobId",
  authUser,
  mutationRoles,
  authResource(Job, "jobId"),
  validateRequest(previewRunSchema),
  previewJobRun,
);
router.post("/runJobNow/:jobId", authUser, mutationRoles, authResource(Job, "jobId"), runJobNow);
router.patch("/:id/permissions", authUser, (req, res, next) => {
  req.params.jobId = req.params.id;
  return authResource(Job, "jobId")(req, res, next);
}, authRoles("admin"), updateJobPermissions);

export default router;
