import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const OWNER_LABEL = "com.axon.approval.owner";
export const RUN_LABEL = "com.axon.approval.run";
export const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "REJECTED", "CANCELLED", "UNKNOWN"]);

export function invariant(value, message) {
  if (!value) throw new Error(message);
}

const SOCKET_BIND = "/var/run/docker.sock:/var/run/docker.sock";
const DESKTOP_SOCKET = "/run/host-services/docker.proxy.sock";
const DESKTOP_ENDPOINT = "npipe:////./pipe/dockerDesktopLinuxEngine";

// The intent is derived from the same fixed argv delivered to Docker, never inspect data.
export async function launchOwnedAgent(plan, { docker, recordIntent }) {
  const keys = ["owner", "run", "name", "network", "journalVolume", "envFile", "image"];
  invariant(plan && Object.keys(plan).length === keys.length && keys.every(key => typeof plan[key] === "string" && plan[key].length > 0), "Agent launch plan is malformed");
  const args = Object.freeze(["container", "run", "--detach", "--name", plan.name, "--network", plan.network, "--group-add", "0",
    "--label", `${OWNER_LABEL}=${plan.owner}`, "--label", `${RUN_LABEL}=${plan.run}`,
    "--volume", `${plan.journalVolume}:/var/lib/axon/journal`, "--volume", SOCKET_BIND, "--env-file", plan.envFile, plan.image]);
  const values = flag => args.flatMap((arg, index) => arg === flag ? [args[index + 1]] : []);
  const volumes = values("--volume"), names = values("--name"), labels = values("--label");
  invariant(volumes.length === 2 && volumes[1] === SOCKET_BIND && names.length === 1, "Agent literal launch intent mismatch");
  const intent = Object.freeze({ run: labels.find(label => label.startsWith(`${RUN_LABEL}=`)).slice(RUN_LABEL.length + 1),
    name: names[0], socketBind: volumes[1], journalBind: volumes[0] });
  await recordIntent(intent);
  return docker(args);
}

// Observation only: this must never become an auto-learned mount allowlist.
export function agentMountDiagnostic(inspection, expected, secrets = []) {
  validateOwnedInspection(inspection, expected);
  invariant(inspection.kind === "container" && typeof expected.name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(expected.name), "Diagnostic agent name/kind is malformed");
  invariant(typeof expected.id === "string" && inspection.id === expected.id, "Diagnostic agent immutable ID mismatch");
  const malformed = [], truncated = [];
  const bounded = (value, field) => {
    if (typeof value !== "string") { malformed.push(field); return null; }
    const safe = redact(value, secrets);
    if (safe.length > 256) truncated.push(field);
    return safe.slice(0, 256);
  };
  if (!Array.isArray(inspection.raw?.Mounts)) malformed.push("mounts");
  if (!Array.isArray(inspection.raw?.HostConfig?.Binds)) malformed.push("observedBinds");
  const mounts = Array.isArray(inspection.raw?.Mounts) ? inspection.raw.Mounts : [];
  const binds = Array.isArray(inspection.raw?.HostConfig?.Binds) ? inspection.raw.HostConfig.Binds : [];
  if (mounts.length > 8) truncated.push("mounts");
  if (binds.length > 8) truncated.push("observedBinds");
  const intent = expected.launchIntent, preflight = expected.preflight;
  const socket = mounts.find(mount => mount?.Type === "bind" && mount.Destination === "/var/run/docker.sock");
  const diagnostic = {
    container: { id: bounded(inspection.id, "container.id"), name: bounded(inspection.name, "container.name") },
    run: bounded(expected.run, "run"), daemonId: bounded(expected.daemonId, "daemonId"),
    expectedSocket: "/var/run/docker.sock",
    expectedJournal: { name: bounded(expected.journalVolume, "expectedJournal.name"), destination: "/var/lib/axon/journal" },
    launchIntent: intent ? { run: bounded(intent.run, "launchIntent.run"), name: bounded(intent.name, "launchIntent.name"),
      socketBind: bounded(intent.socketBind, "launchIntent.socketBind"), journalBind: bounded(intent.journalBind, "launchIntent.journalBind") } : null,
    preflight: preflight ? { context: bounded(preflight.context, "preflight.context"), endpoint: bounded(preflight.endpoint, "preflight.endpoint"),
      os: bounded(preflight.os, "preflight.os"), daemonId: bounded(preflight.daemonId, "preflight.daemonId") } : null,
    observedSocketRepresentation: socket?.Source === "/var/run/docker.sock" ? "literal" : socket?.Source === DESKTOP_SOCKET ? "desktop-proxy" : "unrecognized",
    observedBinds: binds.slice(0, 8).map((bind, index) => bounded(bind, `observedBinds.${index}`)), bindCount: Array.isArray(inspection.raw?.HostConfig?.Binds) ? binds.length : null,
    mountCount: Array.isArray(inspection.raw?.Mounts) ? mounts.length : null,
    mounts: mounts.slice(0, 8).map((mount, index) => {
      const prefix = `mounts.${index}`;
      if (!mount || typeof mount !== "object" || Array.isArray(mount)) malformed.push(prefix);
      if (typeof mount?.RW !== "boolean") malformed.push(`${prefix}.rw`);
      return {
        type: bounded(mount?.Type, `${prefix}.type`), source: mount?.Type === "bind" ? bounded(mount.Source, `${prefix}.source`) : null,
        volumeName: mount?.Type === "volume" ? bounded(mount.Name, `${prefix}.volumeName`) : null,
        destination: bounded(mount?.Destination, `${prefix}.destination`), rw: typeof mount?.RW === "boolean" ? mount.RW : null,
      };
    }),
  };
  return { ...diagnostic, malformed, truncated };
}

