import userModel from "../models/user.js";
import jobModel from "../models/job.js";
import { scheduledJobsQueue, immediateJobsQueue } from "../config/queue.js";
import mongoose from "mongoose";
import { encryptSink, decryptSink } from "../utils/crypto.js";

const JOB_NAME = "dispatch-job";

// ─── Helper: Prepare sink for queue (decrypt so worker gets plaintext) ───
function prepareSinkForQueue(sink) {
  return decryptSink(sink);
}

export const createJob = async (req, res) => {
  try {
    const {
      name,
      type,
      schedule,
      payload,
      enabled,
      retryLimit,
      webhookUrl,
      orgId,
      dependsOn,
      status,
      nextRunAt,
      sink,
    } = req.body;

    const userId = req.user.id;
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!name || !type || !schedule || !payload) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["http", "shell"].includes(type)) {
      return res.status(400).json({ message: "Invalid job type" });
    }

    if (type === "http") {
      if (!payload.url || !payload.method) {
        return res
          .status(400)
          .json({ message: "HTTP job requires url and method in payload" });
      }
    } else if (type === "shell") {
      if (!payload.command) {
        return res
          .status(400)
          .json({ message: "Shell job required command in payload" });
      }
    }

    const validatedDependencies = await validateDependencies(
      dependsOn,
      user.orgId,
    );
    if (validatedDependencies.error) {
      return res.status(400).json({ message: validatedDependencies.error });
    }

    // ─── T2: ENCRYPT sink.uri before saving to MongoDB ───
    const safeSink = sink
      ? encryptSink(sink)
      : { type: null, uri: null, collection: null };

    const newJob = new jobModel({
      userId: userId,
      name,
      type,
      schedule,
      payload,
      enabled,
      retryLimit,
      webhookUrl,
      orgId: user.orgId,
      dependsOn: validatedDependencies.dependencies,
      sink: safeSink,
      status: status || "active",
      nextRunAt: nextRunAt || null,
    });

    const circularCheck = await checkCircularDependency(
      newJob._id,
      validatedDependencies.dependencies,
    );
    if (circularCheck.isCircular) {
      return res.status(400).json({
        message: `Circular dependency detected: ${circularCheck.path}`,
      });
    }

    await newJob.save();

    if (enabled !== false) {
      await scheduledJobsQueue.add(
        JOB_NAME,
        {
          jobId: newJob._id,
          payload: newJob.payload,
          orgId: user.orgId,
          webhookUrl: newJob.webhookUrl,
          // ─── Pass DECRYPTED sink to queue so worker can use it ───
          sink: prepareSinkForQueue(newJob.sink),
          dependsOn: validatedDependencies.dependencies,
        },
        {
          repeat: { pattern: schedule },
          jobId: String(newJob._id),
        },
      );
    }

    return res
      .status(201)
      .json({ message: "Job created successfully", job: newJob });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getJobs = async (req, res) => {
  try {
    const jobs = await jobModel
      .find({ orgId: req.user.orgId })
      .populate("userId", "username email");

    // ─── T2: Decrypt sink.uri before sending to frontend ───
    const decryptedJobs = jobs.map((job) => {
      const jobObj = job.toObject();
      jobObj.sink = decryptSink(jobObj.sink);
      return jobObj;
    });

    return res.status(200).json(decryptedJobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getJobById = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobModel
      .findOne({ _id: jobId, orgId: req.user.orgId })
      .populate("userId", "username email");

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // ─── T2: Decrypt sink.uri before sending to frontend ───
    const jobObj = job.toObject();
    jobObj.sink = decryptSink(jobObj.sink);

    return res.status(200).json(jobObj);
  } catch (error) {
    console.error("Error fetching job by ID:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await jobModel.findOne({
      _id: jobId,
      orgId: req.user.orgId,
    });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const oldSchedule = job.schedule;

    const {
      name,
      type,
      schedule,
      payload,
      enabled,
      retryLimit,
      dependsOn,
      webhookUrl,
      sink,
    } = req.body;

    if (name !== undefined) job.name = name;
    if (webhookUrl !== undefined) job.webhookUrl = webhookUrl;

    // ─── T2: ENCRYPT sink.uri before saving to MongoDB ───
    if (sink !== undefined) {
      job.sink = encryptSink(sink);
    }

    if (type !== undefined) {
      if (!["http", "shell"].includes(type)) {
        return res.status(400).json({ message: "Invalid job type" });
      }
      job.type = type;
    }
    if (schedule !== undefined) {
      job.schedule = schedule;
    }
    if (payload !== undefined) job.payload = payload;

    if (dependsOn !== undefined) {
      const validatedDependencies = await validateDependencies(
        dependsOn,
        req.user.orgId,
      );
      if (validatedDependencies.error) {
        return res.status(400).json({ message: validatedDependencies.error });
      }

      const circularCheck = await checkCircularDependency(
        job._id,
        validatedDependencies.dependencies,
      );
      if (circularCheck.isCircular) {
        return res.status(400).json({
          message: `Circular dependency detected: ${circularCheck.path}`,
        });
      }

      job.dependsOn = validatedDependencies.dependencies;
    }

    const effectiveType = type !== undefined ? type : job.type;
    const effectivePayload = payload !== undefined ? payload : job.payload;

    if (effectiveType === "http") {
      if (!effectivePayload.url || !effectivePayload.method) {
        return res
          .status(400)
          .json({ message: "HTTP jobs require url and method in payload" });
      }
    } else if (effectiveType === "shell") {
      if (!effectivePayload.command) {
        return res
          .status(400)
          .json({ message: "Shell jobs require command in payload" });
      }
    }

    if (enabled !== undefined) job.enabled = enabled;
    if (retryLimit !== undefined) job.retryLimit = retryLimit;

    await job.save();

    const jobIdStr = String(job._id);

    try {
      await scheduledJobsQueue.removeRepeatable(
        JOB_NAME,
        { pattern: oldSchedule },
        jobIdStr,
      );
    } catch (err) {}

    if (job.enabled) {
      await scheduledJobsQueue.add(
        JOB_NAME,
        {
          jobId: job._id,
          payload: job.payload,
          orgId: req.user.orgId,
          webhookUrl: job.webhookUrl,
          // ─── Pass DECRYPTED sink to queue so worker can use it ───
          sink: prepareSinkForQueue(job.sink),
          dependsOn: job.dependsOn || [],
        },
        {
          repeat: { pattern: job.schedule },
          jobId: jobIdStr,
        },
      );
    }

    return res.status(200).json({ message: "Job updated successfully", job });
  } catch (error) {
    console.error("Error updating job:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await jobModel.findOne({
      _id: jobId,
      userId,
      orgId: req.user.orgId,
    });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const jobIdStr = String(job._id);

    try {
      await scheduledJobsQueue.removeRepeatable(
        JOB_NAME,
        { pattern: job.schedule },
        jobIdStr,
      );
    } catch (err) {}

    await jobModel.deleteOne({ _id: jobId, userId, orgId: req.user.orgId });
    return res.status(200).json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Error deleting job:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const toggleJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;
    const job = await jobModel.findOne({
      _id: jobId,
      userId,
      orgId: req.user.orgId,
    });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    job.enabled = !job.enabled;
    await job.save();

    const jobIdStr = String(job._id);

    if (job.enabled) {
      await scheduledJobsQueue.add(
        JOB_NAME,
        {
          jobId: job._id,
          payload: job.payload,
          orgId: req.user.orgId,
          webhookUrl: job.webhookUrl,
          // ─── Pass DECRYPTED sink to queue ───
          sink: prepareSinkForQueue(job.sink),
          dependsOn: job.dependsOn || [],
        },
        {
          repeat: { pattern: job.schedule },
          jobId: jobIdStr,
        },
      );
    } else {
      try {
        await scheduledJobsQueue.removeRepeatable(
          JOB_NAME,
          { pattern: job.schedule },
          jobIdStr,
        );
      } catch (err) {}
    }
    return res
      .status(200)
      .json({ message: "Job status toggled successfully", job });
  } catch (error) {
    console.error("Error toggling job status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const runJobNow = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobModel.findOne({
      _id: jobId,
      orgId: req.user.orgId,
    });

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    await immediateJobsQueue.add(
      JOB_NAME,
      {
        jobId: job._id,
        payload: job.payload,
        orgId: req.user.orgId,
        webhookUrl: job.webhookUrl,
        // ─── Pass DECRYPTED sink to queue ───
        sink: prepareSinkForQueue(job.sink),
        dependsOn: job.dependsOn || [],
      },
      {
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return res.status(200).json({ message: "Job triggered manually" });
  } catch (error) {
    console.error("Manual trigger error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

async function validateDependencies(dependsOn, orgId) {
  if (!dependsOn || !Array.isArray(dependsOn) || dependsOn.length === 0) {
    return { dependencies: [], error: null };
  }

  const invalidIds = dependsOn.filter(
    (id) => !mongoose.Types.ObjectId.isValid(id),
  );
  if (invalidIds.length > 0) {
    return {
      dependencies: [],
      error: `Invalid job IDs in dependencies: ${invalidIds.join(", ")}`,
    };
  }

  const dependencyJobs = await jobModel.find({
    _id: { $in: dependsOn },
    orgId: orgId,
  });

  if (dependencyJobs.length !== dependsOn.length) {
    const foundIds = dependencyJobs.map((job) => job._id.toString());
    const missingIds = dependsOn.filter((id) => !foundIds.includes(id));
    return {
      dependencies: [],
      error: `Dependency jobs not found or not in same organization: ${missingIds.join(
        ", ",
      )}`,
    };
  }

  return { dependencies: dependsOn, error: null };
}

async function checkCircularDependency(
  jobId,
  dependencies,
  visited = new Set(),
  path = [],
) {
  const jobIdStr = jobId.toString();

  if (visited.has(jobIdStr)) {
    return {
      isCircular: true,
      path: [...path, jobIdStr].join(" -> "),
    };
  }

  visited.add(jobIdStr);
  path.push(jobIdStr);

  for (const depId of dependencies) {
    const depJob = await jobModel.findById(depId).select("dependsOn");

    if (depJob && depJob.dependsOn && depJob.dependsOn.length > 0) {
      const result = await checkCircularDependency(
        depId,
        depJob.dependsOn,
        new Set(visited),
        [...path],
      );
      if (result.isCircular) {
        return result;
      }
    }
  }
  return { isCircular: false, path: null };
}
