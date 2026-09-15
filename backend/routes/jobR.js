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
  updateJobPermissions,
} from "../controllers/jobC.js";

import express from "express";
import { validateRequest } from "../middleware/validateRequest.js";
import { createJobSchema, updateJobSchema } from "../schemas/jobSchemas.js";
import Job from "../models/job.js";

const router = express.Router();

const mutationRoles = authRoles("admin", "operator", "user");

router.post("/createJob", authUser, mutationRoles, validateRequest(createJobSchema), createJob);
router.get("/getJobs", authUser, getJobs);
router.get("/getJobById/:jobId", authUser, authResource(Job, "jobId"), getJobById);
router.put("/updateJob/:id", authUser, mutationRoles, (req, res, next) => {
  req.params.jobId = req.params.id;
  return authResource(Job, "jobId")(req, res, next);
}, validateRequest(updateJobSchema), updateJob);
router.delete("/deleteJob/:jobId", authUser, mutationRoles, authResource(Job, "jobId"), deleteJob);
router.patch("/toggleJobStatus/:jobId", authUser, mutationRoles, authResource(Job, "jobId"), toggleJobStatus);
router.post("/runJobNow/:jobId", authUser, mutationRoles, authResource(Job, "jobId"), runJobNow);
router.patch("/:id/permissions", authUser, (req, res, next) => {
  req.params.jobId = req.params.id;
  return authResource(Job, "jobId")(req, res, next);
}, authRoles("admin"), updateJobPermissions);

export default router;
