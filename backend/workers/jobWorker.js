import { Worker } from "bullmq";
import { redisConnection } from "../config/queue.js";
import jobHistoryModel from "../models/jobHistory.js";
import Agent from "../models/agent.js";
import axios from "axios";
import mongoose from "mongoose";
import { decrypt } from "../utils/crypto.js";
import { createChildLogger } from "../config/logger.js";
import { releaseJobLock } from "../services/distributedLock.js";
import {
  acquireExecutionSlot,
  checkDependenciesMet,
  setJobState,
} from "../services/dagStateManager.js";
import {
  createAuditRecord,
  updateAuditRecord,
} from "../services/auditService.js";
import {
  configureJobExecutionRouter,
  dispatchCommandToAgent,
} from "../services/jobExecutionRouter.js";
import { publishLogChunk } from "../services/logStreamBroker.js";
import { sendJobNotification } from "../services/notificationService.js";
import { isWithinExecutionWindow } from "../utils/executionWindow.js";
import { buildSinkPayload } from "../utils/sinkFormat.js";
import {
  FLUSH_AGENT_TELEMETRY_JOB_NAME,
  flushAgentTelemetry,
} from "./telemetryFlushWorker.js";

const logger = createChildLogger({ module: "job-worker" });

export function configureJobWorker(io) {
  configureJobExecutionRouter(io);
}

function getAuditCommand(payload) {
  if (payload?.command) {
    return payload.command;
  }

  if (payload?.url) {
    return `${payload.method} ${payload.url}`;
  }

  return "unknown";
}

function getOutputSummaries(output, error) {
  if (output?.stdout !== undefined || output?.stderr !== undefined) {
    return {
      stdoutSummary: output?.stdout || "",
      stderrSummary: error || output?.stderr || "",
    };
  }

  return {
    stdoutSummary:
      output === undefined || output === null ? "" : JSON.stringify(output),
    stderrSummary: error || "",
  };
}

async function safeUpdateAuditRecord(auditId, updates, jobLogger) {
  if (!auditId) {
    return;
  }

  try {
    await updateAuditRecord(auditId, updates);
  } catch (err) {
    jobLogger.error({ err, auditId }, "Failed to update audit record");
  }
}

async function publishCommandOutput(jobId, orgId, agentResponse) {
  if (Array.isArray(agentResponse?.chunks)) {
    await Promise.all(
      agentResponse.chunks.map((chunk) => publishLogChunk(jobId, orgId, chunk)),
    );
  }

  const publishLines = async (stream, text) => {
    if (!text) {
      return;
    }

    const timestampMs = Date.now();
    const lines = String(text)
      .split(/\r?\n/)
      .filter((line) => line.length > 0);

    await Promise.all(
      lines.map((line, index) =>
        publishLogChunk(jobId, orgId, {
          stream,
          line,
          timestampMs: timestampMs + index,
        }),
      ),
    );
  };

  await publishLines("stdout", agentResponse?.stdout);
  await publishLines("stderr", agentResponse?.stderr);
}

