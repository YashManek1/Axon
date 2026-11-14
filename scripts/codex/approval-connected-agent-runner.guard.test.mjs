import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { OWNER_LABEL, RUN_LABEL, fetchJson, validateDataEndpoints } from "./approval-connected-agent-lib.mjs";
import { RUNNER_ROOT, RUNNER_COMMAND, RUNNER_MODULES, RUNNER_BOOTSTRAP, RUNNER_MANIFEST_INSTALL, guardedCopy, sanitizeReport, validateRunner } from "./approval-connected-agent-runner.mjs";

const manifest = { owner: "axon-approval-connected-agent", run: "approval-0123456789abcdef0123456789abcdef", runnerMode: "internal", database: "axon_approval_0123456789abcdef" };
const endpoints = { manifest, allowInternal: true, mongoUri: `mongodb://user:pass@mongodb:27017/${manifest.database}?authSource=admin`, redisUri: "redis://redis:6379/15" };
test("internal data transport requires explicit mode and exact isolated endpoints", () => {
  assert.equal(validateDataEndpoints(endpoints), true);
  const variants = [
    { allowInternal: false }, { manifest: { ...manifest, runnerMode: undefined } },
    ...["localhost", "127.0.0.1", "customer.example"].map(host => ({ mongoUri: endpoints.mongoUri.replace("@mongodb:", `@${host}:`) })),
    { mongoUri: endpoints.mongoUri.replace("27017", "27018") },
    { mongoUri: endpoints.mongoUri.replace(manifest.database, "customer") },
    { mongoUri: endpoints.mongoUri.replace("authSource=admin", "authSource=customer") },
    { mongoUri: `${endpoints.mongoUri}&replicaSet=customer` }, { mongoUri: `${endpoints.mongoUri}#fragment` },
    ...["redis://127.0.0.1:6379/15", "redis://redis:6380/15", "redis://redis:6379/0", "redis://u:p@redis:6379/15", "redis://redis:6379/15?x=1", "redis://redis:6379/15#x"].map(redisUri => ({ redisUri })),
  ];
  for (const variant of variants) assert.throws(() => validateDataEndpoints({ ...endpoints, ...variant }), undefined, JSON.stringify(variant));
});

test("internal HTTP opt-in rejects alternative origins, credentials and fragments before fetch", async () => {
  for (const url of ["http://backend:3000", "http://backend:3001", "http://redis:3000", "http://127.0.0.1:3000", "https://backend:3000", "http://u:p@backend:3000", "http://backend:3000/#x"]) {
    const internal = url !== "http://backend:3000";
    await assert.rejects(fetchJson(url, {}, { allowInternal: internal }));
  }
});

