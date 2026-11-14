#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OWNER_LABEL, RUN_LABEL, assertNoPreexisting, assertPrivateTempDirectory,
  cleanupOwnedResources, invariant, makeNonce, redact, runNative,
  validateEffectiveCompose, validateOwnedInspection, inspectDockerResource, cleanupNestedResources, buildHarnessEnvironment, validateAgentAndContinue, runHarnessLifecycle, launchOwnedAgent,
} from "./approval-connected-agent-lib.mjs";
import { RUNNER_ROOT, RUNNER_COMMAND, RUNNER_MODULES, RUNNER_BOOTSTRAP, RUNNER_MANIFEST_INSTALL, guardedCopy, sanitizeReport, validateRunner } from "./approval-connected-agent-runner.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const evidenceRoot = path.join(repoRoot, ".codex", "evidence", "connected-agent-20261004");
const composeFile = path.join(scriptDir, "approval-connected-agent-compose.yml");
const context = "desktop-linux";
const owner = "axon-approval-connected-agent";
const nonce = makeNonce();
const short = nonce.slice(0, 16);
const run = `approval-${nonce}`;
const project = `axonapproval${short}`;
const names = {
  mongoContainer: `${project}-mongodb`, redisContainer: `${project}-redis`, backendContainer: `${project}-backend`,
  agentContainer: `${project}-agent`, runnerContainer: `${project}-runner`, mongoVolume: `${project}-mongodb`, mongoConfigVolume: `${project}-mongodb-config`, redisVolume: `${project}-redis`,
  journalVolume: `${project}-journal`, network: `${project}-network`,
  backendImage: `axon-backend-approval:${nonce}`, agentImage: `axon-agent-approval:${nonce}`,
};
const database = `axon_approval_${short}`;
const releaseId = `approval-${short}`;
const ledgerPath = path.join(evidenceRoot, `cleanup-ledger-${run}.json`);
const fixtureReport = path.join(evidenceRoot, `fixture-${run}.json`);
const acceptanceReport = path.join(evidenceRoot, `runtime-acceptance-${run}.json`);
const runtimeReport = path.join(evidenceRoot, `runtime-${run}.json`);
const baseEnv = buildHarnessEnvironment();
const docker = (args, options = {}) => runNative("docker", ["--context", context, ...args], { cwd: repoRoot, env: baseEnv, timeoutMs: 30_000, ...options });

