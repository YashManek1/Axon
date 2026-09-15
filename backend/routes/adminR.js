import express from "express";
import { authAdmin } from "../middlewares/jwt.js";
import { environment } from "../config/environment.js";
import { register } from "../metrics.js";

import {
  HealthCheck,
  jobStats,
  userStats,
  orgAnalytics,
  getAllJobs,
  getAllUsers,
} from "../controllers/adminC.js";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "../controllers/orgApiKeysC.js";

const router = express.Router();

// Prometheus scrape endpoint auth: bearer token from environment.
// This allows Prometheus to scrape metrics without full admin JWT auth.
function authPrometheus(req, res, next) {
  if (!environment.PROMETHEUS_BEARER_TOKEN) {
    return res.status(403).json({ error: "Prometheus scrape endpoint not configured" });
  }
  const token = req.get("Authorization")?.replace("Bearer ", "");
  if (token !== environment.PROMETHEUS_BEARER_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.get("/health", HealthCheck);
router.get("/job-stats", authAdmin, jobStats);
router.get("/user-stats", authAdmin, userStats);
router.get("/all-jobs", authAdmin, getAllJobs);
router.get("/all-users", authAdmin, getAllUsers);
router.get("/org-analytics", authAdmin, orgAnalytics);

// Organization API key management (admin-only, org-scoped)
router.post("/org/api-keys", authAdmin, createApiKey);
router.get("/org/api-keys", authAdmin, listApiKeys);
router.delete("/org/api-keys/:keyId", authAdmin, revokeApiKey);

router.get("/metrics", authAdmin, (_req, res) => {
  return res.status(403).json({
    error: "Global metrics require the Prometheus service credential",
  });
});

// Prometheus scrape endpoint: accessible via bearer token for production monitoring.
// Usage: Authorization: Bearer <PROMETHEUS_BEARER_TOKEN>
router.get("/metrics/prometheus", authPrometheus, async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

export default router;