function runner() {
  const expected = { ...manifest, name: "owned-runner", id: "a".repeat(64), image: `sha256:${"b".repeat(64)}`, network: "owned-network", entrypoint: ["docker-entrypoint.sh"], environment: ["NODE_ENV=production", "MONGO_URI=private"] };
  return { expected, inspection: { kind: "container", name: expected.name, id: expected.id, labels: { [OWNER_LABEL]: manifest.owner, [RUN_LABEL]: manifest.run }, raw: {
    Image: expected.image,
    Config: { User: "axon", Cmd: [...RUNNER_COMMAND], Entrypoint: expected.entrypoint, Env: expected.environment, Healthcheck: { Test: ["NONE"] } },
    HostConfig: { RestartPolicy: { Name: "no" }, Privileged: false, IpcMode: "private", PortBindings: {} },
    Mounts: [], NetworkSettings: { Ports: { "3000/tcp": null }, Networks: { [expected.network]: {} } }, State: { Running: true, Restarting: false },
  } } };
}
test("runner accepts only exact inert non-root owned identity and topology", () => {
  const good = runner();
  assert.equal(validateRunner(good.inspection, good.expected), true);
  const mutations = [
    r => { r.id = "c".repeat(64); }, r => { r.name = "replacement"; }, r => { r.labels[OWNER_LABEL] = "other"; }, r => { r.labels[RUN_LABEL] = "other"; },
    r => { r.raw.Image = "other"; }, r => { r.raw.Config.User = "root"; }, r => { r.raw.Config.Cmd = ["node", "server.js"]; },
    r => { r.raw.Config.Entrypoint = ["sh"]; }, r => { r.raw.Config.Env = ["SURPRISE=secret"]; }, r => { r.raw.Config.Healthcheck.Test = ["CMD", "node", "healthcheck.js"]; },
    r => { r.raw.HostConfig.RestartPolicy.Name = "always"; }, r => { r.raw.HostConfig.Privileged = true; }, r => { r.raw.HostConfig.PidMode = "host"; }, r => { r.raw.HostConfig.IpcMode = "host"; },
    r => { r.raw.HostConfig.Binds = ["C:/:/host"]; }, r => { r.raw.HostConfig.VolumesFrom = ["other"]; }, r => { r.raw.Mounts = [{ Destination: "/socket" }]; },
    r => { r.raw.HostConfig.PublishAllPorts = true; }, r => { r.raw.HostConfig.PortBindings = { "3000/tcp": [{}] }; }, r => { r.raw.NetworkSettings.Ports["3000/tcp"] = [{}]; },
    r => { r.raw.NetworkSettings.Networks.external = {}; }, r => { r.raw.State.Running = false; }, r => { r.raw.State.Restarting = true; },
  ];
  for (const mutate of mutations) { const bad = runner(); mutate(bad.inspection); assert.throws(() => validateRunner(bad.inspection, bad.expected)); }
});

test("fixed bootstrap refuses existing files, directories, symlinks and inspection failure", () => {
  for (const failure of [undefined, { code: "EACCES" }]) {
    const calls = [];
    const fake = { lstatSync: () => { if (failure) throw failure; return {}; }, mkdirSync: p => calls.push(p), symlinkSync: p => calls.push(p) };
    assert.throws(() => vm.runInNewContext(RUNNER_BOOTSTRAP, { require: () => fake }));
    assert.deepEqual(calls, []);
  }
  const calls = [];
  const fake = { lstatSync: () => { throw { code: "ENOENT" }; }, mkdirSync: (p, options) => calls.push([p, options]), symlinkSync: (from, to) => calls.push([from, to]) };
  vm.runInNewContext(RUNNER_BOOTSTRAP, { require: () => fake });
  assert.equal(calls[0][0], RUNNER_ROOT); assert.equal(calls[0][1].mode, 0o700);
  assert.deepEqual(calls.slice(1).map(row => row[0]), [`${RUNNER_ROOT}/scripts`, `${RUNNER_ROOT}/scripts/codex`, "/app"]);
  assert.equal(calls[3][1], `${RUNNER_ROOT}/backend`);
});

