import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register,
} from "prom-client";

collectDefaultMetrics({ register });

// Job metrics
export const jobDispatchDuration = new Histogram({
  name: "axon_job_dispatch_duration_seconds",
  help: "End-to-end job dispatch duration in seconds (includes ack + execute)",
  labelNames: ["status"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [register],
});

export const jobStatusTotal = new Counter({
  name: "axon_job_status_total",
  help: "Total job dispatch outcomes by status label",
  labelNames: ["status"],
  registers: [register],
});

// Agent metrics
export const agentConnected = new Gauge({
  name: "axon_agent_connected",
  help: "Number of currently connected agents",
  registers: [register],
});

export const agentDispatchAckLatency = new Histogram({
  name: "axon_agent_dispatch_ack_latency_seconds",
  help: "Agent dispatch acknowledgement latency in seconds",
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// HTTP metrics
export const httpRequestDuration = new Histogram({
  name: "axon_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: "axon_http_request_total",
  help: "Total HTTP requests by method, route, and status",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

// Queue metrics
export const queueDepth = new Gauge({
  name: "axon_queue_depth",
  help: "BullMQ queue depth by state and queue name",
  labelNames: ["queue", "state"],
  registers: [register],
});

// Audit metrics
export const auditChainVerificationFailures = new Counter({
  name: "axon_audit_chain_verification_failures_total",
  help: "Total audit chain verification failures",
  registers: [register],
});

export { register };
