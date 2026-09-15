import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "../config/queue.js";
import jobHistoryModel from "../models/jobHistory.js";
import Agent from "../models/agent.js";
import JobModel from "../models/job.js";
import User from "../models/user.js";
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
import {
  claimRunForDispatch,
  completeRun,
  markRunAcknowledged,
} from "../services/jobRunService.js";
import { publishLogChunk } from "../services/logStreamBroker.js";
import { sendJobNotification } from "../services/notificationService.js";
import { isWithinExecutionWindow } from "../utils/executionWindow.js";
import { hasResourceAccess } from "../middlewares/jwt.js";
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

async function publishCommandOutput(jobId, orgId, runId, agentResponse) {
  if (Array.isArray(agentResponse?.chunks)) {
    await Promise.all(
      agentResponse.chunks.map((chunk) => publishLogChunk(jobId, orgId, chunk, runId ?? jobId)),
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
        }, runId ?? jobId),
      ),
    );
  };

  await publishLines("stdout", agentResponse?.stdout);
  await publishLines("stderr", agentResponse?.stderr);
}

function classifyAgentResult(agentResponse) {
  const outcome = String(agentResponse?.outcome ?? "").toLowerCase();
  if (outcome === "completed") {
    if (!Number.isInteger(agentResponse?.exitCode)) {
      return { status: "UNKNOWN", outcome: "UNKNOWN", reasonCode: "EXIT_CODE_MISSING" };
    }
    return agentResponse.exitCode === 0
      ? { status: "SUCCEEDED", outcome: "COMPLETED", reasonCode: null }
      : { status: "FAILED", outcome: "COMPLETED", reasonCode: "NONZERO_EXIT" };
  }
  if (outcome === "rejected") {
    return {
      status: "REJECTED",
      outcome: "REJECTED",
      reasonCode: agentResponse?.reasonCode ?? "AGENT_REJECTED",
    };
  }
  if (outcome === "timed_out") {
    return {
      status: "TIMED_OUT",
      outcome: "TIMED_OUT",
      reasonCode: agentResponse?.reasonCode ?? "EXECUTION_DEADLINE_EXCEEDED",
    };
  }
  return {
    status: "UNKNOWN",
    outcome: "UNKNOWN",
    reasonCode: agentResponse?.reasonCode ?? "UNRECOGNIZED_AGENT_OUTCOME",
  };
}