test("manifest stdin install is exclusive, non-root, private, readable and fingerprinted", () => {
  const bytes = Buffer.from('{"private":"stdin-only"}');
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  function run(options = {}) {
    const writes = [];
    const stat = (directory, overrides = {}) => ({ uid: 1000, mode: directory ? 0o700 : 0o600, isDirectory: () => directory, isFile: () => !directory, isSymbolicLink: () => false, ...overrides });
    const fake = {
      lstatSync: p => stat(p === RUNNER_ROOT, p === RUNNER_ROOT ? options.root : options.file),
      readFileSync: p => {
        if (options.readFailure && p !== 0) throw new Error("unreadable installed file");
        return p === 0 ? (options.input ?? bytes) : (options.output ?? bytes);
      },
      writeFileSync: (p, data, flags) => {
        assert.equal(p, `${RUNNER_ROOT}/manifest.json`); assert.equal(flags.flag, "wx"); assert.equal(flags.mode, 0o600);
        if (options.existing) throw new Error("EEXIST: existing file or symlink");
        writes.push(Buffer.from(data));
      },
    };
    const invoke = () => vm.runInNewContext(RUNNER_MANIFEST_INSTALL, { require: name => name === "node:fs" ? fake : crypto, process: { getuid: () => options.uid ?? 1000, argv: ["node", options.hash ?? hash] } });
    return { writes, invoke };
  }
  const good = run(); good.invoke(); assert.deepEqual(good.writes, [bytes]);
  for (const options of [{ uid: 0 }, { root: { uid: 0 } }, { root: { mode: 0o755 } }, { root: { isSymbolicLink: () => true } }, { root: { isDirectory: () => false } }, { hash: "invalid" }, { input: Buffer.from("changed") }, { input: Buffer.alloc(1048577) }, { existing: true }]) {
    const bad = run(options); assert.throws(bad.invoke); assert.equal(bad.writes.length, 0);
  }
  for (const options of [{ file: { uid: 0 } }, { file: { mode: 0o644 } }, { file: { isSymbolicLink: () => true } }, { file: { isFile: () => false } }, { output: Buffer.from("changed") }, { readFailure: true }]) assert.throws(run(options).invoke);
});

test("copy paths, regular frozen files and immutable revalidation gate every transfer", async () => {
  const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "axon-runner-guard-"));
  try {
    const scriptDir = path.join(privateDir, "scripts"); await fs.mkdir(scriptDir);
    const source = path.join(scriptDir, RUNNER_MODULES[0]); await fs.writeFile(source, "frozen");
    const events = [], sourceHashes = { [RUNNER_MODULES[0]]: crypto.createHash("sha256").update("frozen").digest("hex") };
    const options = { source, destination: `${RUNNER_ROOT}/scripts/codex/${RUNNER_MODULES[0]}`, direction: "in-module", privateDir, scriptDir, sourceHashes, validate: async () => { events.push("validate"); }, copy: async () => { events.push("copy"); } };
    await guardedCopy(options); assert.deepEqual(events, ["validate", "copy"]);
    for (const bad of [{ destination: `${RUNNER_ROOT}/../escape` }, { sourceHashes: {} }, { source: scriptDir }, { direction: "unknown" }]) {
      events.length = 0; await assert.rejects(guardedCopy({ ...options, ...bad })); assert.deepEqual(events, []);
    }
    events.length = 0; await assert.rejects(guardedCopy({ ...options, validate: async () => { throw new Error("replacement identity"); } })); assert.deepEqual(events, []);
    events.length = 0; await assert.rejects(guardedCopy({ ...options, copy: async () => { events.push("copy"); throw new Error("native timeout"); } })); assert.deepEqual(events, ["validate", "copy"]);
    const host = path.join(privateDir, "manifest.json"); await fs.writeFile(host, "private");
    await guardedCopy({ ...options, source: host, destination: `${RUNNER_ROOT}/manifest.json`, direction: "in-private" });
    const otherInput = path.join(privateDir, "state.json"); await fs.writeFile(otherInput, "private"); events.length = 0;
    await assert.rejects(guardedCopy({ ...options, source: otherInput, destination: `${RUNNER_ROOT}/state.json`, direction: "in-private" })); assert.deepEqual(events, []);
    const output = path.join(privateDir, "acceptance.json");
    await guardedCopy({ ...options, source: `${RUNNER_ROOT}/acceptance.json`, destination: output, direction: "out-private" });
    await fs.writeFile(output, "already exists"); events.length = 0;
    await assert.rejects(guardedCopy({ ...options, source: `${RUNNER_ROOT}/acceptance.json`, destination: output, direction: "out-private" })); assert.deepEqual(events, []);
    await fs.unlink(source); await fs.mkdir(source); events.length = 0;
    await assert.rejects(guardedCopy(options)); assert.deepEqual(events, []);
    // A junction is available on Windows without developer-mode symlink permission.
    const linkDir = path.join(privateDir, "linked"); await fs.symlink(scriptDir, linkDir, "junction");
    await assert.rejects(guardedCopy({ ...options, source: linkDir }));
  } finally { await fs.rm(privateDir, { recursive: true, force: true }); }
});

