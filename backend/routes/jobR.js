import { authUser } from "../middlewares/jwt.js";
import {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  toggleJobStatus,
  runJobNow,
} from "../controllers/jobC.js";

import express from "express";
import { validateRequest } from "../middleware/validateRequest.js";
import { createJobSchema, updateJobSchema } from "../schemas/jobSchemas.js";

const router = express.Router();

router.post("/createJob", authUser, validateRequest(createJobSchema), createJob);
router.get("/getJobs", authUser, getJobs);
router.get("/getJobById/:jobId", authUser, getJobById);
router.put("/updateJob/:id", authUser, validateRequest(updateJobSchema), (req, res, next) => {
  req.params.jobId = req.params.id;
  return updateJob(req, res, next);
});
router.delete("/deleteJob/:jobId", authUser, deleteJob);
router.patch("/toggleJobStatus/:jobId", authUser, toggleJobStatus);
router.post("/runJobNow/:jobId", authUser, runJobNow);

export default router;