// The orchestrator and offline tests share this gate; observation cannot authorize execution.
export async function validateAgentAndContinue(inspection, expected, { secrets = [], onDiagnostic, readDaemon, verify }) {
  validateOwnedInspection(inspection, expected);
  invariant(typeof expected.id === "string" && inspection.id === expected.id, "Agent immutable ID mismatch");
  invariant(inspection.raw?.HostConfig?.Privileged !== true, "Agent is privileged at runtime");
  invariant(Object.keys(inspection.raw?.NetworkSettings?.Networks ?? {}).length === 1 && inspection.raw.NetworkSettings.Networks[expected.network], "Agent runtime network mismatch");
  invariant(Object.keys(inspection.raw?.NetworkSettings?.Ports ?? {}).length === 0, "Agent must not publish ports");
  onDiagnostic(agentMountDiagnostic(inspection, expected, secrets));
  const intent = expected.launchIntent;
  invariant(intent && intent.run === expected.run && intent.name === expected.name && intent.socketBind === SOCKET_BIND &&
    intent.journalBind === `${expected.journalVolume}:/var/lib/axon/journal`, "Agent literal launch intent mismatch");
  const mounts = inspection.raw?.Mounts;
  invariant(Array.isArray(mounts) && mounts.length === 2, "Agent runtime mounts mismatch");
  invariant(mounts.some(mount => mount?.Type === "volume" && mount.Name === expected.journalVolume && mount.Destination === "/var/lib/axon/journal"), "Agent journal mount mismatch");
  const socket = mounts.find(mount => mount?.Type === "bind" && mount.Destination === "/var/run/docker.sock");
  invariant(socket && ["/var/run/docker.sock", DESKTOP_SOCKET].includes(socket.Source), "Agent daemon socket mount mismatch");
  if (socket.Source === DESKTOP_SOCKET) {
    const metadata = expected.preflight;
    invariant(metadata?.context === "desktop-linux" && metadata.endpoint === DESKTOP_ENDPOINT && metadata.os === "linux" &&
      typeof metadata.daemonId === "string" && metadata.daemonId.trim().length > 0 && metadata.daemonId === expected.daemonId, "Agent Desktop socket preflight mismatch");
  }
  const binds = inspection.raw?.HostConfig?.Binds;
  const socketBind = `${socket.Source}:/var/run/docker.sock`;
  invariant(Array.isArray(binds) && binds.length === 2 && binds.every(bind => typeof bind === "string") &&
    binds.includes(intent.journalBind) && binds.includes(socketBind), "Agent observed Binds mismatch");
  invariant(await readDaemon(inspection.id) === expected.daemonId, "Agent Docker socket reaches a different daemon");
  return verify();
}