function includesId(values, expected) {
  return (values ?? []).some((value) => String(value) === String(expected));
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
    protocolVersion,
    targetAgentId,
    targetSocketId,
    runId,
    targetExecutionId,
    attemptId,
    operationId,
    actionVersion,
    allowedCommands,
    timeoutMs,
    startBefore,
    maxOutputBytes,
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
  let reasonCode = null;
  let executionOutcome = null;
  let runCompleted = false;
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
    agentId: targetAgentId ?? undefined,
    runId: runId ?? undefined,
    targetExecutionId: targetExecutionId ?? undefined,
    attemptId: attemptId ?? undefined,
    operationId: operationId ?? undefined,
  });
  const auditId = auditRecord?._id;
  if (job.data?.__testHooks?.afterAuditCreated) {
    await job.data.__testHooks.afterAuditCreated(auditRecord);
  }
  const executionSlot = await acquireExecutionSlot(jobId, workerId);
  const { fencingToken } = executionSlot;

  if (!executionSlot.acquired) {
    if (payload?.command && protocolVersion === 2 && runId && attemptId) {
      const blockedClaim = await claimRunForDispatch(job.data);
      if (!blockedClaim.claimed) {
        await safeUpdateAuditRecord(
          auditId,
          {
            status: "SKIPPED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            stderrSummary: "duplicate-or-finalized-run-delivery",
          },
          jobLogger,
        );
        return {
          status: String(blockedClaim.run.status).toLowerCase(),
          jobId,
          runId,
          attemptId,
          duplicateDelivery: true,
        };
      }

      await completeRun(runId, attemptId, {
        status: "REJECTED",
        outcome: "REJECTED",
        reasonCode: "CONCURRENT_JOB_EXECUTION",
      });
      await safeUpdateAuditRecord(
        auditId,
        {
          status: "CANCELLED",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          stderrSummary: "Another run of this job is already executing",
        },
        jobLogger,
      );
      const lockError = new UnrecoverableError(
        "Another run of this job is already executing",
      );
      lockError.code = "CONCURRENT_JOB_EXECUTION";
      lockError.runId = runId;
      lockError.attemptId = attemptId;
      throw lockError;
    }

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
      const required = [
        protocolVersion === 2,
        targetAgentId,
        targetSocketId,
        runId,
        targetExecutionId,
        attemptId,
        operationId,
        actionVersion,
        timeoutMs,
        startBefore,
        maxOutputBytes,
      ];
      if (required.some((value) => !value)) {
        const legacyError = new Error(
          "Legacy targetless shell execution is disabled; create and queue a protocol-v2 JobRun",
        );
        legacyError.code = "PROTOCOL_V2_RUN_REQUIRED";
        throw legacyError;
      }

      const dispatchClaim = await claimRunForDispatch(job.data);
      if (!dispatchClaim.claimed) {
        await safeUpdateAuditRecord(
          auditId,
          {
            status: "SKIPPED",
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            stderrSummary: "duplicate-or-finalized-run-delivery",
          },
          jobLogger,
        );
        return {
          status: String(dispatchClaim.run.status).toLowerCase(),
          jobId,
          runId,
          attemptId,
          duplicateDelivery: true,
        };
      }

      if (Date.now() > startBefore) {
        reasonCode = "START_DEADLINE_EXPIRED";
        await completeRun(runId, attemptId, {
          status: "REJECTED",
          outcome: "REJECTED",
          reasonCode,
        });
        runCompleted = true;
        const deadlineError = new Error("The execution start deadline has expired");
        deadlineError.code = reasonCode;
        throw deadlineError;
      }

      const [currentUser, currentJob] = await Promise.all([
        User.findOne({ _id: triggeredBy?.userId, orgId }),
        JobModel.findOne({ _id: jobId, orgId }),
      ]);
      if (
        !currentUser ||
        !["admin", "operator", "user"].includes(currentUser.role) ||
        !currentJob ||
        !hasResourceAccess(currentUser, currentJob)
      ) {
        reasonCode = "EXECUTION_AUTHORIZATION_REVOKED";
        await completeRun(runId, attemptId, {
          status: "REJECTED",
          outcome: "REJECTED",
          reasonCode,
        });
        runCompleted = true;
        const authorizationError = new Error(
          "The user or job authorization no longer permits this execution",
        );
        authorizationError.code = reasonCode;
        throw authorizationError;
      }

      const agent = await Agent.findOne({
        _id: targetAgentId,
        orgId,
        decommissionedAt: null,
        status: "online",
        socketId: targetSocketId,
      });
      if (!agent) {
        reasonCode = "TARGET_AGENT_UNAVAILABLE";
        await completeRun(runId, attemptId, {
          status: "REJECTED",
          outcome: "REJECTED",
          reasonCode,
        });
        runCompleted = true;
        const targetError = new Error("The exact selected agent is unavailable");
        targetError.code = reasonCode;
        throw targetError;
      }
      if (
        (agent.allowedUsers?.length &&
          !includesId(agent.allowedUsers, triggeredBy?.userId)) ||
        (agent.allowedJobs?.length && !includesId(agent.allowedJobs, jobId))
      ) {
        reasonCode = "AGENT_POLICY_CHANGED";
        await completeRun(runId, attemptId, {
          status: "REJECTED",
          outcome: "REJECTED",
          reasonCode,
        });
        runCompleted = true;
        const policyError = new Error("The selected agent policy no longer permits this run");
        policyError.code = reasonCode;
        throw policyError;
      }
      if (
        JSON.stringify(agent.allowedCommands ?? []) !==
        JSON.stringify(allowedCommands ?? [])
      ) {
        reasonCode = "AGENT_COMMAND_POLICY_CHANGED";
        await completeRun(runId, attemptId, {
          status: "REJECTED",
          outcome: "REJECTED",
          reasonCode,
        });
        runCompleted = true;
        const policyError = new Error("The selected agent command policy changed after launch");
        policyError.code = reasonCode;
        throw policyError;
      }

      const envelope = {
        protocolVersion,
        orgId: String(orgId),
        jobId: String(jobId),
        targetAgentId: String(targetAgentId),
        runId,
        targetExecutionId,
        attemptId,
        operationId,
        actionVersion,
        command: payload.command,
        allowedCommands: allowedCommands ?? [],
        timeoutMs,
        startBefore,
        maxOutputBytes,
      };
      jobLogger.info(
        { agentId: targetAgentId, socketId: targetSocketId, runId, attemptId },
        "Dispatching protocol-v2 shell run to its exact target",
      );
      const dispatch = dispatchCommandToAgent(
        envelope,
        targetSocketId,
        Number(agent.tokenVersion ?? 0),
      );
      void dispatch.resultPromise.catch(() => {});

      try {
        await dispatch.ackPromise;
      } catch (ackError) {
        const unknown = dispatch.emitted !== false;
        reasonCode = ackError.code ?? "DISPATCH_FAILED";
        await completeRun(runId, attemptId, {
          status: unknown ? "UNKNOWN" : "REJECTED",
          outcome: unknown ? "UNKNOWN" : "REJECTED",
          reasonCode,
        });
        runCompleted = true;
        throw ackError;
      }

      try {
        await markRunAcknowledged(runId, attemptId);
      } catch (ackPersistenceError) {
        const stateError = new Error(
          "The agent acknowledged execution, but Axon could not persist that state; outcome requires review",
        );
        stateError.code = "EXECUTION_STATE_PERSISTENCE_UNKNOWN";
        stateError.cause = ackPersistenceError;
        throw stateError;
      }
      await safeUpdateAuditRecord(auditId, { status: "DISPATCHED_ACKED" }, jobLogger);

      let agentResponse;
      try {
        agentResponse = await dispatch.resultPromise;
      } catch (resultError) {
        reasonCode = resultError.code ?? "EXECUTION_OUTCOME_UNKNOWN";
        await completeRun(runId, attemptId, {
          status: "UNKNOWN",
          outcome: "UNKNOWN",
          reasonCode,
        });
        runCompleted = true;
        throw resultError;
      }

      const classification = classifyAgentResult(agentResponse);
      executionOutcome = classification.outcome;
      reasonCode = classification.reasonCode;
      output = agentResponse;
      status =
        classification.status === "SUCCEEDED"
          ? "success"
          : classification.status === "TIMED_OUT"
            ? "timeout"
            : classification.status === "UNKNOWN"
              ? "unknown"
              : classification.status === "CANCELLED"
                ? "cancelled"
                : "failure";
      try {
        await completeRun(runId, attemptId, {
          ...classification,
          exitCode: agentResponse.exitCode,
        });
        runCompleted = true;
      } catch (terminalPersistenceError) {
        runCompleted = true;
        const persistenceError = new Error(
          "Axon received a correlated execution result but could not persist the terminal run state",
        );
        persistenceError.code = "EXECUTION_RESULT_PERSISTENCE_UNKNOWN";
        persistenceError.cause = terminalPersistenceError;
        throw persistenceError;
      }
      try {
        await publishCommandOutput(jobId, orgId, runId, agentResponse);
      } catch (publishError) {
        jobLogger.warn(
          { err: publishError, runId, attemptId },
          "Execution completed but live output publication failed",
        );
      }
      if (status !== "success") {
        error =
          agentResponse.reasonCode ??
          (Number.isInteger(agentResponse.exitCode)
            ? `Command exited with code ${agentResponse.exitCode}`
            : classification.reasonCode);
      }
    }

    if (sink && sink.type === "mongo" && sink.uri && sink.collectionName) {
      jobLogger.info({ sinkType: sink.type, collection: sink.collectionName }, "Sinking output");
      try {
        const decryptedUri = decrypt(sink.uri);
        const connOpts = sink.databaseName ? { dbName: sink.databaseName } : {};
        const conn = await mongoose.createConnection(decryptedUri, connOpts).asPromise();
        const dataToSink = payload.url ? output.data : output;
        const formats = await buildSinkPayload(dataToSink, sink.exportFormat ?? []);
        await conn.collection(sink.collectionName).updateOne(
          { jobId, fencingToken },
          { $setOnInsert: { jobId, orgId, fencingToken, executedAt: new Date(), formats } },
          { upsert: true },
        );
        await conn.close();
        jobLogger.info({ sinkType: sink.type, collection: sink.collectionName }, "Output sunk successfully");
      } catch (sinkErr) {
        jobLogger.error({ err: sinkErr, sinkType: sink.type, collection: sink.collectionName }, "Sink failed");
      }
    }
  } catch (err) {
    const unknownCodes = new Set([
      "DISPATCH_OUTCOME_UNKNOWN",
      "EXECUTION_OUTCOME_UNKNOWN",
      "EXECUTION_RESULT_UNKNOWN",
      "EXECUTION_STATE_PERSISTENCE_UNKNOWN",
      "EXECUTION_RESULT_PERSISTENCE_UNKNOWN",
    ]);
    reasonCode = unknownCodes.has(err.code)
      ? err.code
      : reasonCode ?? err.code ?? "EXECUTION_FAILED";
    status = unknownCodes.has(reasonCode) ? "unknown" : "failure";
    executionOutcome =
      executionOutcome ?? (status === "unknown" ? "UNKNOWN" : "REJECTED");
    error = err.message;
    if (runId && attemptId && !runCompleted) {
      await completeRun(runId, attemptId, {
        status: status === "unknown" ? "UNKNOWN" : "REJECTED",
        outcome: status === "unknown" ? "UNKNOWN" : "REJECTED",
        reasonCode,
      });
      runCompleted = true;
    }
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
      status === "timeout"
        ? "TIMEOUT"
        : status === "cancelled"
          ? "CANCELLED"
          : status === "success"
            ? "COMPLETED"
            : status === "unknown"
              ? "UNKNOWN"
              : "FAILED";
    await setJobState(jobId, auditStatus);
    const { stdoutSummary, stderrSummary } = getOutputSummaries(output, error);

    await safeUpdateAuditRecord(
      auditId,
      {
        status: auditStatus,
        completedAt: new Date(),
        durationMs: duration,
        exitCode: output?.exitCode ?? (status === "success" ? 0 : null),
        stdoutSummary,
        stderrSummary,
        outcome: executionOutcome ?? undefined,
        reasonCode: reasonCode ?? undefined,
      },
      jobLogger,
    );

    try {
      await jobHistoryModel.create({
        jobId,
        orgId,
        runId: runId ?? null,
        targetExecutionId: targetExecutionId ?? null,
        attemptId: attemptId ?? null,
        operationId: operationId ?? null,
        targetAgentId: targetAgentId ?? null,
        reasonCode,
        status,
        duration,
        executedAt: new Date(),
        exitCode: output?.exitCode ?? (status === "success" ? 0 : null),
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

    if (payload?.command && status !== "success") {
      const terminalError = new UnrecoverableError(
        error || reasonCode || "Shell execution did not succeed",
      );
      terminalError.code = reasonCode || "SHELL_EXECUTION_FAILED";
      terminalError.runId = runId;
      terminalError.attemptId = attemptId;
      throw terminalError;
    }

    return { status, jobId, runId, attemptId, duration };
  } finally {
    await releaseJobLock(jobId, workerId);
  }
};

const shouldStartWorkers = process.env.NODE_ENV !== "test";

export const scheduledWorker = shouldStartWorkers
  ? new Worker("scheduled-jobs", jobProcessor, {
      connection: redisConnection,
      concurrency: 5,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    })
  : null;

export const immediateWorker = shouldStartWorkers
  ? new Worker("immediate-jobs", jobProcessor, {
      connection: redisConnection,
      concurrency: 5,
      stalledInterval: 30_000,
      maxStalledCount: 1,
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
