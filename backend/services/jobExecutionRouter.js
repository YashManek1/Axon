import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { environment } from "../config/environment.js";
import { signDispatch } from "../utils/dispatchSigner.js";
import {
  jobDispatchDuration,
  jobStatusTotal,
  agentDispatchAckLatency,
} from "../metrics.js";

const tracer = trace.getTracer("axon.job-execution");
const ACK_TIMEOUT_MS = 5_000;
const RESULT_GRACE_MS = 1_000;

function createExecutionError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function rejectedDispatch(code, message) {
  const error = createExecutionError(code, message);
  return {
    emitted: false,
    ackPromise: Promise.reject(error),
    resultPromise: Promise.reject(error),
  };
}

const RESPONSE_CORRELATION_FIELDS = [
  "protocolVersion",
  "jobId",
  "targetAgentId",
  "runId",
  "targetExecutionId",
  "attemptId",
  "operationId",
];

function matchesCorrelation(expected, actual) {
  return RESPONSE_CORRELATION_FIELDS.every(
    (field) => String(actual?.[field]) === String(expected[field]),
  );
}

function validateEnvelope(envelope) {
  if (envelope?.protocolVersion !== 2) return "PROTOCOL_V2_REQUIRED";
  for (const field of [
    "orgId",
    "jobId",
    "targetAgentId",
    "runId",
    "targetExecutionId",
    "attemptId",
    "operationId",
  ]) {
    if (!envelope[field]) return "INVALID_DISPATCH_ENVELOPE";
  }
  if (!envelope.command || !envelope.actionVersion) return "INVALID_DISPATCH_ENVELOPE";
  if (
    !Number.isSafeInteger(envelope.timeoutMs) ||
    envelope.timeoutMs < 100 ||
    envelope.timeoutMs > 300_000
  ) {
    return "INVALID_DISPATCH_ENVELOPE";
  }
  if (!Number.isFinite(envelope.startBefore) || envelope.startBefore <= Date.now()) {
    return "START_DEADLINE_EXPIRED";
  }
  if (
    !Number.isSafeInteger(envelope.maxOutputBytes) ||
    envelope.maxOutputBytes <= 0 ||
    envelope.maxOutputBytes > 65_536
  ) {
    return "INVALID_DISPATCH_ENVELOPE";
  }
  return null;
}