// Keep cleanup and final evidence on the same production failure path exercised offline.
export async function runHarnessLifecycle({ work, cleanup, reportContext, persist, getSecrets }) {
  let workError = null;
  try { await work(); } catch (error) { workError = redact(error?.stack ?? error?.message ?? error, getSecrets()); }
  const cleanupResult = await cleanup(workError);
  const context = reportContext();
  const report = {
    phase: workError || !cleanupResult.nested.ok || !cleanupResult.owned.ok ? "failed-or-cleanup-incomplete" : "pass-cleaned",
    run: context.run, daemonId: context.daemonId,
    acceptanceReport: context.acceptanceReport, fixtureReport: context.fixtureReport, cleanupLedger: context.cleanupLedger,
    mountDiagnostic: context.mountDiagnostic, error: workError, cleanup: cleanupResult,
  };
  const secrets = getSecrets();
  const sanitize = value => typeof value === "string" ? redact(value, secrets)
    : Array.isArray(value) ? value.map(sanitize)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)])) : value;
  const safeReport = sanitize(report);
  await persist(safeReport);
  return { report: safeReport, exitCode: finalExit(workError, { ok: cleanupResult.nested.ok && cleanupResult.owned.ok }) };
}

export function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

export function redact(value, secrets = []) {
  let text = String(value ?? "");
  for (const secret of secrets.filter(Boolean).map(String).sort((a, b) => b.length - a.length)) text = text.split(secret).join("[REDACTED]");
  return text.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, "$1[REDACTED]@").replace(/(authorization\s*[:=]\s*)([^\s,}]+)/gi, "$1[REDACTED]");
}

export function buildHarnessEnvironment(environment = process.env) {
  // Docker Desktop discovers CLI plugins through Windows installation roots.
  // Never inherit ambient endpoints, TLS settings, or application credentials.
  const allowed = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "DOCKER_CONFIG", "ProgramFiles", "ProgramW6432"];
  return Object.fromEntries(allowed.filter(key => environment[key] !== undefined).map(key => [key, environment[key]]));
}

export async function runNative(file, args, options = {}) {
  const { cwd, env = process.env, timeoutMs = 30_000, allowExitCodes = [0], secrets = [], input } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: { ...env }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let inputError;
    const failInput = (error) => {
      inputError ??= new Error(`${file} stdin failed: ${redact(error.message, secrets)}`);
      // Wait for close (or the existing bounded timeout) so caller cleanup cannot
      // race a still-running producer. Never retry uncertain input delivery.
      try { child.kill("SIGKILL"); } catch { /* The close/timeout path still settles. */ }
    };
    child.stdin.on("error", failInput);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => reject(new Error(`${file} could not start: ${redact(error.message, secrets)}`)));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${file} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const result = {
        code: code ?? -1,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (inputError) { reject(inputError); return; }
      if (!allowExitCodes.includes(result.code)) {
        reject(new Error(`${file} exited ${result.code}: ${redact(result.stderr.slice(-2000), secrets)}`));
      } else resolve(result);
    });
    try {
      if (input !== undefined) child.stdin.end(input); else child.stdin.end();
    } catch (error) { failInput(error); }
  });
}