function acceptance() {
  return { phase: "acceptance-complete-awaiting-owned-cleanup", connectedAgentId: "a".repeat(24), connectionGeneration: 1, token: "must-not-export", scenarios: [0, 7].map(exitCode => ({ scenario: exitCode ? "exit7" : "success", previewStatus: 201, approvalStatus: 202, replayStatus: 200, runId: crypto.randomUUID(), status: exitCode ? "FAILED" : "SUCCEEDED", outcome: "COMPLETED", exitCode, attempts: 1, savedGet: true, quietQueue: { waiting: 0, active: 0, delayed: 0, credential: "private" }, duplicateRuns: false, duplicateHistory: false, apiKey: "must-not-export" })) };
}

for (const generation of [1, 2, Number.MAX_SAFE_INTEGER]) {
  test(`acceptance preserves positive safe-integer connection generation ${generation}`, () => {
    const report = JSON.parse(JSON.stringify({ ...acceptance(), connectionGeneration: generation }));
    const sanitized = sanitizeReport(report, "acceptance", manifest);
    assert.equal(sanitized.connectionGeneration, generation);
    assert.equal(typeof sanitized.connectionGeneration, "number");
    assert.throws(() => sanitizeReport({ ...report, connectedAgentId: "secret" }, "acceptance", manifest));
  });
}

const invalidGenerations = [
  ["undefined", undefined], ["null", null], ["true", true], ["false", false],
  ["numeric string", "1"], ["legacy ID string", "b".repeat(32)],
  ["array", [1]], ["object", { value: 1 }], ["zero", 0], ["negative zero", -0],
  ["negative", -1], ["fraction", 1.5], ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ["NaN", NaN], ["positive infinity", Infinity], ["negative infinity", -Infinity],
];
for (const [label, generation] of invalidGenerations) {
  test(`acceptance rejects ${label} connection generation without coercion`, () => {
    assert.throws(() => sanitizeReport({ ...acceptance(), connectionGeneration: generation }, "acceptance", manifest));
  });
}
test("acceptance rejects missing connection generation", () => {
  const report = acceptance();
  delete report.connectionGeneration;
  assert.throws(() => sanitizeReport(report, "acceptance", manifest));
});
test("only enumerated successful evidence fields leave private storage", () => {
  const fixture = { phase: "fixture-seeded", database: manifest.database, agentId: "a".repeat(24), jobIds: { success: "b".repeat(24), exit7: "c".repeat(24) }, counts: { organizations: 1, users: 1, agents: 1, jobs: 2 }, apiKey: "private" };
  assert(!JSON.stringify(sanitizeReport(fixture, "fixture", manifest)).includes("private"));
  for (const change of [{ database: "customer" }, { agentId: "secret@elsewhere" }, { counts: {} }]) assert.throws(() => sanitizeReport({ ...fixture, ...change }, "fixture", manifest));
  const sanitized = JSON.stringify(sanitizeReport(acceptance(), "acceptance", manifest)); assert(!sanitized.includes("private")); assert(!sanitized.includes("must-not-export"));
  for (const change of [{ status: "UNKNOWN" }, { exitCode: 1 }, { attempts: 2 }, { duplicateRuns: true }, { duplicateHistory: true }, { savedGet: false }, { quietQueue: { waiting: 1, active: 0, delayed: 0 } }, { runId: "secret@elsewhere" }]) {
    const report = acceptance(); Object.assign(report.scenarios[0], change); assert.throws(() => sanitizeReport(report, "acceptance", manifest));
  }
  for (const change of [{ phase: "failed" }, { scenarios: [] }, { connectedAgentId: "secret" }]) assert.throws(() => sanitizeReport({ ...acceptance(), ...change }, "acceptance", manifest));
});
