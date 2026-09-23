#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const req = createRequire(path.resolve("backend/package.json"));
const mongoose = req("mongoose");
const jwt = req("jsonwebtoken");
const terminal = new Set(["SUCCEEDED","FAILED","TIMED_OUT","REJECTED","CANCELLED","UNKNOWN"]);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing --${name}`);
  return process.argv[i + 1];
}
const phase = arg("phase");
const statePath = path.resolve(arg("state"));
const reportPath = path.resolve(arg("report"));
function guard() {
  const mongoDb = new URL(process.env.MONGO_URI).pathname.slice(1);
  const redisDb = new URL(process.env.REDIS_URI).pathname.slice(1) || "0";
  if (mongoDb !== "axon_r204_acceptance") throw new Error(`Unsafe MongoDB database: ${mongoDb}`);
  if (redisDb !== "15") throw new Error(`Unsafe Redis DB: ${redisDb}`);
}
async function loadModels() {
  const files = ["organization","user","agent","job","jobRun","jobHistory","executionTargetHold"];
  const values = await Promise.all(files.map((file) => import(`../../backend/models/${file}.js`)));
  return Object.fromEntries(files.map((file, i) => [file, values[i].default]));
}
const readState = async () => JSON.parse(await fs.readFile(statePath, "utf8"));
const writeState = async (value) => fs.writeFile(statePath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const writeReport = async (value) => fs.writeFile(reportPath, JSON.stringify(value, null, 2) + "\n");
async function poll(label, fn, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function setup(db) {
  await mongoose.connection.dropDatabase();
  const suffix = Date.now().toString(36);
  const apiKey = `r204-agent-${suffix}-0123456789abcdef`;
  const org = await db.organization.create({ name: `R2-04 ${suffix}`, description: "Ephemeral R2-04 runtime acceptance" });
  const user = await db.user.create({
    username: `r204-${suffix}`, email: `r204-${suffix}@example.invalid`,
    password: "not-used", role: "admin", orgId: org._id
  });
  const commands = {
    success: "printf 'axon-r204-success\\n'",
    restart: "sleep 30",
    mismatch: "printf 'axon-r204-mismatch\\n'",
    candidate: "printf 'axon-r204-candidate\\n'",
    rollback: "printf 'axon-r204-rollback\\n'",
    blocked: "printf 'axon-r204-blocked-should-not-run\\n'",
    timeout: "trap '' TERM; (trap '' TERM; while :; do sleep 1; done) & wait"
  };
  const agent = await db.agent.create({
    name: `r204-agent-${suffix}`, userId: user._id, orgId: org._id,
    apiKey, hardwareUuid: `r204-${suffix}`, allowedCommands: Object.values(commands), sandboxMode: "docker"
  });
  const job = (scenario, timeout) => ({
    userId: user._id, orgId: org._id, name: `R2-04 ${scenario}`, type: "shell",
    schedule: "0 0 1 1 *", payload: { command: commands[scenario] },
    targetAgentId: agent._id, timeout, retryLimit: 0, enabled: false
  });
  const jobs = await db.job.create([
    job("success", 10), job("restart", 60), job("mismatch", 10),
    job("candidate", 10), job("rollback", 10), job("timeout", 1), job("blocked", 10)
  ]);
  const jobIds = Object.fromEntries(jobs.map((item) => [item.name.split(" ").at(-1), item._id.toString()]));
  const token = jwt.sign(
    { purpose: "human-session", orgId: org._id.toString(), role: "admin" },
    process.env.JWT_SECRET,
    { algorithm: "HS256", audience: "axon-ui", subject: user._id.toString(), expiresIn: "1h" }
  );
  const state = { agentId: agent._id.toString(), apiKey, token, jobs: jobIds, runs: {}, quiesce: {} };
  await writeState(state);
  return { phase, agentId: state.agentId, fixtureCounts: { organizations: 1, users: 1, agents: 1, jobs: 7 } };
}
async function waitAgent(db, state) {
  const minimum = Number(arg("generation"));
  const agent = await poll(`agent generation ${minimum}`, async () => {
    const item = await db.agent.findById(state.agentId).lean();
    return item?.status === "online" && item?.socketId && Number(item.connectionGeneration) >= minimum ? item : null;
  });
  return { phase, agentId: state.agentId, status: agent.status, connectionGeneration: agent.connectionGeneration, hasSocket: true };
}
function summary(scenario, run) {
  return {
    phase, scenario, runId: run.runId, status: run.status, reasonCode: run.reasonCode ?? null,
    attemptStatus: run.attempts?.[0]?.status ?? null,
    outcome: run.terminalSummary?.outcome ?? run.attempts?.[0]?.outcome ?? null,
    exitCode: run.terminalSummary?.exitCode ?? run.attempts?.[0]?.exitCode ?? null,
    transitionCount: run.transitions?.length ?? 0
  };
}
async function dispatch(db, state) {
  const scenario = arg("scenario");
  const response = await fetch(`${process.env.AXON_RUNTIME_URL}/jobs/runJobNow/${state.jobs[scenario]}`, {
    method: "POST",
    headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json", "idempotency-key": `r204-${scenario}-${Date.now()}` },
    body: "{}"
  });
  const body = await response.json();
  if (response.status !== 200 || !body.runId) throw new Error(`Dispatch failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  state.runs[scenario] = body.runId;
  await writeState(state);
  if (scenario === "restart") {
    const run = await poll("restart acknowledgment", async () => {
      const item = await db.jobRun.findOne({ runId: body.runId }).lean();
      return item?.status === "ACKNOWLEDGED" ? item : null;
    });
    return summary(scenario, run);
  }
  const run = await poll(`${scenario} terminal state`, async () => {
    const item = await db.jobRun.findOne({ runId: body.runId }).lean();
    return terminal.has(item?.status) ? item : null;
  });
  const expectedOutput = {
    success: "axon-r204-success",
    candidate: "axon-r204-candidate",
    rollback: "axon-r204-rollback"
  }[scenario];
  if (expectedOutput) {
    if (run.status !== "SUCCEEDED" || run.terminalSummary?.outcome !== "COMPLETED" || run.terminalSummary?.exitCode !== 0)
      throw new Error(`Unexpected ${scenario} result: ${JSON.stringify(summary(scenario, run))}`);
    await poll(`${scenario} history stdout marker`, async () => {
      const history = await db.jobHistory.findOne({ runId: body.runId }).lean();
      return history?.output?.stdout?.includes(expectedOutput);
    });
  }
  if (scenario === "mismatch" && (run.status !== "REJECTED" || run.reasonCode !== "AGENT_RELEASE_MISMATCH"))
    throw new Error(`Unexpected mismatch result: ${JSON.stringify(summary(scenario, run))}`);
  if (scenario === "timeout" && (run.status !== "TIMED_OUT" || run.terminalSummary?.outcome !== "TIMED_OUT"))
    throw new Error(`Unexpected timeout result: ${JSON.stringify(summary(scenario, run))}`);
  if (scenario === "blocked") {
    if (run.status !== "REJECTED" || run.reasonCode !== "CONCURRENT_TARGET_EXECUTION")
      throw new Error(`Unknown hold failed to block dispatch: ${JSON.stringify(summary(scenario, run))}`);
    const hold = await db.executionTargetHold.findOne({ targetAgentId: state.agentId }).lean();
    if (!hold || hold.runId !== state.runs.restart)
      throw new Error("Restart UNKNOWN hold did not retain its original owner");
    const history = await db.jobHistory.findOne({ runId: body.runId }).lean();
    if (history?.output?.stdout?.includes("axon-r204-blocked-should-not-run"))
      throw new Error("Blocked command unexpectedly executed");
  }
  return summary(scenario, run);
}
async function verifyRestart(db, state) {
  const run = await poll("interrupted terminal state", async () => {
    const item = await db.jobRun.findOne({ runId: state.runs.restart }).lean();
    return terminal.has(item?.status) ? item : null;
  });
  if (run.status !== "UNKNOWN" || run.terminalSummary?.outcome !== "UNKNOWN")
    throw new Error(`Interrupted run did not fail closed: ${JSON.stringify(summary("restart", run))}`);
  if (run.attempts?.length !== 1)
    throw new Error(`Interrupted run was delivered more than once: ${JSON.stringify(summary("restart", run))}`);
  return summary("restart", run);
}
async function reconcileQuiesced(db, state) {
  const checkpoint = arg("scenario");
  const nonterminal = await db.jobRun.find({ status: { $nin: [...terminal] } }, { runId: 1, status: 1 }).lean();
  if (nonterminal.length) throw new Error(`Cannot quiesce with nonterminal runs: ${JSON.stringify(nonterminal)}`);
  const agent = await db.agent.findById(state.agentId).lean();
  if (!agent) throw new Error("Acceptance agent disappeared during reconciliation");
  state.quiesce ??= {};
  state.quiesce[checkpoint] = { connectionGeneration: Number(agent.connectionGeneration ?? 0) };
  await writeState(state);
  return {
    phase, checkpoint, nonterminalRuns: 0,
    reconciledRunCount: await db.jobRun.countDocuments(),
    connectionGeneration: state.quiesce[checkpoint].connectionGeneration
  };
}
async function verifyResume(db, state) {
  const checkpoint = arg("scenario");
  const previous = state.quiesce?.[checkpoint]?.connectionGeneration;
  if (!Number.isInteger(previous)) throw new Error(`Missing quiesce checkpoint ${checkpoint}`);
  const agent = await poll(`agent resume after ${checkpoint}`, async () => {
    const item = await db.agent.findById(state.agentId).lean();
    return item?.status === "online" && item?.socketId ? item : null;
  });
  const current = Number(agent.connectionGeneration ?? 0);
  if (current <= previous) throw new Error(`Connection generation did not increase: ${previous} -> ${current}`);
  return { phase, checkpoint, previousConnectionGeneration: previous, connectionGeneration: current, monotonic: true };
}
async function main() {
  guard();
  await mongoose.connect(process.env.MONGO_URI);
  const db = await loadModels();
  let result;
  if (phase === "setup") result = await setup(db);
  else {
    const state = await readState();
    if (phase === "wait-agent") result = await waitAgent(db, state);
    else if (phase === "dispatch") result = await dispatch(db, state);
    else if (phase === "verify-restart") result = await verifyRestart(db, state);
    else if (phase === "reconcile-quiesced") result = await reconcileQuiesced(db, state);
    else if (phase === "verify-resume") result = await verifyResume(db, state);
    else throw new Error(`Unsupported phase ${phase}`);
  }
  await writeReport({ ...result, verifiedAt: new Date().toISOString() });
  process.stdout.write(JSON.stringify(result) + "\n");
}
main().catch((error) => {
  process.stderr.write((error.stack ?? error.message) + "\n");
  process.exitCode = 1;
}).finally(async () => mongoose.disconnect().catch(() => {}));