export const jobProcessor = async (job) => {
  if (job.name === FLUSH_AGENT_TELEMETRY_JOB_NAME) {
    return flushAgentTelemetry();
  }

  const {
    jobId,
    payload,
    orgId,
    webhookUrl,
    sink,
    dependsOn,
    triggeredBy,
    triggerType,
    notifications,
    jobName,
    executionWindow,
    timezone,
    timeout,
  } = job.data;
  const jobLogger = logger.child({
    bullJobId: job.id,
    queueName: job.queueName,
    jobId,
    orgId,
  });

  jobLogger.info({ payloadType: payload.url ? "http" : "shell" }, "Worker picked up job");

  let status = "success";
  let output = null;
  let error = null;
  const startTime = Date.now();
  const workerId = `${job.queueName}:${job.id}`;
  const auditRecord = await createAuditRecord({
    jobId,
    orgId,
    triggeredBy,
    triggerType: triggerType || "SCHEDULED",
    command: getAuditCommand(payload),
    status: "PENDING",
    metadata: {
      bullJobId: job.id,
      queueName: job.queueName,
    },
  });
  const auditId = auditRecord?._id;
  if (job.data?.__testHooks?.afterAuditCreated) {
    await job.data.__testHooks.afterAuditCreated(auditRecord);
  }
  const executionSlot = await acquireExecutionSlot(jobId, workerId);

  if (!executionSlot.acquired) {
    jobLogger.warn(
      { jobId, existingWorker: executionSlot.existingWorker },
      "Job lock already held; skipping duplicate dispatch",
    );
    await safeUpdateAuditRecord(
      auditId,
      {
        status: "CANCELLED",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        stderrSummary: "Job lock already held; skipped duplicate dispatch",
      },
      jobLogger,
    );
    return { status: "skipped", jobId, reason: "lock-held" };
  }

  try {
    // Skip run if current time is outside the configured execution window.
    if (executionWindow?.enabled && !isWithinExecutionWindow(executionWindow, timezone)) {
      jobLogger.info({ executionWindow, timezone }, "Job outside execution window; skipping run");
      await safeUpdateAuditRecord(
        auditId,
        {
          status: "SKIPPED",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          stderrSummary: "outside-execution-window",
        },
        jobLogger,
      );
      return { status: "skipped", jobId, reason: "outside-execution-window" };
    }

    await setJobState(jobId, "RUNNING");
    await safeUpdateAuditRecord(auditId, { status: "DISPATCHED" }, jobLogger);

    try {
    if (dependsOn && dependsOn.length > 0) {
      jobLogger.info({ dependencyCount: dependsOn.length }, "Checking job dependencies");
      const depCheck = await checkDependenciesMet(jobId, dependsOn);

      if (!depCheck.met) {
        const failedNames = depCheck.blockedBy
          .map((dependency) => `${dependency.jobId} (${dependency.currentState})`)
          .join(", ");
        throw new Error(`Dependencies not met. Blocked by: [${failedNames}]`);
      }
      jobLogger.info({ dependencyCount: dependsOn.length }, "All dependencies met");
    }

    if (payload.url) {
      jobLogger.info({ method: payload.method, url: payload.url }, "Running HTTP job");
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
      jobLogger.info({ command: payload.command }, "Looking for online agent for shell job");
      const agent = await Agent.findOne({ orgId: orgId, status: "online" });
      if (!agent || !agent.socketId) {
        throw new Error(
          `No Online Agents found for Org ${orgId}. Is your Rust Agent running?`,
        );
      }
      jobLogger.info(
        { agentId: agent._id, agentName: agent.name, socketId: agent.socketId },
        "Dispatching shell job to agent",
      );
      const agentTimeoutMs = (timeout ?? 30) * 1000;
      const agentResponse = await dispatchCommandToAgent(
        jobId,
        agent.socketId,
        payload.command,
        agentTimeoutMs,
      );
      if (agentResponse.error) throw new Error(agentResponse.error);
      await publishCommandOutput(jobId, orgId, agentResponse);
      output = agentResponse;
    }

    if (sink && sink.type === "mongo" && sink.uri && sink.collectionName) {
      jobLogger.info({ sinkType: sink.type, collection: sink.collectionName }, "Sinking output");
      try {
        const decryptedUri = decrypt(sink.uri);
        const connOpts = sink.databaseName ? { dbName: sink.databaseName } : {};
        const conn = await mongoose.createConnection(decryptedUri, connOpts).asPromise();
        const dataToSink = payload.url ? output.data : output;
        const formats = await buildSinkPayload(dataToSink, sink.exportFormat ?? []);
        await conn.collection(sink.collectionName).insertOne({
          jobId,
          orgId,
          executedAt: new Date(),
          formats,
        });
        await conn.close();
        jobLogger.info({ sinkType: sink.type, collection: sink.collectionName }, "Output sunk successfully");
      } catch (sinkErr) {
        jobLogger.error({ err: sinkErr, sinkType: sink.type, collection: sink.collectionName }, "Sink failed");
      }
    }
  } catch (err) {
    status = "failure";
    error = err.message;
    jobLogger.error({ err }, "Job failed");
    if (err.response) {
      output = {
        status: err.response.status,
        data: err.response.data,
      };
    }
  }

    const duration = Date.now() - startTime;
    const auditStatus =
      error === "EXECUTION_TIMEOUT" ? "TIMEOUT" : status === "success" ? "COMPLETED" : "FAILED";
    await setJobState(jobId, auditStatus);
    const { stdoutSummary, stderrSummary } = getOutputSummaries(output, error);

    await safeUpdateAuditRecord(
      auditId,
      {
        status: auditStatus,
        completedAt: new Date(),
        durationMs: duration,
        exitCode: output?.exitCode || (status === "success" ? 0 : 1),
        stdoutSummary,
        stderrSummary,
      },
      jobLogger,
    );

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
      jobLogger.info({ status, durationMs: duration }, "Job history saved");
    } catch (e) {
      jobLogger.error({ err: e, status, durationMs: duration }, "Failed to save job history");
    }

    if (webhookUrl) {
      try {
        jobLogger.info({ webhookUrl }, "Firing webhook");
        await axios.post(webhookUrl, {
          jobId,
          status,
          output,
          duration,
          timestamp: new Date(),
        });
      } catch (webhookErr) {
        jobLogger.warn({ err: webhookErr, webhookUrl }, "Webhook failed");
      }
    }

    if (notifications?.recipients?.length > 0) {
      const shouldNotify = status === "success"
        ? notifications.onSuccess
        : notifications.onFailure;
      if (shouldNotify) {
        await sendJobNotification({
          jobName:   jobName ?? String(jobId),
          jobId:     String(jobId),
          status,
          durationMs: duration,
          recipients: notifications.recipients,
        });
      }
    }

    return { status, jobId, duration };
  } finally {
    await releaseJobLock(jobId);
  }
};

const shouldStartWorkers = process.env.NODE_ENV !== "test";

export const scheduledWorker = shouldStartWorkers
  ? new Worker("scheduled-jobs", jobProcessor, {
      connection: redisConnection,
      concurrency: 5,
    })
  : null;

export const immediateWorker = shouldStartWorkers
  ? new Worker("immediate-jobs", jobProcessor, {
      connection: redisConnection,
      concurrency: 5,
    })
  : null;

if (scheduledWorker && immediateWorker) {
  scheduledWorker.on("failed", (job, err) => {
    logger.error({ err, bullJobId: job?.id, queueName: "scheduled-jobs" }, "Scheduled job failed");
  });

  immediateWorker.on("failed", (job, err) => {
    logger.error({ err, bullJobId: job?.id, queueName: "immediate-jobs" }, "Immediate job failed");
  });

  logger.info({ queues: ["scheduled-jobs", "immediate-jobs"] }, "Axon workers started");
}
