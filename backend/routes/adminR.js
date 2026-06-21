import express from "express";
import { authAdmin } from "../middlewares/jwt.js";

import {
  HealthCheck,
  jobStats,
  userStats,
  orgAnalytics,
  getAllJobs,
  getAllUsers,
} from "../controllers/adminC.js";

const router = express.Router();

router.get("/health", HealthCheck);
router.get("/job-stats", authAdmin, jobStats);
router.get("/user-stats", authAdmin, userStats);
router.get("/all-jobs", authAdmin, getAllJobs);
router.get("/all-users", authAdmin, getAllUsers);
router.get("/org-analytics", authAdmin, orgAnalytics);

export default router;
