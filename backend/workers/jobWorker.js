import { Worker } from "bullmq";
import { redisConnection } from "../config/queue.js";
import jobHistoryModel from "../models/jobHistory.js";
import jobModel from "../models/job.js";
import Agent from "../models/agent.js";
import { io } from "../server.js";
import axios from "axios";
import mongoose from "mongoose";
import { decrypt } from "../utils/crypto.js";

async function checkDependenciesMet(jobId) {
  const job = await jobModel.findById(jobId).select("dependsOn").lean();

  if (!job || !job.dependsOn || job.dependsOn.length === 0) {
    return { met: true, failedDeps: [] };
  }

  const failedDeps = [];

  for (const depId of job.dependsOn) {
    const depIdStr = depId.toString();

    const latestHistory = await jobHistoryModel
      .findOne({ jobId: depIdStr })
      .sort({ executedAt: -1 })
      .select("status executedAt")
      .lean();

    if (!latestHistory) {
      failedDeps.push({
        jobId: depIdStr,
        reason: "never_executed",
      });
      continue;
    }

    if (latestHistory.status !== "success") {
      failedDeps.push({
        jobId: depIdStr,
        reason: `last_status_${latestHistory.status}`,
        lastRun: latestHistory.executedAt,
      });
    }
  }

  return {
    met: failedDeps.length === 0,
    failedDeps,
  };
}

const jobProcessor = async (job) => {
  console.log(`Worker picked up job: ${job.id} from queue: ${job.queueName}`);

  const { jobId, payload, orgId, webhookUrl, sink, dependsOn } = job.data;

  let status = "success";
  let output = null;
  let error = null;
  const startTime = Date.now();

  try {
    if (dependsOn && dependsOn.length > 0) {
      console.log(
        `Job ${jobId} has ${dependsOn.length} dependencies. Checking...`,
      );
      const depCheck = await checkDependenciesMet(jobId);

      if (!depCheck.met) {
        const failedNames = depCheck.failedDeps
          .map((d) => `${d.jobId} (${d.reason})`)
          .join(", ");
        throw new Error(`Dependencies not met. Blocked by: [${failedNames}]`);
      }
      console.log(`All dependencies met for job ${jobId}. Proceeding...`);
    }

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
    } else if (payload.command) {
      console.log(`Shell Job Detected. Looking for Agents for Org: ${orgId}`);
      const agent = await Agent.findOne({ orgId: orgId, status: "online" });
      if (!agent || !agent.socketId) {
        throw new Error(
          `No Online Agents found for Org ${orgId}. Is your Rust Agent running?`,
        );
      }
      console.log(
        `Dispatching to Agent: ${agent.name} (Socket: ${agent.socketId})`,
      );
      const socket = io.sockets.sockets.get(agent.socketId);
      if (!socket)
        throw new Error("Agent socket not found in active connections.");

      const agentResponse = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.removeAllListeners("command_result");
          reject(new Error("Agent Execution Timed Out (10s)"));
        }, 10000);
        const listener = (data) => {
          if (data.jobId === jobId) {
            clearTimeout(timeout);
            socket.off("command_result", listener);
            resolve(data);
          }
        };
        socket.on("command_result", listener);
        socket.emit("execute_command", {
          jobId: jobId,
          command: payload.command,
        });
      });
      if (agentResponse.error) throw new Error(agentResponse.error);
      output = agentResponse;
    }

    if (sink && sink.type === "mongo" && sink.uri && sink.collection) {
      console.log("Sinking output to MongoDB Sink...");
      try {
        const decryptedUri = decrypt(sink.uri);
        const conn = await mongoose.createConnection(decryptedUri).asPromise();
        const dataToSink = payload.url ? output.data : output;
        await conn.collection(sink.collection).insertOne({
          jobId,
          orgId,
          executedAt: new Date(),
          data: dataToSink,
        });
        await conn.close();
        console.log("Data successfully sunk.");
      } catch (sinkErr) {
        console.error("Sink Failed:", sinkErr.message);
      }
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

  const duration = Date.now() - startTime;
  try {
    await jobHistoryModel.create({
      jobId,
      orgId,
      status,
      duration,
      executedAt: new Date(),
      exitCode: output?.exitCode || (status === "success" ? 0 : 1),
      output: {
        stdout:
          typeof output === "object"
            ? JSON.stringify(output)
            : output?.stdout || "",
        stderr: error || output?.stderr || "",
      },
    });
    console.log(`History Saved (${status}, ${duration}ms).`);
  } catch (e) {
    console.error("Failed to save history:", e);
  }

  if (webhookUrl) {
    try {
      console.log("Firing Webhook...");
      await axios.post(webhookUrl, {
        jobId,
        status,
        output,
        duration,
        timestamp: new Date(),
      });
    } catch (webhookErr) {
      console.warn("Webhook failed:", webhookErr.message);
    }
  }

  return { status, jobId, duration };
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
  "Axon Workers Started: Listening on 'scheduled-jobs' and 'immediate-jobs'",
);
