import { Worker } from "bullmq";
import { redisConnection } from "../config/queue.js";
import jobHistoryModel from "../models/jobHistory.js";
import axios from "axios";

const jobProcessor = async (job) => {
  console.log(
    `Worker picked up job: ${job.id} from queue: ${job.queueName}`
  );

  const { jobId, payload, orgId, webhookUrl } = job.data;

  let status = "success";
  let output = null;
  let error = null;

  // A. EXECUTION
  try {
    if (payload.url) {
      console.log(`Running HTTP Job: ${payload.method} ${payload.url}`);
      const response = await axios({
        method: payload.method,
        url: payload.url,
        data: payload.body,
        headers: payload.headers,
      });
      output = {
        status: response.status,
        data: response.data,
      };
    } else {
      // Placeholder for Shell/Rust jobs (Sprint 3)
      console.log("Shell Job detected - waiting for Agent (Sprint 3)");
      output = { message: "Shell job executed (Mock)" };
    }
  } catch (err) {
    status = "failure";
    error = err.message;
    console.error(`Job Failed: ${err.message}`);
    if (err.response) {
      output = {
        status: err.response.status,
        data: err.response.data,
      };
    }
  }

  // B. SAVE HISTORY
  try {
    if (!orgId) console.warn("Warning: orgId missing in job data");

    await jobHistoryModel.create({
      jobId: jobId,
      status: status,
      output: output,
      error: error,
      executedAt: new Date(),
      orgId: orgId,
    });
    console.log("History Saved.");
  } catch (histErr) {
    console.error("Failed to save history:", histErr);
  }

  // C. WEBHOOK
  if (webhookUrl) {
    try {
      console.log("Firing Webhook...");
      await axios.post(webhookUrl, {
        jobId,
        status,
        output,
        timestamp: new Date(),
      });
    } catch (webhookErr) {
      console.warn("Webhook failed:", webhookErr.message);
    }
  }

  return { status, jobId };
};

export const scheduledWorker = new Worker("scheduled-jobs", jobProcessor, {
  connection: redisConnection,
  concurrency: 5,
});

export const immediateWorker = new Worker("immediate-jobs", jobProcessor, {
  connection: redisConnection,
  concurrency: 5,
});

scheduledWorker.on("failed", (job, err) => {
  console.error(`Scheduled Job ${job.id} failed: ${err.message}`);
});

immediateWorker.on("failed", (job, err) => {
  console.error(`Immediate Job ${job.id} failed: ${err.message}`);
});

console.log(
  "Axon Workers Started: Listening on 'scheduled-jobs' and 'immediate-jobs'"
);