async function writePrivate(file, value) {
  await fs.writeFile(file, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await fs.chmod(file, 0o600).catch(() => {});
}

async function inspectOne(kind, name, allowMissing = false) {
  return inspectDockerResource(docker, kind, name, allowMissing);
}

async function saveLedger(manifest) {
  const safe = { ...manifest, updatedAt: new Date().toISOString() };
  await fs.writeFile(ledgerPath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function captureSourceState() {
  const files = [
    "approval-connected-agent.ps1", "approval-connected-agent.mjs", "approval-connected-agent-lib.mjs",
    "approval-connected-agent-orchestrator.mjs", "approval-connected-agent-verifier.mjs",
    "approval-connected-agent-fixture.mjs", "approval-connected-agent-compose.yml", "approval-connected-agent-runner.mjs",
    "approval-connected-agent.guard.test.mjs", "approval-connected-agent-runner.guard.test.mjs",
  ];
  const commit = (await runNative("git", ["rev-parse", "HEAD"], { cwd: repoRoot, env: baseEnv })).stdout.trim();
  const status = (await runNative("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repoRoot, env: baseEnv })).stdout;
  return {
    commit,
    dirty: status.length > 0,
    dirtyEntryCount: status.split(/\r?\n/).filter(Boolean).length,
    statusSha256: crypto.createHash("sha256").update(status).digest("hex"),
    harnessSha256: Object.fromEntries(await Promise.all(files.map(async (name) => [name, await sha256(path.join(scriptDir, name))]))),
  };
}

async function discoverOwned(manifest) {
  const found = [];
  const commands = [
    ["container", ["container", "ls", "--all", "--quiet"]],
    ["volume", ["volume", "ls", "--quiet"]],
    ["network", ["network", "ls", "--quiet"]],
    ["image", ["image", "ls", "--all", "--quiet", "--no-trunc"]],
  ];
  for (const [kind, args] of commands) {
    const result = await docker([...args, "--filter", `label=${OWNER_LABEL}=${manifest.owner}`, "--filter", `label=${RUN_LABEL}=${manifest.run}`]);
    const refs = [...new Set(result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
    for (const ref of refs) {
      const inspection = await inspectOne(kind, ref);
      if (kind === "image") {
        for (const tag of inspection.raw.RepoTags ?? []) {
          if (manifest.attempted.some((entry) => entry.kind === "image" && entry.name === tag)) found.push({ ...inspection, name: tag, ref: tag });
        }
      } else found.push(inspection);
    }
  }
  return found;
}

async function cleanupAdapter(manifest) {
  return {
    discover: () => discoverOwned(manifest),
    remove: (resource) => docker(resource.kind === "container" ? ["container", "rm", "--force", resource.rawId]
      : resource.kind === "image" ? ["image", "rm", resource.ref]
      : [resource.kind, "rm", resource.name], { timeoutMs: 30_000 }),
    exists: (entry) => inspectOne(entry.kind, entry.name, true),
  };
}

async function recordCreated(manifest, kind, name) {
  const inspected = await inspectOne(kind, name);
  validateOwnedInspection(inspected, { owner: manifest.owner, run: manifest.run, name });
  const entry = manifest.attempted.find((item) => item.kind === kind && item.name === name);
  invariant(entry, `Created resource was not declared before mutation: ${kind}:${name}`);
  entry.id = inspected.id;
  await saveLedger(manifest);
  return inspected;
}

async function reconcileAttempted(manifest) {
  const failures = [];
  for (const entry of manifest.attempted.filter((item) => !item.id)) {
    try {
      const inspected = await inspectOne(entry.kind, entry.name, true);
      if (!inspected) continue;
      validateOwnedInspection(inspected, { owner: manifest.owner, run: manifest.run, name: entry.name });
      entry.id = inspected.id;
    } catch (error) {
      failures.push(`${entry.kind}:${entry.name}:${redact(error.message)}`);
    }
  }
  await saveLedger(manifest);
  return failures;
}

function normalizePorts(bindings) {
  return Object.entries(bindings ?? {}).flatMap(([target, values]) => (values ?? []).map((value) => ({
    target, hostIp: value.HostIp, hostPort: Number(value.HostPort),
  })));
}

function normalizeMounts(mounts) {
  return (mounts ?? []).map((mount) => mount.Type === "volume"
    ? { type: mount.Type, name: mount.Name, target: mount.Destination }
    : { type: mount.Type, source: mount.Source, target: mount.Destination })
    .sort((left, right) => left.target.localeCompare(right.target));
}

function validateRuntimeContainer(inspection, expected) {
  validateOwnedInspection(inspection, { owner, run, name: expected.name });
  invariant(inspection.id === manifest.attempted.find(entry => entry.name === expected.name)?.id, "Runtime container immutable ID mismatch");
  invariant(inspection.raw.HostConfig?.Privileged !== true, `${expected.name} is privileged at runtime`);
  const networks = Object.keys(inspection.raw.NetworkSettings?.Networks ?? {});
  invariant(networks.length === 1 && networks[0] === names.network, `${expected.name} runtime network mismatch`);
  const ports = normalizePorts(inspection.raw.NetworkSettings?.Ports);
  invariant(ports.length === 0 && !inspection.raw.HostConfig?.PublishAllPorts && !Object.keys(inspection.raw.HostConfig?.PortBindings ?? {}).length, `${expected.name} must publish no ports`);
  const mounts = normalizeMounts(inspection.raw.Mounts);
  invariant(JSON.stringify(mounts) === JSON.stringify(expected.mounts), `${expected.name} runtime mounts mismatch`);
}

async function validateRuntimeTopology() {
  const mongo = await inspectOne("container", names.mongoContainer);
  const redis = await inspectOne("container", names.redisContainer);
  const backend = await inspectOne("container", names.backendContainer);
  validateRuntimeContainer(mongo, { name: names.mongoContainer, mounts: [{ type: "volume", name: names.mongoConfigVolume, target: "/data/configdb" }, { type: "volume", name: names.mongoVolume, target: "/data/db" }] });
  validateRuntimeContainer(redis, { name: names.redisContainer, mounts: [{ type: "volume", name: names.redisVolume, target: "/data" }] });
  validateRuntimeContainer(backend, { name: names.backendContainer, mounts: [] });
  const network = await inspectOne("network", names.network);
  invariant(network.raw.Internal === true && network.raw.Driver === "bridge", "Runtime approval network must be an internal bridge");
  invariant(network.id === manifest.attempted.find(entry => entry.name === names.network)?.id, "Runtime network immutable ID mismatch");
}

async function cleanupNested(manifest, state) {
  const filters = ["--filter", "label=com.axon.managed=true", "--filter", `label=com.axon.agent-id=${state?.agentId}`, "--filter", `label=com.axon.release-id=${manifest.releaseId}`];
  return cleanupNestedResources(manifest, state, {
    producerNames: [names.agentContainer, names.backendContainer, names.runnerContainer], agentName: names.agentContainer,
    inspect: (ref, allowMissing) => inspectOne("container", ref, allowMissing),
    stop: id => docker(["container", "stop", "--time", "5", id]),
    discover: async () => (await docker(["container", "ls", "--all", "--quiet", ...filters])).stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    save: () => saveLedger(manifest),
    remove: id => docker(["container", "rm", "--force", id]),
  });
}

// Fail before private fixtures or resource planning if CLI plugin discovery fails.
await docker(["compose", "version"], { timeoutMs: 20_000 });
const sourceState = await captureSourceState();
await fs.mkdir(evidenceRoot, { recursive: true });
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "axon-approval-"));
await assertPrivateTempDirectory(tempDir);
const secrets = {
  mongoUser: `axon_${short}`, mongoPassword: makeNonce(), jwt: `${makeNonce()}${makeNonce()}`,
  encryption: `${makeNonce()}${makeNonce()}`, signing: `${makeNonce()}${makeNonce()}`, prometheus: makeNonce(),
};
const envFile = path.join(tempDir, "compose.env");
const agentEnvFile = path.join(tempDir, "agent.env");
const runnerEnvFile = path.join(tempDir, "runner.env");
const privateManifest = path.join(tempDir, "manifest.json");
const statePath = path.join(tempDir, "state.json");
const manifest = {
  schemaVersion: 1, owner, run, nonce, context, project, database, releaseId, runnerMode: "internal",
  names, attempted: [], sourceState, createdAt: new Date().toISOString(), phase: "preflight",
};
const composeEnv = {
  COMPOSE_PROJECT_NAME: project, AXON_APPROVAL_OWNER: owner, AXON_APPROVAL_RUN: run,
  MONGO_USERNAME: secrets.mongoUser, MONGO_PASSWORD: secrets.mongoPassword, MONGO_DATABASE: database,
  MONGO_CONTAINER: names.mongoContainer, REDIS_CONTAINER: names.redisContainer, BACKEND_CONTAINER: names.backendContainer,
  MONGO_VOLUME: names.mongoVolume, MONGO_CONFIG_VOLUME: names.mongoConfigVolume, REDIS_VOLUME: names.redisVolume, APPROVAL_NETWORK: names.network,
  BACKEND_IMAGE: names.backendImage, AXON_RELEASE_ID: releaseId, JWT_SECRET: secrets.jwt,
  ENCRYPTION_KEY: secrets.encryption, DISPATCH_SIGNING_KEY: secrets.signing, PROMETHEUS_BEARER_TOKEN: secrets.prometheus,
};
await writePrivate(envFile, `${Object.entries(composeEnv).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
await saveLedger(manifest);
const composeArgs = ["compose", "--file", composeFile, "--project-name", project, "--project-directory", repoRoot, "--env-file", envFile];
let state = null;
let runnerExpected;
let mountDiagnostic = null;
const getSecrets = () => [state?.token, state?.apiKey, ...Object.values(secrets)].filter(Boolean);
const validateCurrentRunner = async () => {
  invariant(runnerExpected, "Runner identity is not recorded");
  validateRunner(await inspectOne("container", runnerExpected.id), runnerExpected);
};
const execRunner = async (args, timeoutMs = 30_000) => {
  await validateCurrentRunner();
  return docker(["container", "exec", "--workdir", RUNNER_ROOT, runnerExpected.id, ...args], { timeoutMs, secrets: [state?.token, state?.apiKey, ...Object.values(secrets)].filter(Boolean) });
};
const copyRunner = async (source, destination, direction) => guardedCopy({
  source, destination, direction, privateDir: tempDir, scriptDir, sourceHashes: sourceState.harnessSha256,
  validate: validateCurrentRunner,
  copy: async () => {
    if (direction === "in-private") {
      const input = await fs.readFile(source);
      const hash = crypto.createHash("sha256").update(input).digest("hex");
      await validateCurrentRunner();
      return docker(["container", "exec", "--interactive", "--workdir", RUNNER_ROOT, runnerExpected.id, "node", "-e", RUNNER_MANIFEST_INSTALL, hash], { input, secrets: Object.values(secrets) });
    }
    return docker(["container", "cp", direction === "out-private" ? `${runnerExpected.id}:${source}` : source,
      direction === "out-private" ? destination : `${runnerExpected.id}:${destination}`], { secrets: Object.values(secrets) });
  },
});
let nestedCleanup = { ok: true, deleted: [], failures: [] };
let ownedCleanup = { ok: false, deleted: [], outside: [], failures: ["cleanup-not-run"] };
const addAttempted = async (...items) => { manifest.attempted.push(...items); await saveLedger(manifest); };
const lifecycle = await runHarnessLifecycle({ getSecrets, work: async () => {
  const configResult = await docker([...composeArgs, "config", "--format", "json"], { timeoutMs: 30_000, secrets: Object.values(secrets) });
  validateEffectiveCompose(JSON.parse(configResult.stdout), { owner, run, runnerMode: "internal", backendImage: names.backendImage, volumeNames: { "approval-mongodb": names.mongoVolume, "approval-mongodb-config": names.mongoConfigVolume, "approval-redis": names.redisVolume } });
  const contextInspection = JSON.parse((await runNative("docker", ["context", "inspect", context], { cwd: repoRoot, env: baseEnv, timeoutMs: 20_000 })).stdout)?.[0];
  const daemonEndpoint = contextInspection?.Endpoints?.docker?.Host;
  const daemonEndpointScheme = typeof daemonEndpoint === "string" ? daemonEndpoint.split(":", 1)[0].toLowerCase() : "";
  invariant(["npipe", "unix"].includes(daemonEndpointScheme), "Harness refuses remote or unrecognized Docker daemon endpoints");
  manifest.daemonEndpointScheme = daemonEndpointScheme;
  const info = JSON.parse((await docker(["info", "--format", "{{json .}}"], { timeoutMs: 20_000 })).stdout);
  invariant(info.ID && String(info.OSType).toLowerCase() === "linux", "Harness requires an identified Linux Docker daemon");
  manifest.daemonId = info.ID;
  manifest.daemonOs = info.OSType;
  invariant(contextInspection?.Name === context && daemonEndpoint === "npipe:////./pipe/dockerDesktopLinuxEngine", "Harness Desktop endpoint differs from the reviewed local endpoint");
  manifest.preflight = { context: contextInspection.Name, endpoint: daemonEndpoint, os: info.OSType, daemonId: info.ID };
  const requiredImages = ["mongo:7", "redis:7-alpine", "alpine:3.19", "node:22-alpine", "rust:1.86-alpine"];
  manifest.requiredImages = {};
  for (const image of requiredImages) {
    const inspected = await inspectOne("image", image, true);
    invariant(inspected, `Required local image is missing: ${image}`);
    manifest.requiredImages[image] = inspected.id;
  }
  await saveLedger(manifest);
  const alpine = await inspectOne("image", "alpine:3.19");
  invariant((alpine.raw.RepoDigests ?? []).includes("alpine@sha256:6baf43584bcb78f2e5847d1de515f23499913ac9f12bdf834811a3145eb11ca1"), "alpine:3.19 immutable digest mismatch");
  manifest.sandboxImage = "alpine@sha256:6baf43584bcb78f2e5847d1de515f23499913ac9f12bdf834811a3145eb11ca1";
  const planned = [
    ["container", names.mongoContainer], ["container", names.redisContainer], ["container", names.backendContainer], ["container", names.agentContainer], ["container", names.runnerContainer],
    ["volume", names.mongoVolume], ["volume", names.mongoConfigVolume], ["volume", names.redisVolume], ["volume", names.journalVolume], ["network", names.network],
    ["image", names.backendImage], ["image", names.agentImage],
  ];
  const preexisting = [];
  for (const [kind, name] of planned) preexisting.push({ kind, name, present: Boolean(await inspectOne(kind, name, true)) });
  assertNoPreexisting(preexisting);

  manifest.phase = "building";
  await addAttempted({ kind: "image", name: names.backendImage });
  await docker(["build", "--pull=false", "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`, "--tag", names.backendImage, path.join(repoRoot, "backend")], { timeoutMs: 900_000 });
  const backendImage = await recordCreated(manifest, "image", names.backendImage);
  invariant(!Object.keys(backendImage.raw.Config?.Volumes ?? {}).length, "Runner image must not declare volumes");
  await addAttempted({ kind: "image", name: names.agentImage });
  await docker(["build", "--pull=false", "--target", "runtime", "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`, "--tag", names.agentImage, path.join(repoRoot, "agent")], { timeoutMs: 1_200_000 });
  await recordCreated(manifest, "image", names.agentImage);

  manifest.phase = "starting-compose";
  await addAttempted(
    { kind: "container", name: names.mongoContainer }, { kind: "container", name: names.redisContainer }, { kind: "container", name: names.backendContainer },
    { kind: "volume", name: names.mongoVolume }, { kind: "volume", name: names.mongoConfigVolume }, { kind: "volume", name: names.redisVolume }, { kind: "network", name: names.network },
  );
  await docker([...composeArgs, "up", "--detach", "--wait", "--pull", "never", "mongodb", "redis", "backend"], { timeoutMs: 180_000, secrets: Object.values(secrets) });
  for (const [kind, name] of [
    ["container", names.mongoContainer], ["container", names.redisContainer], ["container", names.backendContainer],
    ["volume", names.mongoVolume], ["volume", names.mongoConfigVolume], ["volume", names.redisVolume], ["network", names.network],
  ]) await recordCreated(manifest, kind, name);
  await validateRuntimeTopology();
  const runnerEnvironment = {
    MONGO_URI: `mongodb://${encodeURIComponent(secrets.mongoUser)}:${encodeURIComponent(secrets.mongoPassword)}@mongodb:27017/${database}?authSource=admin`,
    REDIS_URI: "redis://redis:6379/15", JWT_SECRET: secrets.jwt, AXON_RUNTIME_URL: "http://backend:3000",
  };
  await writePrivate(runnerEnvFile, Object.entries(runnerEnvironment).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  await addAttempted({ kind: "container", name: names.runnerContainer });
  await docker(["container", "run", "--detach", "--name", names.runnerContainer, "--network", names.network, "--user", "axon",
    "--no-healthcheck", "--restart", "no", "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`,
    "--env-file", runnerEnvFile, backendImage.raw.Id, ...RUNNER_COMMAND], { secrets: Object.values(secrets) });
  const runner = await recordCreated(manifest, "container", names.runnerContainer);
  const inheritedEnvironment = Object.fromEntries((backendImage.raw.Config.Env ?? []).map(row => { const at = row.indexOf("="); return [row.slice(0, at), row.slice(at + 1)]; }));
  runnerExpected = { owner, run, name: names.runnerContainer, id: runner.id, image: backendImage.raw.Id, network: names.network,
    entrypoint: backendImage.raw.Config.Entrypoint, environment: Object.entries({ ...inheritedEnvironment, ...runnerEnvironment }).map(([key, value]) => `${key}=${value}`) };
  await validateCurrentRunner();
  // Bootstrap before setting exec cwd: that directory intentionally does not exist yet.
  await docker(["container", "exec", runnerExpected.id, "node", "-e", RUNNER_BOOTSTRAP], { secrets: Object.values(secrets) });
  for (const moduleName of RUNNER_MODULES) await copyRunner(path.join(scriptDir, moduleName), `${RUNNER_ROOT}/scripts/codex/${moduleName}`, "in-module");
  // Verify bytes after the native copies as well as immediately before each one.
  await execRunner(["node", "-e", `const fs=require('node:fs'),crypto=require('node:crypto');for(const [name,hash] of Object.entries(JSON.parse(process.argv[1]))){const file='/tmp/axon-harness/scripts/codex/'+name;const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Frozen module copy mismatch')}`,
    JSON.stringify(Object.fromEntries(RUNNER_MODULES.map(name => [name, sourceState.harnessSha256[name]])))]);
  await writePrivate(privateManifest, JSON.stringify(manifest));
  await copyRunner(privateManifest, `${RUNNER_ROOT}/manifest.json`, "in-private");
  await execRunner(["node", "scripts/codex/approval-connected-agent-fixture.mjs", `${RUNNER_ROOT}/manifest.json`, `${RUNNER_ROOT}/state.json`, `${RUNNER_ROOT}/fixture.json`, "--internal"]);
  await copyRunner(`${RUNNER_ROOT}/state.json`, statePath, "out-private");
  const privateFixtureReport = path.join(tempDir, "fixture.json");
  await copyRunner(`${RUNNER_ROOT}/fixture.json`, privateFixtureReport, "out-private");
  const safeFixture = sanitizeReport(JSON.parse(await fs.readFile(privateFixtureReport, "utf8")), "fixture", manifest);
  await fs.writeFile(fixtureReport, JSON.stringify(safeFixture, null, 2) + "\n");
  state = JSON.parse(await fs.readFile(statePath, "utf8"));
  invariant(state.manifest === `${RUNNER_ROOT}/manifest.json` && state.agentId === safeFixture.agentId && state.jobs?.success === safeFixture.jobIds.success && state.jobs?.exit7 === safeFixture.jobIds.exit7 && typeof state.token === "string" && typeof state.apiKey === "string", "Private fixture state mismatch");
  await writePrivate(agentEnvFile, [
    "SERVER_URL=http://backend:3000", `AGENT_ID=${state.agentId}`, `AGENT_API_KEY=${state.apiKey}`,
    `DISPATCH_SIGNING_KEY=${secrets.signing}`, `AXON_RELEASE_ID=${releaseId}`, "AXON_AGENT_JOURNAL_DIR=/var/lib/axon/journal",
    "AGENT_SANDBOX_MODE=docker", `AGENT_SANDBOX_DOCKER_IMAGE=${manifest.sandboxImage}`,
  ].join("\n") + "\n");
  await addAttempted({ kind: "volume", name: names.journalVolume });
  await docker(["volume", "create", "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`, names.journalVolume]);
  await recordCreated(manifest, "volume", names.journalVolume);
  await addAttempted({ kind: "container", name: names.agentContainer });
  await launchOwnedAgent({ owner, run, name: names.agentContainer, network: names.network, journalVolume: names.journalVolume, envFile: agentEnvFile, image: names.agentImage }, {
    recordIntent: async intent => { manifest.agentLaunchIntent = intent; await saveLedger(manifest); },
    docker: args => docker(args, { timeoutMs: 30_000, secrets: [state.apiKey, ...Object.values(secrets)] }),
  });
  await recordCreated(manifest, "container", names.agentContainer);
  await validateAgentAndContinue(await inspectOne("container", names.agentContainer), {
    owner, run, name: names.agentContainer,
    id: manifest.attempted.find(entry => entry.kind === "container" && entry.name === names.agentContainer)?.id,
    journalVolume: names.journalVolume, network: names.network, daemonId: manifest.daemonId,
    launchIntent: manifest.agentLaunchIntent, preflight: manifest.preflight,
  }, {
    secrets: getSecrets(), onDiagnostic: diagnostic => { mountDiagnostic = diagnostic; },
    readDaemon: async agentIdentity => (await docker(["container", "exec", agentIdentity, "docker", "info", "--format", "{{.ID}}"], { timeoutMs: 20_000, secrets: getSecrets() })).stdout.trim(),
    verify: async () => {
      manifest.phase = "acceptance";
      await saveLedger(manifest);
      await execRunner(["node", "scripts/codex/approval-connected-agent.mjs", `${RUNNER_ROOT}/state.json`, `${RUNNER_ROOT}/acceptance.json`, "--internal"], 180_000);
      const privateAcceptanceReport = path.join(tempDir, "acceptance.json");
      await copyRunner(`${RUNNER_ROOT}/acceptance.json`, privateAcceptanceReport, "out-private");
      const safeAcceptance = sanitizeReport(JSON.parse(await fs.readFile(privateAcceptanceReport, "utf8")), "acceptance", manifest);
      invariant(safeAcceptance.connectedAgentId === state.agentId, "Acceptance agent differs from fixture");
      await fs.writeFile(acceptanceReport, JSON.stringify(safeAcceptance, null, 2) + "\n");
      manifest.phase = "acceptance-complete";
    },
  });
}, cleanup: async workError => {
  if (workError) manifest.phase = "failed";
  let reconciliationFailures = [];
  try { reconciliationFailures = await reconcileAttempted(manifest); } catch (error) { reconciliationFailures = [`reconcile:${redact(error.message)}`]; }
  try { nestedCleanup = await cleanupNested(manifest, state); } catch (error) { nestedCleanup = { ok: false, deleted: [], failures: [redact(error.message)] }; }
  try { ownedCleanup = await cleanupOwnedResources(manifest, await cleanupAdapter(manifest)); } catch (error) { ownedCleanup = { ok: false, deleted: [], outside: [], failures: [redact(error.message)] }; }
  if (reconciliationFailures.length) {
    ownedCleanup.ok = false;
    ownedCleanup.failures ??= [];
    ownedCleanup.failures.push(...reconciliationFailures);
  }
  try {
    const safeTemp = await assertPrivateTempDirectory(tempDir);
    await fs.rm(safeTemp, { recursive: true, force: true });
  } catch (error) {
    ownedCleanup.ok = false;
    ownedCleanup.failures ??= [];
    ownedCleanup.failures.push(`temp-cleanup:${redact(error.message)}`);
  }
  return { nested: nestedCleanup, owned: ownedCleanup };
}, reportContext: () => ({ run, daemonId: manifest.daemonId, acceptanceReport: path.basename(acceptanceReport), fixtureReport: path.basename(fixtureReport), cleanupLedger: path.basename(ledgerPath), mountDiagnostic }), persist: async report => {
  manifest.phase = report.phase;
  manifest.cleanup = report.cleanup;
  await saveLedger(manifest);
  await fs.writeFile(runtimeReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
} });
if (lifecycle.report.error) process.stderr.write(`${lifecycle.report.error}\n`);
process.stdout.write(`${runtimeReport}\n`);
process.exitCode = lifecycle.exitCode;
