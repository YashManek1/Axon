import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fetchJson, invariant, TERMINAL, validateDataEndpoints } from "./approval-connected-agent-lib.mjs";

export async function main(statePath, reportPath, mode) {
  invariant(statePath && reportPath, "Usage: node approval-connected-agent.mjs STATE REPORT");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  const manifest = JSON.parse(await fs.readFile(state.manifest, "utf8"));
  invariant(mode === undefined || mode === "--internal", "Unexpected verifier transport flag");
  const allowInternal = mode === "--internal";
  validateDataEndpoints({ mongoUri: process.env.MONGO_URI, redisUri: process.env.REDIS_URI, manifest, allowInternal });
  const runtime = new URL(process.env.AXON_RUNTIME_URL);
  invariant(!runtime.username && !runtime.password && !runtime.search && !runtime.hash && runtime.pathname === "/" && runtime.protocol === "http:" && (allowInternal ? runtime.origin === "http://backend:3000" : runtime.hostname === "127.0.0.1" && Number(runtime.port) === Number(manifest.backendPort)), "Runtime URL must be the exact approved backend");
  const require = createRequire(path.resolve("backend/package.json"));
  const mongoose = require("mongoose");
  const { Queue } = require("bullmq");
  const [{ default: JobRun }, { default: JobHistory }, { default: JobRunPreview }, { default: Agent }] = await Promise.all([
    import("../../backend/models/jobRun.js"), import("../../backend/models/jobHistory.js"),
    import("../../backend/models/jobRunPreview.js"), import("../../backend/models/agent.js"),
  ]);
  const secrets = [state.token, state.apiKey];
  const headers = { authorization: `Bearer ${state.token}`, "content-type": "application/json" };
  const request = (method, route, body, statuses, extra = {}) => fetchJson(`${runtime.origin}${route}`, {
    method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { timeoutMs: 8_000, expectedStatuses: statuses, secrets, allowInternal });
  async function waitFor(label, read, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await read();
      if (value?.status && TERMINAL.has(value.status)) return value;
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  const redis = new URL(process.env.REDIS_URI);
  const queue = new Queue("immediate-jobs", { connection: { host: redis.hostname, port: Number(redis.port), db: 15, maxRetriesPerRequest: 1, retryStrategy: () => null, connectTimeout: 5_000 } });
  const scenarios = [
    { key: "success", status: "SUCCEEDED", history: "success", exitCode: 0, marker: "axon-approval-succeeded" },
    { key: "exit7", status: "FAILED", history: "failure", exitCode: 7, marker: "axon-approval-failed" },
  ];
  const results = [];
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5_000, socketTimeoutMS: 5_000 });
    const agent = await waitFor("connected isolated agent", async () => {
      const current = await Agent.findById(state.agentId).lean();
      return current?.status === "online" && current?.socketId ? current : null;
    });
    for (const expected of scenarios) {
      const jobId = state.jobs[expected.key];
      const baseline = { runs: await JobRun.countDocuments({ jobId }), histories: await JobHistory.countDocuments({ jobId: String(jobId) }) };
      const preview = await request("POST", `/jobs/previewJobRun/${jobId}`, {}, [201]);
      invariant(preview.headers.get("cache-control")?.includes("no-store"), "Preview response must be no-store");
      invariant(preview.body.previewId && preview.body.previewHash, "Preview identity is missing");
      const savedPreview = await JobRunPreview.findOne({ previewId: preview.body.previewId }).lean();
      invariant(savedPreview?.previewHash === preview.body.previewHash, "Preview persistence mismatch");
      invariant(String(savedPreview.orgId) === state.orgId && String(savedPreview.actorId) === state.userId && String(savedPreview.jobId) === jobId, "Preview scope mismatch");
      invariant(await JobRun.countDocuments({ jobId }) === baseline.runs && await JobHistory.countDocuments({ jobId: String(jobId) }) === baseline.histories, "Preview caused run/history side effects");
      const key = randomUUID();
      const approval = { previewId: preview.body.previewId, previewHash: preview.body.previewHash };
      const first = await request("POST", `/jobs/runJobNow/${jobId}`, approval, [200, 202], { "idempotency-key": key });
      invariant(first.body.runId && first.body.idempotentReplay === false, "Fresh approval response is invalid");
      const immediateReplay = await request("POST", `/jobs/runJobNow/${jobId}`, approval, [200], { "idempotency-key": key });
      invariant(immediateReplay.body.runId === first.body.runId && immediateReplay.body.idempotentReplay === true, "Immediate approval replay was not idempotent");
      const run = await waitFor(`${expected.key} terminal run`, async () => {
        const current = await JobRun.findOne({ runId: first.body.runId }).lean();
        return current?.status && TERMINAL.has(current.status) ? current : null;
      });
      invariant(run.status === expected.status, `${expected.key} terminated as ${run.status}, expected ${expected.status}`);
      invariant(run.attempts?.length === 1 && run.terminalSummary?.outcome === "COMPLETED" && run.terminalSummary?.exitCode === expected.exitCode, `${expected.key} terminal/attempt evidence mismatch`);
      invariant(run.approval?.previewId === preview.body.previewId && run.approval?.previewHash === preview.body.previewHash, `${expected.key} approval identity mismatch`);
      invariant(String(run.orgId) === state.orgId && String(run.targetAgentId) === state.agentId && String(run.triggeredBy?.userId) === state.userId, `${expected.key} scope/target mismatch`);
      const history = await waitFor(`${expected.key} saved history`, () => JobHistory.findOne({ runId: run.runId }).lean());
      invariant(history.status === expected.history && history.exitCode === expected.exitCode && history.output?.stdout?.includes(expected.marker), `${expected.key} saved output mismatch`);
      const attempt = run.attempts[0];
      invariant(history.attemptId === attempt.attemptId && history.targetExecutionId === attempt.targetExecutionId && history.operationId === attempt.operationId, `${expected.key} correlation mismatch`);
      invariant(await JobRun.countDocuments({ jobId }) === baseline.runs + 1 && await JobHistory.countDocuments({ runId: run.runId }) === 1, `${expected.key} duplicate run/history before quiet window`);
      const saved = await request("GET", `/jobs/${jobId}/runs/${run.runId}`, undefined, [200]);
      invariant(saved.headers.get("cache-control")?.includes("no-store"), "Saved-run response must be no-store");
      invariant(saved.body.runId === run.runId && saved.body.status === expected.status && saved.body.attempts?.length === 1 && saved.body.terminalSummary?.exitCode === expected.exitCode, `${expected.key} saved GET mismatch`);
      const terminalReplay = await request("POST", `/jobs/runJobNow/${jobId}`, approval, [200], { "idempotency-key": key });
      invariant(terminalReplay.body.runId === run.runId && terminalReplay.body.idempotentReplay === true, `${expected.key} terminal replay mismatch`);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const queueCounts = await queue.getJobCounts("waiting", "active", "delayed");
      invariant(queueCounts.waiting === 0 && queueCounts.active === 0 && queueCounts.delayed === 0, `${expected.key} queue not quiet`);
      invariant(await JobRun.countDocuments({ jobId }) === baseline.runs + 1 && await JobHistory.countDocuments({ runId: run.runId }) === 1, `${expected.key} duplicate run/history after quiet window`);
      results.push({ scenario: expected.key, previewStatus: preview.status, approvalStatus: first.status, replayStatus: immediateReplay.status, runId: run.runId, status: run.status, outcome: run.terminalSummary.outcome, exitCode: run.terminalSummary.exitCode, attempts: 1, savedGet: true, quietQueue: queueCounts, duplicateRuns: false, duplicateHistory: false });
    }
    await fs.writeFile(reportPath, `${JSON.stringify({ phase: "acceptance-complete-awaiting-owned-cleanup", connectedAgentId: state.agentId, connectionGeneration: agent.connectionGeneration, scenarios: results }, null, 2)}\n`, "utf8");
  } finally {
    await queue.close().catch(() => {});
    await mongoose.disconnect();
  }
}
