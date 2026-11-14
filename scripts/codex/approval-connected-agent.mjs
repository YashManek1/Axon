#!/usr/bin/env node
import { main } from "./approval-connected-agent-verifier.mjs";

await main(process.argv[2], process.argv[3], process.argv[4]);
/* Retained below only as inert historical source pending repository cleanup.
// Run only against the disposable axon_r204_acceptance database created by the
// companion PowerShell harness. The command is allowlisted and has no sinks.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const req = createRequire(path.resolve("backend/package.json"));
const mongoose = req("mongoose");
const statePath = process.argv[2];
const reportPath = process.argv[3];
if (!statePath || !reportPath) throw new Error("Usage: node approval-connected-agent.mjs STATE REPORT");
const mongo = new URL(process.env.MONGO_URI);
const redis = new URL(process.env.REDIS_URI);
if (mongo.pathname !== "/axon_r204_acceptance" || redis.pathname !== "/15") {
  throw new Error("Refusing non-disposable MongoDB or Redis target");
}
const state = JSON.parse(await fs.readFile(statePath, "utf8"));
const [{ default: JobRun }, { default: JobHistory }, { default: JobRunPreview }, { default: Agent }] = await Promise.all([
  import("../../backend/models/jobRun.js"),
  import("../../backend/models/jobHistory.js"),
  import("../../backend/models/jobRunPreview.js"),
  import("../../backend/models/agent.js"),
]);
const url = process.env.AXON_RUNTIME_URL;
const jobId = state.jobs.success;
const headers = { authorization: `Bearer ${state.token}`, "content-type": "application/json" };
const commandMarker = "axon-r204-success";
async function post(route, body, extraHeaders = {}) {
  const response = await fetch(`${url}${route}`, {
    method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function poll(label, read, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await read();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  const agent = await poll("real connected agent", async () => {
    const current = await Agent.findById(state.agentId).lean();
    return current?.status === "online" && current?.socketId ? current : null;
  });
  const beforeRuns = await JobRun.countDocuments({ jobId });
  const beforeHistories = await JobHistory.countDocuments({ jobId });
  const preview = await post(`/jobs/previewJobRun/${jobId}`, {});
  if (preview.status !== 201 || !preview.body.previewId || !preview.body.previewHash) {
    throw new Error(`Preview rejected: ${JSON.stringify(preview)}`);
  }
  const savedPreview = await JobRunPreview.findOne({ previewId: preview.body.previewId }).lean();
  if (!savedPreview || savedPreview.previewHash !== preview.body.previewHash) throw new Error("Preview was not persisted exactly");
  if (await JobRun.countDocuments({ jobId }) !== beforeRuns ||
      await JobHistory.countDocuments({ jobId }) !== beforeHistories) {
    throw new Error("Preview caused execution side effects");
  }
  const key = randomUUID();
  const approval = { previewId: preview.body.previewId, previewHash: preview.body.previewHash };
  const first = await post(`/jobs/runJobNow/${jobId}`, approval, { "idempotency-key": key });
  if (![200, 202].includes(first.status) || !first.body.runId || first.body.idempotentReplay) {
    throw new Error(`Approval rejected: ${JSON.stringify(first)}`);
  }
  const replay = await post(`/jobs/runJobNow/${jobId}`, approval, { "idempotency-key": key });
  if (replay.status !== 200 || replay.body.runId !== first.body.runId || !replay.body.idempotentReplay) {
    throw new Error(`Approval replay was not idempotent: ${JSON.stringify(replay)}`);
  }
  const run = await poll("terminal approved run", async () => {
    const current = await JobRun.findOne({ runId: first.body.runId }).lean();
    return current?.status === "SUCCEEDED" ? current : null;
  });
  const history = await poll("saved command output", async () => {
    const current = await JobHistory.findOne({ runId: run.runId }).lean();
    return current?.output?.stdout?.includes(commandMarker) ? current : null;
  });
  if (run.attempts?.length !== 1 || run.terminalSummary?.outcome !== "COMPLETED" ||
      run.terminalSummary?.exitCode !== 0 || run.approval?.previewId !== preview.body.previewId ||
      run.approval?.previewHash !== preview.body.previewHash ||
      String(run.targetAgentId) !== String(agent._id)) {
    throw new Error("Persisted run failed exact-target/approval/single-attempt assertions");
  }
  if (await JobRun.countDocuments({ jobId }) !== beforeRuns + 1 ||
      await JobHistory.countDocuments({ runId: run.runId }) !== 1) {
    throw new Error("Duplicate run or history found after replay");
  }
  await fs.writeFile(reportPath, JSON.stringify({
    result: "PASS", previewStatus: preview.status, approvalStatus: first.status,
    replayStatus: replay.status, replaySameRun: true, previewSideEffects: false,
    connectedAgentId: state.agentId, connectionGeneration: agent.connectionGeneration,
    runId: run.runId, status: run.status, attempts: run.attempts.length,
    outcome: run.terminalSummary.outcome, exitCode: run.terminalSummary.exitCode,
    targetMatched: true, approvalIdentityMatched: true, savedOutputMarker: commandMarker,
    duplicateRuns: false, duplicateHistory: false, historyId: String(history._id),
  }, null, 2) + "\n");
  process.stdout.write(`PASS connected approval ${run.runId}\n`);
} finally {
  await mongoose.disconnect();
}
*/
