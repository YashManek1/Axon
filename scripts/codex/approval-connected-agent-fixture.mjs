#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { assertFreshDatabase, invariant, validateDataEndpoints } from "./approval-connected-agent-lib.mjs";

const [manifestPath, statePath, reportPath, mode] = process.argv.slice(2);
invariant(manifestPath && statePath && reportPath, "Usage: node approval-connected-agent-fixture.mjs MANIFEST STATE REPORT");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
invariant(mode === undefined || mode === "--internal", "Unexpected fixture transport flag");
validateDataEndpoints({ mongoUri: process.env.MONGO_URI, redisUri: process.env.REDIS_URI, manifest, allowInternal: mode === "--internal" });
invariant(process.env.JWT_SECRET?.length >= 32, "JWT_SECRET is missing or too short");

const require = createRequire(path.resolve("backend/package.json"));
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const [{ default: Organization }, { default: User }, { default: Agent }, { default: Job }] = await Promise.all([
  import("../../backend/models/organization.js"), import("../../backend/models/user.js"),
  import("../../backend/models/agent.js"), import("../../backend/models/job.js"),
]);

try {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5_000, socketTimeoutMS: 5_000 });
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const counts = {};
  for (const { name } of collections) counts[name] = await mongoose.connection.db.collection(name).countDocuments({}, { maxTimeMS: 5_000 });
  assertFreshDatabase(counts);

  const suffix = manifest.run.slice(-12);
  const apiKey = `approval-agent-${randomUUID()}-${randomUUID()}`;
  const commands = {
    success: "printf 'axon-approval-succeeded\\n'",
    exit7: "printf 'axon-approval-failed\\n'; exit 7",
  };
  const org = await Organization.create({ name: `Approval ${suffix}`, description: "Ephemeral isolated approval acceptance" });
  const user = await User.create({ username: `approval-${suffix}`, email: `approval-${suffix}@example.invalid`, password: randomUUID(), role: "admin", orgId: org._id });
  const agent = await Agent.create({
    name: `approval-agent-${suffix}`, userId: user._id, orgId: org._id, apiKey,
    hardwareUuid: `approval-${manifest.run}`, allowedCommands: Object.values(commands), sandboxMode: "docker",
  });
  const jobFor = (key) => ({
    userId: user._id, orgId: org._id, name: `Approval ${key} ${suffix}`, description: "Ephemeral approval acceptance only",
    type: "shell", schedule: "0 0 1 1 *", payload: { command: commands[key] }, targetAgentId: agent._id,
    timeout: 15, retryLimit: 0, enabled: false, status: "paused", dependsOn: [], webhookUrl: null,
    notifications: { onSuccess: false, onFailure: false, recipients: [] }, executionWindow: { enabled: false },
    sink: { type: null, uri: null, databaseName: null, collectionName: null, exportFormat: [] },
  });
  const jobs = await Job.create([jobFor("success"), jobFor("exit7")]);
  const token = jwt.sign(
    { purpose: "human-session", orgId: org._id.toString(), role: "admin" }, process.env.JWT_SECRET,
    { algorithm: "HS256", audience: "axon-ui", subject: user._id.toString(), expiresIn: "30m" },
  );
  const state = {
    manifest: manifestPath, orgId: org._id.toString(), userId: user._id.toString(), agentId: agent._id.toString(),
    apiKey, token, jobs: { success: jobs[0]._id.toString(), exit7: jobs[1]._id.toString() }, commands,
  };
  await fs.writeFile(statePath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await fs.writeFile(reportPath, `${JSON.stringify({ phase: "fixture-seeded", database: manifest.database, counts: { organizations: 1, users: 1, agents: 1, jobs: 2 }, agentId: state.agentId, jobIds: state.jobs }, null, 2)}\n`, "utf8");
} finally {
  await mongoose.disconnect();
}