export function createJobExecutionRouter(io) {
  function dispatchCommandToAgent(envelope, targetSocketId, expectedAuthGeneration) {
    const validationError = validateEnvelope(envelope);
    if (validationError) return rejectedDispatch(validationError);

    const socket = io.sockets.sockets.get(String(targetSocketId));
    if (!socket || socket.connected === false) {
      return rejectedDispatch("TARGET_AGENT_NOT_CONNECTED");
    }

    const socketOrgId = socket.orgId ?? socket.data?.orgId;
    const protocolVersions = socket.protocolVersions ?? socket.data?.protocolVersions ?? [];
    if (
      socket.clientType !== "agent" ||
      String(socket.agentId) !== String(envelope.targetAgentId) ||
      String(socketOrgId) !== String(envelope.orgId) ||
      !Number.isSafeInteger(expectedAuthGeneration) ||
      Number(socket.authGeneration) !== expectedAuthGeneration
    ) {
      return rejectedDispatch("TARGET_SOCKET_OWNERSHIP_CHANGED");
    }
    if (!Array.isArray(protocolVersions) || !protocolVersions.includes(2)) {
      return rejectedDispatch(
        "AGENT_PROTOCOL_UNSUPPORTED",
        "The selected agent must be upgraded to execution protocol v2",
      );
    }

    const dispatchSpan = tracer.startSpan("job.dispatch", {
      attributes: {
        "job.id": envelope.jobId,
        "run.id": envelope.runId,
        "attempt.id": envelope.attemptId,
        "agent.id": envelope.targetAgentId,
        "org.id": envelope.orgId,
      },
    });
    const dispatchCtx = trace.setSpan(context.active(), dispatchSpan);
    const dispatchStartMs = Date.now();
    let executeSpan;
    let ackSettled = false;
    let resultSettled = false;
    let ackResolve;
    let ackReject;
    let resultResolve;
    let resultReject;
    let ackTimeoutId;
    let resultTimeoutId;

    const ackPromise = new Promise((resolve, reject) => {
      ackResolve = resolve;
      ackReject = reject;
    });
    const resultPromise = new Promise((resolve, reject) => {
      resultResolve = resolve;
      resultReject = reject;
    });

    function cleanup() {
      socket.off("job_ack", onAck);
      socket.off("command_result", onResult);
      socket.off("disconnect", onDisconnect);
      clearTimeout(ackTimeoutId);
      clearTimeout(resultTimeoutId);
    }

    function startExecutionSpan() {
      if (!executeSpan) {
        executeSpan = tracer.startSpan("job.execute", {}, dispatchCtx);
      }
      if (!resultTimeoutId) {
        resultTimeoutId = setTimeout(() => {
          settleResult(
            resultReject,
            createExecutionError(
              "EXECUTION_RESULT_UNKNOWN",
              "The execution deadline passed without a correlated result",
            ),
          );
        }, envelope.timeoutMs + RESULT_GRACE_MS);
      }
    }

    function settleAck(fn, value) {
      if (ackSettled) return;
      ackSettled = true;
      clearTimeout(ackTimeoutId);
      socket.off("job_ack", onAck);
      fn(value);
    }

    function settleResult(fn, value) {
      if (resultSettled) return;
      resultSettled = true;
      cleanup();
      const status =
        fn === resultResolve ? "completed" : (value?.code?.toLowerCase() ?? "failed");
      if (executeSpan) {
        if (fn === resultReject) {
          executeSpan.setStatus({ code: SpanStatusCode.ERROR, message: value?.message });
        }
        executeSpan.end();
      }
      if (fn === resultReject) {
        dispatchSpan.setStatus({ code: SpanStatusCode.ERROR, message: value?.message });
      }
      dispatchSpan.end();
      jobDispatchDuration.observe({ status }, (Date.now() - dispatchStartMs) / 1000);
      jobStatusTotal.inc({ status });
      fn(value);
    }

    function acceptAcknowledgment(data) {
      if (!ackSettled) {
        agentDispatchAckLatency.observe((Date.now() - dispatchStartMs) / 1000);
        startExecutionSpan();
        settleAck(ackResolve, data);
      }
    }

    function onAck(data) {
      if (!matchesCorrelation(envelope, data)) return;
      acceptAcknowledgment(data);
    }

    function onResult(data) {
      if (!matchesCorrelation(envelope, data)) return;
      // A correlated result proves receipt even when the separate ack was lost.
      acceptAcknowledgment(data);
      settleResult(resultResolve, data);
    }

    function onDisconnect() {
      const error = createExecutionError(
        "EXECUTION_OUTCOME_UNKNOWN",
        "The selected agent disconnected before a correlated result was received",
      );
      settleAck(ackReject, error);
      settleResult(resultReject, error);
    }

    socket.on("job_ack", onAck);
    socket.on("command_result", onResult);
    socket.on("disconnect", onDisconnect);
    ackTimeoutId = setTimeout(() => {
      const error = createExecutionError(
        "DISPATCH_OUTCOME_UNKNOWN",
        "No correlated acknowledgment or result was received",
      );
      settleAck(ackReject, error);
      settleResult(resultReject, error);
    }, ACK_TIMEOUT_MS);

    const { nonce, ts, sig } = signDispatch(environment.DISPATCH_SIGNING_KEY, envelope);
    const signedEnvelope = { ...envelope, nonce, ts, sig };
    try {
      socket.emit("execute_command", signedEnvelope);
    } catch (error) {
      const dispatchError = createExecutionError("DISPATCH_EMIT_FAILED", error.message);
      settleAck(ackReject, dispatchError);
      settleResult(resultReject, dispatchError);
      return { emitted: false, ackPromise, resultPromise };
    }

    return { emitted: true, ackPromise, resultPromise };
  }

  return { dispatchCommandToAgent };
}

let configuredRouter;

export function configureJobExecutionRouter(io) {
  configuredRouter = createJobExecutionRouter(io);
  return configuredRouter;
}

export function dispatchCommandToAgent(envelope, targetSocketId, expectedAuthGeneration) {
  if (!configuredRouter) {
    return rejectedDispatch("JOB_EXECUTION_ROUTER_NOT_CONFIGURED");
  }
  return configuredRouter.dispatchCommandToAgent(
    envelope,
    targetSocketId,
    expectedAuthGeneration,
  );
}