export async function fetchJson(url, options = {}, controls = {}) {
  const { timeoutMs = 8_000, expectedStatuses = [200], secrets = [], allowInternal = false } = controls;
  const parsed = new URL(url);
  invariant(parsed.protocol === "http:", "Harness HTTP endpoint must use http");
  invariant(!parsed.username && !parsed.password && !parsed.hash, "Harness HTTP endpoint must not contain credentials or fragments");
  invariant(allowInternal ? parsed.origin === "http://backend:3000" : parsed.hostname === "127.0.0.1", "Harness HTTP endpoint must be exact loopback 127.0.0.1 or explicitly approved internal backend");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, { ...options, redirect: "manual", signal: controller.signal });
    invariant(response.status < 300 || response.status >= 400, `Redirect rejected: HTTP ${response.status}`);
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`Non-JSON HTTP ${response.status}`); }
    invariant(expectedStatuses.includes(response.status), `Unexpected HTTP ${response.status}: ${redact(text.slice(0, 500), secrets)}`);
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`HTTP request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function exactLoopbackPort(entry, expectedHost, expectedTarget) {
  if (typeof entry === "string") {
    return entry === `127.0.0.1:${expectedHost}:${expectedTarget}`;
  }
  return entry?.host_ip === "127.0.0.1" && Number(entry?.published) === Number(expectedHost) && Number(entry?.target) === Number(expectedTarget);
}

export function validateEffectiveCompose(config, expected) {
  invariant(config && typeof config === "object" && !Array.isArray(config), "Compose config must be an object");
  invariant(JSON.stringify(config).length < 1_000_000, "Compose config is unexpectedly large");
  const services = config.services ?? {};
  invariant(JSON.stringify(Object.keys(services).sort()) === JSON.stringify(["backend", "mongodb", "redis"]), "Compose must contain exactly backend, mongodb, and redis");
  const expectedPorts = { mongodb: [expected.mongoPort, 27017], redis: [expected.redisPort, 6379], backend: [expected.backendPort, 3000] };
  for (const [name, service] of Object.entries(services)) {
    invariant(service.privileged !== true, `${name} must not be privileged`);
    invariant(!service.network_mode, `${name} must not set network_mode`);
    invariant(!service.pid && !service.ipc, `${name} must not share PID/IPC namespaces`);
    const attachedNetworks = Array.isArray(service.networks) ? service.networks : Object.keys(service.networks ?? { approval: null });
    invariant(attachedNetworks.length === 1 && attachedNetworks[0] === "approval", `${name} uses an unexpected network`);
    const ports = service.ports ?? [];
    invariant(expected.runnerMode === "internal" ? ports.length === 0 : ports.length === 1 && exactLoopbackPort(ports[0], ...expectedPorts[name]), `${name} has unexpected port publications`);
    invariant(service.labels?.[OWNER_LABEL] === expected.owner, `${name} owner label mismatch`);
    invariant(service.labels?.[RUN_LABEL] === expected.run, `${name} run label mismatch`);
  }
  invariant(services.mongodb.image === "mongo:7", "Mongo image mismatch");
  invariant(services.redis.image === "redis:7-alpine", "Redis image mismatch");
  invariant(services.backend.image === expected.backendImage, "Backend image mismatch");
  const expectedMounts = {
    mongodb: [{ type: "volume", source: "approval-mongodb", target: "/data/db" }, { type: "volume", source: "approval-mongodb-config", target: "/data/configdb" }],
    redis: [{ type: "volume", source: "approval-redis", target: "/data" }],
    backend: [],
  };
  for (const [name, service] of Object.entries(services)) {
    const mounts = (service.volumes ?? []).map(({ type, source, target }) => ({ type, source, target }));
    invariant(JSON.stringify(mounts) === JSON.stringify(expectedMounts[name]), `${name} has unexpected mounts`);
  }
  const backendEnv = services.backend.environment ?? {};
  const allowedBackendEnvironment = [
    "AXON_EXECUTION_PROFILE", "AXON_RELEASE_ID", "CORS_ALLOWED_ORIGINS", "DISPATCH_SIGNING_KEY",
    "ENCRYPTION_KEY", "JWT_SECRET", "LOG_LEVEL", "MONGO_URI", "NODE_ENV", "PORT",
    "PROMETHEUS_BEARER_TOKEN", "REDIS_URI",
  ];
  invariant(
    JSON.stringify(Object.keys(backendEnv).sort()) === JSON.stringify(allowedBackendEnvironment.sort()),
    "Backend has missing or unexpected environment variables",
  );
  invariant(backendEnv.AXON_EXECUTION_PROFILE === "pilot", "Backend must use pilot execution profile");
  invariant(String(backendEnv.MONGO_URI).includes("@mongodb:27017/"), "Backend Mongo must use the isolated Compose service");
  invariant(backendEnv.REDIS_URI === "redis://redis:6379/15", "Backend Redis must use isolated service DB 15");
  for (const [kind, values] of Object.entries({ networks: config.networks ?? {}, volumes: config.volumes ?? {} })) {
    for (const [name, value] of Object.entries(values)) {
      invariant(value?.external !== true, `${kind}.${name} must not be external`);
      invariant(value?.labels?.[OWNER_LABEL] === expected.owner, `${kind}.${name} owner label mismatch`);
      invariant(value?.labels?.[RUN_LABEL] === expected.run, `${kind}.${name} run label mismatch`);
    }
  }
  invariant(JSON.stringify(Object.keys(config.networks ?? {})) === JSON.stringify(["approval"]), "Compose must declare only the approval network");
  invariant(config.networks.approval?.internal === true, "Approval network must be internal");
  invariant(JSON.stringify(Object.keys(config.volumes ?? {}).sort()) === JSON.stringify(["approval-mongodb", "approval-mongodb-config", "approval-redis"]), "Compose must declare only isolated data volumes");
  if (expected.volumeNames) for (const [key, name] of Object.entries(expected.volumeNames)) {
    invariant(config.volumes[key]?.name === name, `${key} volume name mismatch`);
  }
  return true;
}

export function validateDataEndpoints({ mongoUri, redisUri, manifest, allowInternal = false }) {
  invariant(allowInternal === (manifest.runnerMode === "internal"), "Internal transport mode mismatch");
  const mongo = new URL(mongoUri);
  const redis = new URL(redisUri);
  invariant(mongo.protocol === "mongodb:", "Mongo URI protocol must be mongodb");
  invariant(redis.protocol === "redis:", "Redis URI protocol must be redis");
  const mongoHost = allowInternal ? "mongodb" : "127.0.0.1";
  const redisHost = allowInternal ? "redis" : "127.0.0.1";
  invariant(mongo.hostname === mongoHost && Number(mongo.port) === Number(allowInternal ? 27017 : manifest.mongoPort), "Mongo host/port mismatch");
  invariant(redis.hostname === redisHost && Number(redis.port) === Number(allowInternal ? 6379 : manifest.redisPort), "Redis host/port mismatch");
  invariant(decodeURIComponent(mongo.pathname.slice(1)) === manifest.database, "Mongo database mismatch");
  invariant(mongo.searchParams.get("authSource") === "admin", "Mongo authSource must be admin");
  invariant(mongo.search === "?authSource=admin" && !mongo.hash, "Unexpected Mongo URI options");
  invariant((redis.pathname.slice(1) || "0") === "15", "Redis database must be 15");
  invariant(!redis.username && !redis.password && !redis.search && !redis.hash, "Unexpected Redis URI options");
  return true;
}

export function assertFreshDatabase(collectionCounts) {
  invariant(collectionCounts && typeof collectionCounts === "object" && !Array.isArray(collectionCounts), "Database inspection result is malformed");
  const nonempty = Object.entries(collectionCounts).filter(([, count]) => !Number.isInteger(count) || count !== 0);
  invariant(nonempty.length === 0, `Database is not empty: ${nonempty.map(([name]) => name).join(",")}`);
  return true;
}

export function assertNoPreexisting(resources) {
  invariant(Array.isArray(resources), "Preexisting-resource result is malformed");
  const present = resources.filter((resource) => resource?.present === true);
  invariant(present.length === 0, `Refusing preexisting resources: ${present.map((item) => `${item.kind}:${item.name}`).join(",")}`);
  invariant(resources.every((resource) => resource && typeof resource.kind === "string" && typeof resource.name === "string" && typeof resource.present === "boolean"), "Preexisting-resource entry is malformed");
  return true;
}

export async function assertPrivateTempDirectory(candidate) {
  const base = await fs.realpath(os.tmpdir());
  const resolved = await fs.realpath(candidate);
  const stat = await fs.lstat(candidate);
  invariant(stat.isDirectory() && !stat.isSymbolicLink(), "Harness temporary path must be a real directory");
  invariant(path.dirname(resolved) === base && path.basename(resolved).startsWith("axon-approval-"), "Harness temporary path is outside its private namespace");
  return resolved;
}

export function validateOwnedInspection(inspection, expected) {
  invariant(inspection && typeof inspection === "object" && !Array.isArray(inspection), "Resource inspection is malformed");
  if (inspection.kind === "volume") {
    invariant(typeof inspection.name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(inspection.name), "Volume name is malformed");
    invariant(inspection.id === inspection.name, "Volume identity mismatch");
  } else {
    invariant(typeof inspection.id === "string" && /^[0-9a-f]{12,64}$/i.test(inspection.id), "Resource ID is malformed");
  }
  invariant(inspection.labels?.[OWNER_LABEL] === expected.owner, "Resource owner label mismatch");
  invariant(inspection.labels?.[RUN_LABEL] === expected.run, "Resource run label mismatch");
  if (expected.name !== undefined) invariant(inspection.name === expected.name, "Resource name mismatch");
  return inspection.id;
}

export async function cleanupOwnedResources(manifest, adapter) {
  const failures = [];
  const deleted = [];
  const outside = [];
  const candidates = await adapter.discover(manifest.owner, manifest.run);
  for (const resource of candidates) {
    try {
      const attempted = manifest.attempted.find((item) => item.kind === resource.kind && item.name === resource.name);
      if (!attempted) {
        outside.push(`${resource.kind}:${resource.name}`);
        failures.push(`${resource.kind}:${resource.name}:owned-labels-outside-manifest`);
        continue;
      }
      validateOwnedInspection(resource, { owner: manifest.owner, run: manifest.run, name: resource.name });
      invariant(typeof attempted.id === "string" && attempted.id.length > 0, "Manifest resource ID is missing");
      invariant(resource.id === attempted.id, "Manifest resource identity mismatch");
      await adapter.remove(resource);
      deleted.push(`${resource.kind}:${resource.name}`);
    } catch (error) {
      failures.push(`${resource.kind}:${resource.name}:${error.message}`);
    }
  }
  for (const attempted of manifest.attempted) {
    try {
      if (!attempted.id) continue;
      const remaining = await adapter.exists(attempted);
      if (remaining) {
        const suffix = remaining.id === attempted.id ? "still-present" : "identity-changed";
        failures.push(`${attempted.kind}:${attempted.name}:${suffix}`);
      }
    } catch (error) {
      failures.push(`${attempted.kind}:${attempted.name}:absence-check:${error.message}`);
    }
  }
  return { ok: failures.length === 0, deleted, outside, failures };
}

export function finalExit(workError, cleanup) {
  return workError || !cleanup?.ok ? 1 : 0;
}

// This is the production adapter, shared with offline classification tests.
export async function inspectDockerResource(docker, kind, name, allowMissing = false) {
  invariant(["container", "image", "network", "volume"].includes(kind), "Unexpected inspection kind");
  const result = await docker([kind, "inspect", name], { allowExitCodes: allowMissing ? [0, 1] : [0], timeoutMs: 20_000 });
  if (result.code !== 0) {
    const confirmedMissing = [
      `Error response from daemon: No such ${kind}: ${name}`,
      `Error: No such ${kind}: ${name}`,
      `Error: No such object: ${name}`,
      ...(kind === "network" ? [`Error response from daemon: network ${name} not found`] : []),
      ...(kind === "volume" ? [`Error response from daemon: get ${name}: no such volume`] : []),
    ];
    invariant(allowMissing && result.code === 1 && ["", "[]"].includes(result.stdout.trim())
      && confirmedMissing.includes(result.stderr.trim()), `${kind} absence is unconfirmed`);
    return null;
  }
  const parsed = JSON.parse(result.stdout);
  invariant(Array.isArray(parsed) && parsed.length === 1 && parsed[0] && typeof parsed[0] === "object", `${kind} inspection is malformed`);
  const item = parsed[0];
  const id = kind === "volume" ? String(item.Name ?? "") : String(item.Id ?? item.ID ?? "").replace(/^sha256:/, "");
  invariant(kind === "volume" ? /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id) : /^[0-9a-f]{64}$/i.test(id), `${kind} inspection identity is malformed`);
  const actualName = kind === "container" ? String(item.Name ?? "").replace(/^\//, "")
    : kind === "volume" || kind === "network" ? item.Name : name;
  invariant(typeof actualName === "string" && actualName.length > 0, `${kind} inspection name is malformed`);
  return { id, rawId: item.Id ?? item.ID, kind, name: actualName, ref: name, labels: item.Config?.Labels ?? item.Labels ?? {}, raw: item };
}

export async function cleanupNestedResources(manifest, state, adapter) {
  const deleted = [], failures = [];
  try {
    // Quiesce every manifest-owned producer before taking the sandbox inventory.
    for (const entry of manifest.attempted.filter(item => item.kind === "container" && adapter.producerNames.includes(item.name))) {
      const producer = await adapter.inspect(entry.name, true);
      if (!producer) continue;
      validateOwnedInspection(producer, { owner: manifest.owner, run: manifest.run, name: entry.name });
      invariant(entry.id && producer.id === entry.id, "Producer manifest identity mismatch");
      await adapter.stop(producer.rawId);
      const stopped = await adapter.inspect(entry.name, true);
      if (stopped) {
        validateOwnedInspection(stopped, { owner: manifest.owner, run: manifest.run, name: entry.name });
        invariant(stopped.id === entry.id && stopped.raw.State?.Running === false && stopped.raw.State?.Restarting === false
          && ["", "no"].includes(stopped.raw.HostConfig?.RestartPolicy?.Name), "Producer quiescence is unconfirmed");
      }
    }
    if (!state?.agentId) {
      invariant(!manifest.attempted.some(item => item.name === adapter.agentName), "Nested cleanup lacks agent identity");
      return { ok: true, deleted, failures };
    }
    const ids = await adapter.discover();
    invariant(Array.isArray(ids) && ids.every(id => /^[0-9a-f]{12,64}$/i.test(id)), "Nested inventory is malformed");
    for (const id of ids) {
      const inspected = await adapter.inspect(id, true);
      if (!inspected) continue;
      invariant(inspected.id.startsWith(id), "Nested inventory identity mismatch");
      invariant(inspected.labels?.["com.axon.managed"] === "true", "Nested container managed label mismatch");
      invariant(inspected.labels?.["com.axon.agent-id"] === state.agentId, "Nested container agent label mismatch");
      invariant(inspected.labels?.["com.axon.release-id"] === manifest.releaseId, "Nested container release label mismatch");
      manifest.nestedOwned ??= [];
      manifest.nestedOwned.push({ id: inspected.id, rawId: inspected.rawId });
      await adapter.save();
      await adapter.remove(inspected.rawId);
      invariant(await adapter.inspect(inspected.rawId, true) === null, "Nested removal absence is unconfirmed");
      deleted.push(inspected.rawId);
    }
    const remaining = await adapter.discover();
    invariant(Array.isArray(remaining) && remaining.length === 0, "Nested final absence is unconfirmed");
  } catch (error) { failures.push(redact(error.message)); }
  return { ok: failures.length === 0, deleted, failures };
}
