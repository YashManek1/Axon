import { Worker } from "bullmq";
import { redisConnection } from "../config/queue.js";
import jobHistoryModel from "../models/jobHistory.js";
import Agent from "../models/agent.js";
import { io } from "../server.js";
import axios from "axios";
import mongoose from "mongoose";

const jobProcessor = async (job) => {
  console.log(`Worker picked up job: ${job.id} from queue: ${job.queueName}`);

  const { jobId, payload, orgId, webhookUrl, sink } = job.data;

  let status = "success";
  let output = null;
  let error = null;

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
      // 1. Get the Specific Socket Instance
      const socket = io.sockets.sockets.get(agent.socketId);
      if (!socket)
        throw new Error("Agent socket not found in active connections.");
      // 2. Dispatch & Wait for Event
      const agentResponse = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.removeAllListeners("command_result");
          reject(new Error("Agent Execution Timed Out (10s)"));
        }, 10000);
        // A. Listen for the specific response
        const listener = (data) => {
          if (data.jobId === jobId) {
            clearTimeout(timeout);
            socket.off("command_result", listener);
            resolve(data);
          }
        };
        socket.on("command_result", listener);
        // B. Send the Command
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
        const conn = await mongoose.createConnection(sink.uri).asPromise();
        const dataToSink = payload.url ? output.data : output;
        await conn.collection(sink.collection).insertOne({
          jobId,
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

  try {
    await jobHistoryModel.create({
      jobId,
      orgId,
      status,
      executedAt: new Date(),
      exitCode: output?.exitCode || 0,
      output: {
        stdout: output?.stdout || "",
        stderr: output?.stderr || "",
      },
    });
    console.log("History Saved (Structured).");
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
  "Axon Workers Started: Listening on 'scheduled-jobs' and 'immediate-jobs'",
);
