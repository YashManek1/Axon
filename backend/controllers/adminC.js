import userModel from "../models/user.js";
import jobModel from "../models/job.js";
import jobHistoryModel from "../models/jobHistory.js";
import agentModel from "../models/agent.js";
import orgModel from "../models/organization.js";
import mongoose from "mongoose";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "admin-controller" });

export const HealthCheck = async (req, res) => {
  try {
    // Check MongoDB connection state (0: disconnected, 1: connected, 2: connecting, 3: disconnecting)
    const dbState = mongoose.connection.readyState;
    const dbConnected = dbState === 1;

    // Try a simple query as well (optional, ensures queries work)
    let userCount = null;
    try {
      userCount = await userModel.countDocuments();
    } catch {
      // ignore, handled below
    }

    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      dbConnected,
      dbState,
      userCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Health check failed");
    res.status(500).json({ status: "error", dbConnected: false });
  }
};

export const jobStats = async (req, res) => {
  try {
    const totalJobs = await jobModel.countDocuments();
    const enabledJobs = await jobModel.countDocuments({ enabled: true });
    const disabledJobs = await jobModel.countDocuments({ enabled: false });

    // Jobs by org
    const jobsByOrgAgg = await jobModel.aggregate([
      { $group: { _id: "$orgId", count: { $sum: 1 } } },
    ]);

    const jobsByOrg = await Promise.all(
      jobsByOrgAgg.map(async (org) => {
        const orgDoc = await orgModel.findById(org._id);
        return {
          orgId: org._id,
          orgName: orgDoc?.name || "Unknown",
          count: org.count,
        };
      })
    );

    // Jobs run in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobsRunLast24h = await jobHistoryModel.distinct("jobId", {
      executedAt: { $gte: since },
    });

    res.json({
      totalJobs,
      jobsByOrg,
      enabledJobs,
      disabledJobs,
      jobsRunLast24h: jobsRunLast24h.length,
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch job stats");
    res.status(500).json({ message: "Failed to fetch job stats" });
  }
};

// User Activity
export const userStats = async (req, res) => {
  try {
    const totalUsers = await userModel.countDocuments();

    // Get users and job counts per user
    const users = await userModel.find().select("username email orgId");
    const jobs = await jobModel.aggregate([
      { $group: { _id: "$userId", jobCount: { $sum: 1 } } },
    ]);
    // Map userId to jobCount
    const jobCountMap = {};
    jobs.forEach((j) => {
      jobCountMap[j._id.toString()] = j.jobCount;
    });

    const userData = users.map((u) => ({
      username: u.username,
      email: u.email,
      orgId: u.orgId,
      jobCount: jobCountMap[u._id.toString()] || 0,
    }));

    res.json({
      totalUsers,
      users: userData,
    });
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch user stats");
    res.status(500).json({ message: "Failed to fetch user stats" });
  }
};


export const orgAnalytics = async (req, res) => {
  try {
    const orgs = await orgModel.find().select("name description createdAt").lean();

    const orgStats = await Promise.all(
      orgs.map(async (org) => {
        const [userCount, agents, shellJobCount, httpJobCount] = await Promise.all([
          userModel.countDocuments({ orgId: org._id }),
          agentModel
            .find({ orgId: org._id, decommissionedAt: null })
            .select("status")
            .lean(),
          jobModel.countDocuments({ orgId: org._id, type: "shell" }),
          jobModel.countDocuments({ orgId: org._id, type: "http" }),
        ]);

        const onlineAgents  = agents.filter((a) => a.status === "online" || a.status === "busy").length;
        const offlineAgents = agents.filter((a) => a.status === "offline").length;

        return {
          orgId:          org._id,
          orgName:        org.name,
          orgDescription: org.description ?? "",
          createdAt:      org.createdAt,
          userCount,
          agentCount:    agents.length,
          onlineAgents,
          offlineAgents,
          shellJobCount,
          httpJobCount,
          totalJobCount: shellJobCount + httpJobCount,
        };
      })
    );

    const [totalAgents, onlineAgentsTotal] = await Promise.all([
      agentModel.countDocuments({ decommissionedAt: null }),
      agentModel.countDocuments({
        decommissionedAt: null,
        status: { $in: ["online", "busy"] },
      }),
    ]);

    res.json({
      totalOrgs:     orgs.length,
      totalAgents,
      onlineAgents:  onlineAgentsTotal,
      offlineAgents: totalAgents - onlineAgentsTotal,
      orgs:          orgStats,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to fetch org analytics");
    res.status(500).json({ message: "Failed to fetch org analytics" });
  }
};
//Get All Jobs/Users
export const getAllJobs = async (req, res) => {
  try {
    const jobs = await jobModel
      .find()
      .populate("userId", "username email")
      .populate("orgId", "name");
    res.json(jobs);
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch all jobs");
    res.status(500).json({ message: "Failed to fetch all jobs" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await userModel.find().populate("orgId", "name");
    res.json(users);
  } catch (e) {
    logger.error({ err: e }, "Failed to fetch all users");
    res.status(500).json({ message: "Failed to fetch all users" });
  }
};
