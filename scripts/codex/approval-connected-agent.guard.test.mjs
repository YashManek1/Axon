import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OWNER_LABEL,
  RUN_LABEL,
  buildHarnessEnvironment,
  assertFreshDatabase,
  assertNoPreexisting,
  assertPrivateTempDirectory,
  cleanupOwnedResources,
  cleanupNestedResources,
  inspectDockerResource,
  fetchJson,
  finalExit,
  runNative,
  validateDataEndpoints,
  validateEffectiveCompose,
  validateOwnedInspection,
  agentMountDiagnostic,
  validateAgentAndContinue,
  runHarnessLifecycle,
  launchOwnedAgent,
} from "./approval-connected-agent-lib.mjs";

const owner = "axon-approval-connected-agent";
const run = "0123456789abcdef0123456789abcdef";
const manifest = { owner, run, mongoPort: 41001, redisPort: 41002, database: `axon_approval_${run}`, attempted: [] };

test("running-agent mount diagnostic is bounded and excludes raw credentials and volume host paths", () => {
  const expected = { owner, run, name: "agent", id: "a".repeat(64), journalVolume: "journal", daemonId: "daemon" };
  const inspection = { kind: "container", name: "agent", id: expected.id, labels: labels(), raw: {
    Config: { Env: ["SECRET=never-export"], Labels: { secret: "never-export" } },
    HostConfig: { Binds: ["/var/run/docker.sock:/var/run/docker.sock", "journal:/var/lib/axon/journal"], secret: "never-export" },
    Mounts: [{ Type: "bind", Source: "/var/run/docker.sock", Destination: "/var/run/docker.sock", RW: true, secret: "never-export" },
      { Type: "volume", Name: "journal", Source: "/host/private/never-export", Destination: "/var/lib/axon/journal", RW: true }],
  } };
  const report = agentMountDiagnostic(inspection, expected);
  assert.equal(report.mounts[0].source, "/var/run/docker.sock");
  assert.equal(report.mounts[1].source, null);
  assert.equal(report.mounts[1].volumeName, "journal");
  assert.equal(JSON.stringify(report).includes("never-export"), false);
  inspection.raw.Mounts = Array.from({ length: 12 }, () => ({ Type: "bind", Source: "x".repeat(900), Destination: "d".repeat(900) }));
  inspection.raw.HostConfig.Binds = Array(12).fill("b".repeat(900));
  const bounded = agentMountDiagnostic(inspection, expected);
  assert.equal(bounded.mountCount, 12);
  assert.equal(bounded.mounts.length, 8);
  assert.equal(bounded.mounts[0].source.length, 256);
  assert.equal(bounded.observedBinds.length, 8);
  assert.equal(bounded.observedBinds[0].length, 256);
  assert.ok(bounded.truncated.includes("mounts"));
  assert.ok(bounded.truncated.includes("observedBinds"));
  assert.ok(bounded.truncated.includes("mounts.0.source"));
  assert.ok(bounded.truncated.includes("observedBinds.0"));
  assert.ok(bounded.malformed.includes("mounts.0.rw"));
});

test("running-agent mount diagnostic refuses wrong ownership or immutable identity", () => {
  const expected = { owner, run, name: "agent", id: "a".repeat(64), journalVolume: "journal" };
  const inspection = { kind: "container", name: "agent", id: expected.id, labels: labels(), raw: {} };
  for (const patch of [{ name: "foreign" }, { id: "b".repeat(64) }, { labels: {} }]) {
    assert.throws(() => agentMountDiagnostic({ ...inspection, ...patch }, expected));
  }
  assert.throws(() => agentMountDiagnostic(inspection, { ...expected, id: undefined }));
  assert.deepEqual(agentMountDiagnostic(inspection, expected).mounts, []);
  assert.equal(agentMountDiagnostic(inspection, expected).mountCount, null);
  assert.ok(agentMountDiagnostic(inspection, expected).malformed.includes("mounts"));
});

function agentFixture() {
  const expected = { owner, run, name: "agent", id: "a".repeat(64), journalVolume: "journal", network: "network", daemonId: "daemon" };
  expected.launchIntent = { run, name: expected.name, socketBind: "/var/run/docker.sock:/var/run/docker.sock", journalBind: "journal:/var/lib/axon/journal" };
  expected.preflight = { context: "desktop-linux", endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine", os: "linux", daemonId: expected.daemonId };
  const inspection = { kind: "container", name: expected.name, id: expected.id, labels: labels(), raw: {
    HostConfig: { Privileged: false, Binds: ["/var/run/docker.sock:/var/run/docker.sock", "journal:/var/lib/axon/journal"] },
    NetworkSettings: { Networks: { network: {} }, Ports: {} },
    Mounts: [{ Type: "bind", Source: "/var/run/docker.sock", Destination: "/var/run/docker.sock", RW: true },
      { Type: "volume", Name: "journal", Destination: "/var/lib/axon/journal", RW: true }],
  } };
  return { expected, inspection };
}

async function exerciseAgentPath({ expected, inspection }, options = {}) {
  const events = [];
  let mountDiagnostic = null, savedReport;
  const secrets = options.secrets ?? [];
  const result = await runHarnessLifecycle({
    getSecrets: () => secrets,
    work: () => validateAgentAndContinue(inspection, expected, {
      secrets, onDiagnostic: diagnostic => { events.push("diagnostic"); mountDiagnostic = diagnostic; },
      readDaemon: async id => { assert.equal(id, expected.id); events.push("daemon"); return options.daemonId ?? expected.daemonId; },
      verify: async () => { events.push("verify"); if (options.verifierError) throw new Error(options.verifierError); },
    }),
    cleanup: async () => { events.push("cleanup"); return { nested: { ok: true }, owned: { ok: !options.cleanupFailure } }; },
    reportContext: () => ({ run: expected.run, daemonId: expected.daemonId, mountDiagnostic, acceptanceReport: "acceptance.json", fixtureReport: "fixture.json", cleanupLedger: "ledger.json" }),
    persist: async report => { events.push("persist"); savedReport = JSON.stringify(report); },
  });
  return { ...result, events, savedReport };
}

test("shared launch sends literal argv, records derived intent before Docker, and preserves launch failure", async () => {
  const fixture = agentFixture(), events = [];
  const plan = { owner, run, name: "agent", network: "network", journalVolume: "journal", envFile: "private.env", image: "owned-image" };
  const invoke = fail => launchOwnedAgent(plan, {
    recordIntent: async intent => { events.push("intent"); fixture.expected.launchIntent = intent; },
    docker: async args => {
      events.push("docker");
      assert.ok(Object.isFrozen(args));
      assert.deepEqual(args.flatMap((arg, index) => arg === "--volume" ? [args[index + 1]] : []),
        ["journal:/var/lib/axon/journal", "/var/run/docker.sock:/var/run/docker.sock"]);
      assert.equal(fixture.expected.launchIntent.name, args[args.indexOf("--name") + 1]);
      assert.equal(fixture.expected.launchIntent.run, args[args.lastIndexOf("--label") + 1].slice(RUN_LABEL.length + 1));
      assert.equal(args.includes("/run/host-services/docker.proxy.sock:/var/run/docker.sock"), false);
      if (fail) throw new Error("launch failure");
    },
  });
  await invoke(false);
  assert.deepEqual(events, ["intent", "docker"]);
  assert.equal((await exerciseAgentPath(fixture)).exitCode, 0);
  await assert.rejects(invoke(true), /launch failure/);
  assert.deepEqual(events, ["intent", "docker", "intent", "docker"]);
  let invoked = false;
  for (const override of [{ source: "/run/host-services/docker.proxy.sock" }, { launchIntent: { socketBind: "proxy" } }, { envFile: null }]) {
    await assert.rejects(launchOwnedAgent({ ...plan, ...override }, { recordIntent: async () => { invoked = true; }, docker: async () => { invoked = true; } }), /plan is malformed/);
  }
  assert.equal(invoked, false);
  await assert.rejects(launchOwnedAgent(plan, { recordIntent: async () => { throw new Error("intent persistence failed"); }, docker: async () => { invoked = true; } }), /persistence failed/);
  assert.equal(invoked, false);
});

function proxyFixture() {
  const fixture = agentFixture();
  fixture.inspection.raw.Mounts[0].Source = "/run/host-services/docker.proxy.sock";
  fixture.inspection.raw.HostConfig.Binds[0] = "/run/host-services/docker.proxy.sock:/var/run/docker.sock";
  return fixture;
}

test("exact Desktop proxy advances only with literal launch intent and matched local daemon", async () => {
  const fixture = proxyFixture();
  fixture.inspection.raw.HostConfig.Binds.reverse();
  fixture.inspection.raw.Mounts.reverse();
  const result = await exerciseAgentPath(fixture);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.events, ["diagnostic", "daemon", "verify", "cleanup", "persist"]);
  assert.equal(result.report.mountDiagnostic.observedSocketRepresentation, "desktop-proxy");
  assert.equal(result.report.mountDiagnostic.launchIntent.socketBind, "/var/run/docker.sock:/var/run/docker.sock");
  assert.ok(result.report.mountDiagnostic.observedBinds.includes("/run/host-services/docker.proxy.sock:/var/run/docker.sock"));
  const wrongDaemon = await exerciseAgentPath(proxyFixture(), { daemonId: "other" });
  assert.equal(wrongDaemon.exitCode, 1);
  assert.deepEqual(wrongDaemon.events, ["diagnostic", "daemon", "cleanup", "persist"]);
});

const rejectedProxyMetadata = [
  ["missing metadata", fixture => { delete fixture.expected.preflight; }],
  ...["context", "endpoint", "os", "daemonId"].flatMap(key => [
    [`missing ${key}`, fixture => { delete fixture.expected.preflight[key]; }],
    [`non-string ${key}`, fixture => { fixture.expected.preflight[key] = {}; }],
    [`wrong ${key}`, fixture => { fixture.expected.preflight[key] = "wrong"; }],
  ]),
  ...["npipe:////remote/pipe/dockerDesktopLinuxEngine", "tcp://localhost:2375", "ssh://localhost", "unix:///var/run/docker.sock",
    "npipe:////./pipe/dockerDesktopLinuxEngine/", "npipe:////./pipe/dockerDesktopLinuxEngine-extra"].map(endpoint =>
    [`unapproved endpoint ${endpoint}`, fixture => { fixture.expected.preflight.endpoint = endpoint; }]),
  ["empty daemon", fixture => { fixture.expected.preflight.daemonId = ""; fixture.expected.daemonId = ""; }],
  ["whitespace daemon", fixture => { fixture.expected.preflight.daemonId = " "; fixture.expected.daemonId = " "; }],
];
const rejectedIntent = [
  ["missing intent", fixture => { delete fixture.expected.launchIntent; }],
  ...["run", "name", "socketBind", "journalBind"].flatMap(key => [
    [`missing intent ${key}`, fixture => { delete fixture.expected.launchIntent[key]; }],
    [`wrong intent ${key}`, fixture => { fixture.expected.launchIntent[key] = "wrong"; }],
  ]),
  ["proxy launch intent", fixture => { fixture.expected.launchIntent.socketBind = "/run/host-services/docker.proxy.sock:/var/run/docker.sock"; }],
];
for (const [name, mutate] of [...rejectedProxyMetadata, ...rejectedIntent]) test(`proxy production path rejects ${name} before exec and cleans`, async () => {
  const fixture = proxyFixture(); mutate(fixture);
  const result = await exerciseAgentPath(fixture);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.events, ["diagnostic", "cleanup", "persist"]);
  assert.ok(result.report.mountDiagnostic);
  assert.equal(result.report.phase, "failed-or-cleanup-incomplete");
  assert.ok(result.savedReport);
});

for (const [name, mutate] of rejectedIntent) test(`literal production path also rejects ${name}`, async () => {
  const fixture = agentFixture(); mutate(fixture);
  const result = await exerciseAgentPath(fixture);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.events, ["diagnostic", "cleanup", "persist"]);
});

const rejectedRepresentations = [
  ...["/run/host-services/docker.proxy.sock/", "/run/host-services/docker.proxy.sock-extra", "/prefix/run/host-services/docker.proxy.sock",
    "/run/host-services/../host-services/docker.proxy.sock"].map(source => [source, fixture => { fixture.inspection.raw.Mounts[0].Source = source; }]),
  ["changed destination", fixture => { fixture.inspection.raw.Mounts[0].Destination = "/other.sock"; }],
  ["changed type", fixture => { fixture.inspection.raw.Mounts[0].Type = "volume"; }],
  ["wrong journal", fixture => { fixture.inspection.raw.Mounts[1].Name = "other"; }],
  ["extra mount", fixture => { fixture.inspection.raw.Mounts.push({}); }],
  ["missing Binds", fixture => { delete fixture.inspection.raw.HostConfig.Binds; }],
  ["malformed Binds", fixture => { fixture.inspection.raw.HostConfig.Binds = {}; }],
  ["nonstring Bind", fixture => { fixture.inspection.raw.HostConfig.Binds[0] = {}; }],
  ["extra Bind", fixture => { fixture.inspection.raw.HostConfig.Binds.push("/host:/host"); }],
  ["missing Bind", fixture => { fixture.inspection.raw.HostConfig.Binds.pop(); }],
  ["literal Bind with proxy Mount", fixture => { fixture.inspection.raw.HostConfig.Binds[0] = "/var/run/docker.sock:/var/run/docker.sock"; }],
  ["duplicate journal Binds", fixture => { fixture.inspection.raw.HostConfig.Binds[0] = "journal:/var/lib/axon/journal"; }],
  ["wrong journal Bind", fixture => { fixture.inspection.raw.HostConfig.Binds[1] = "other:/var/lib/axon/journal"; }],
];
for (const [name, mutate] of rejectedRepresentations) test(`proxy representation rejects ${name} without exec and retains cleanup evidence`, async () => {
  const fixture = proxyFixture(); mutate(fixture);
  const result = await exerciseAgentPath(fixture);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.events, ["diagnostic", "cleanup", "persist"]);
  assert.ok(result.report.mountDiagnostic);
});

test("literal mounts do not silently select proxy Binds; privilege/network/ports stay blocked", async () => {
  const fixture = agentFixture(); fixture.inspection.raw.HostConfig.Binds[0] = "/run/host-services/docker.proxy.sock:/var/run/docker.sock";
  const result = await exerciseAgentPath(fixture);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.events, ["diagnostic", "cleanup", "persist"]);
  for (const mutate of [f => { f.inspection.raw.HostConfig.Privileged = true; },
    f => { f.inspection.raw.NetworkSettings.Networks.extra = {}; }, f => { f.inspection.raw.NetworkSettings.Ports["3000/tcp"] = []; }]) {
    const blocked = proxyFixture(); mutate(blocked);
    const outcome = await exerciseAgentPath(blocked);
    assert.equal(outcome.exitCode, 1);
    assert.deepEqual(outcome.events, ["cleanup", "persist"]);
  }
});

test("new intent/context evidence is redacted before bounding and final serialization", async () => {
  const fixture = proxyFixture(), secret = "private-metadata-secret";
  for (const key of Object.keys(fixture.expected.launchIntent)) fixture.expected.launchIntent[key] = `${"x".repeat(245)}${secret}`;
  for (const key of Object.keys(fixture.expected.preflight)) fixture.expected.preflight[key] = `${"x".repeat(245)}${secret}`;
  const result = await exerciseAgentPath(fixture, { secrets: [secret] });
  assert.equal(result.exitCode, 1);
  assert.equal(result.savedReport.includes(secret), false);
  for (const section of ["launchIntent", "preflight"]) for (const value of Object.values(result.report.mountDiagnostic[section])) {
    assert.equal(value, `${"x".repeat(245)}[REDACTED]`);
  }
  assert.equal(result.report.mountDiagnostic.truncated.length, 0);
});

test("production agent path advances only through literal topology, same daemon, verification, cleanup and report", async () => {
  const fixture = agentFixture();
  const result = await exerciseAgentPath(fixture);
  assert.deepEqual(result.events, ["diagnostic", "daemon", "verify", "cleanup", "persist"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.phase, "pass-cleaned");
  assert.deepEqual(result.report.mountDiagnostic.container, { id: fixture.expected.id, name: fixture.expected.name });
  assert.equal(result.report.mountDiagnostic.run, run);
  assert.equal(result.report.mountDiagnostic.daemonId, fixture.expected.daemonId);
});

const rejectedMounts = [
  ["wrong socket source", mounts => { mounts[0].Source = "/host/docker.sock"; }],
  ["wrong socket type", mounts => { mounts[0].Type = "volume"; }],
  ["wrong socket destination", mounts => { mounts[0].Destination = "/other.sock"; }],
  ["missing mount", mounts => { mounts.pop(); }],
  ["extra mount", mounts => { mounts.push({ Type: "bind", Source: "/host", Destination: "/extra" }); }],
  ["wrong journal", mounts => { mounts[1].Name = "foreign-journal"; }],
  ["wrong journal destination", mounts => { mounts[1].Destination = "/other-journal"; }],
  ["wrong journal type", mounts => { mounts[1].Type = "bind"; }],
];
for (const [name, mutate] of rejectedMounts) test(`production agent path rejects ${name}, retains diagnostic and cleans up without exec`, async () => {
  const fixture = agentFixture(); mutate(fixture.inspection.raw.Mounts);
  const result = await exerciseAgentPath(fixture);
  assert.deepEqual(result.events, ["diagnostic", "cleanup", "persist"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.phase, "failed-or-cleanup-incomplete");
  assert.ok(JSON.parse(result.savedReport).mountDiagnostic);
  assert.ok(result.report.error);
});

for (const [name, mutate] of [
  ["wrong owner", fixture => { fixture.inspection.labels[OWNER_LABEL] = "foreign"; }],
  ["wrong run", fixture => { fixture.inspection.labels[RUN_LABEL] = "foreign"; }],
  ["wrong name", fixture => { fixture.inspection.name = "foreign"; }],
  ["wrong ID", fixture => { fixture.inspection.id = "b".repeat(64); }],
  ["missing attempted ID", fixture => { fixture.expected.id = undefined; }],
  ["wrong kind", fixture => { fixture.inspection.kind = "image"; }],
]) test(`production agent path emits no trusted diagnostic for ${name}`, async () => {
  const fixture = agentFixture(); mutate(fixture);
  const result = await exerciseAgentPath(fixture);
  assert.deepEqual(result.events, ["cleanup", "persist"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.mountDiagnostic, null);
});

test("different daemon suppresses verification; verifier and cleanup failures remain nonzero", async () => {
  const wrongDaemon = await exerciseAgentPath(agentFixture(), { daemonId: "foreign-daemon" });
  assert.deepEqual(wrongDaemon.events, ["diagnostic", "daemon", "cleanup", "persist"]);
  assert.equal(wrongDaemon.exitCode, 1);
  assert.equal((await exerciseAgentPath(agentFixture(), { verifierError: "verification failed" })).exitCode, 1);
  assert.equal((await exerciseAgentPath(agentFixture(), { cleanupFailure: true })).exitCode, 1);
});

test("malformed collection/entries/fields are explicit and cannot authorize execution", async () => {
  for (const mounts of [null, {}, [null, {}]]) {
    const fixture = agentFixture(); fixture.inspection.raw.Mounts = mounts;
    fixture.inspection.raw.HostConfig.Binds = {};
    const result = await exerciseAgentPath(fixture);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.events, ["diagnostic", "cleanup", "persist"]);
    assert.ok(result.report.mountDiagnostic.malformed.length > 0);
    assert.ok(result.report.mountDiagnostic.malformed.includes("observedBinds"));
  }
});

test("every permitted dynamic string is redacted before bounding and absent from final production report", async () => {
  const fixture = agentFixture();
  const secret = "a".repeat(16), otherSecret = "credential-secret";
  fixture.expected.name = `agent-${otherSecret}`; fixture.inspection.name = fixture.expected.name;
  fixture.expected.run = `run-${otherSecret}`; fixture.inspection.labels[RUN_LABEL] = fixture.expected.run;
  fixture.expected.daemonId = `daemon-${otherSecret}`;
  fixture.expected.journalVolume = `journal-${otherSecret}`;
  fixture.inspection.raw.HostConfig.Binds = [`${otherSecret}:${otherSecret}`];
  fixture.inspection.raw.Mounts[0].Source = `${"x".repeat(245)}${otherSecret}`;
  fixture.inspection.raw.Mounts[0].Destination = otherSecret;
  fixture.inspection.raw.Mounts[1].Name = otherSecret;
  fixture.inspection.raw.Mounts[1].Destination = otherSecret;
  fixture.inspection.raw.Mounts.push({ Type: otherSecret, Destination: otherSecret });
  const result = await exerciseAgentPath(fixture, { secrets: [secret, otherSecret] });
  assert.equal(result.exitCode, 1);
  for (const value of [secret, otherSecret, otherSecret.slice(0, 11)]) assert.equal(result.savedReport.includes(value), false);
  assert.equal(result.report.mountDiagnostic.truncated.includes("mounts.0.source"), false);
  assert.equal(result.report.mountDiagnostic.mounts[0].source, `${"x".repeat(245)}[REDACTED]`);
  assert.ok(result.savedReport.includes("[REDACTED]"));
});

test("minimal child environment permits Docker plugin discovery but rejects ambient authority and credentials", () => {
  const input = { PATH: "tools", SystemRoot: "windows", TEMP: "temp", ProgramFiles: "programs", ProgramW6432: "programs64", DOCKER_CONFIG: "config",
    DOCKER_HOST: "tcp://remote:2375", DOCKER_CONTEXT: "remote", DOCKER_TLS_VERIFY: "1", DOCKER_CERT_PATH: "certs",
    MONGO_URI: "customer-db", JWT_SECRET: "secret", AXON_RELEASE_ID: "unrelated", USERPROFILE: "profile" };
  assert.deepEqual(buildHarnessEnvironment(input), { PATH: "tools", SystemRoot: "windows", TEMP: "temp", DOCKER_CONFIG: "config", ProgramFiles: "programs", ProgramW6432: "programs64" });
  assert.equal(input.DOCKER_HOST, "tcp://remote:2375");
  assert.deepEqual(buildHarnessEnvironment({}), {});
});

test("production Docker inspection recognizes only explicit missing-resource responses", async () => {
  for (const kind of ["container", "network", "volume", "image"]) {
    const missing = async () => ({ code: 1, stdout: "[]", stderr: `Error response from daemon: No such ${kind}: planned` });
    assert.equal(await inspectDockerResource(missing, kind, "planned", true), null);
    for (const stderr of ["permission denied", "Cannot connect to the Docker daemon", "", "Error: unrelated failure"]) {
      await assert.rejects(inspectDockerResource(async () => ({ code: 1, stdout: "[]", stderr }), kind, "planned", true), /absence is unconfirmed/);
    }
    await assert.rejects(inspectDockerResource(async () => ({ code: 1, stdout: "unexpected", stderr: `Error: No such ${kind}: planned` }), kind, "planned", true), /absence is unconfirmed/);
  }
  await assert.rejects(inspectDockerResource(async () => ({ code: 0, stdout: "[]", stderr: "" }), "container", "planned", true), /inspection is malformed/);
  const item = { Id: "a".repeat(64), Name: "/planned", Config: { Labels: labels() }, State: { Running: false } };
  const inspected = await inspectDockerResource(async () => ({ code: 0, stdout: JSON.stringify([item]), stderr: "" }), "container", "planned", true);
  assert.equal(inspected.id, item.Id);
  assert.equal(inspected.name, "planned");
});

function nestedFixture(options = {}) {
  const producerId = "a".repeat(64), nestedId = "b".repeat(64);
  const producer = { kind: "container", name: "agent", id: producerId, rawId: producerId, labels: labels(), raw: { State: { Running: true, Restarting: false }, HostConfig: { RestartPolicy: { Name: "no" } } } };
  const nested = { id: nestedId, rawId: nestedId, labels: { "com.axon.managed": "true", "com.axon.agent-id": "fixture-agent", "com.axon.release-id": "fixture-release" } };
  const ledger = { owner, run, releaseId: "fixture-release", attempted: [{ kind: "container", name: "agent", id: producerId }] };
  const events = []; let exists = !options.lateCreation, discoveryCount = 0;
  return { ledger, events, producer, nested, adapter: {
    producerNames: ["agent", "backend"], agentName: "agent",
    inspect: async (name) => {
      events.push(`inspect:${name}`);
      if (name === "agent") return producer;
      if (options.absenceError && !exists) throw new Error("daemon unavailable during final inspection");
      return exists ? nested : null;
    },
    stop: async () => {
      events.push("stop");
      if (options.failedStop) throw new Error("stop failed");
      producer.raw.State.Running = !!options.stillRunning;
      if (options.lateCreation) exists = true;
    },
    discover: async () => { events.push("discover"); discoveryCount++; return (exists || (options.finalMismatch && discoveryCount > 1)) ? [nestedId] : []; },
    save: async () => events.push("save"),
    remove: async (id) => { events.push(`remove:${id}`); exists = false; },
  } };
}

test("nested cleanup quiesces producers before inventory and catches late-created containers", async () => {
  const fixture = nestedFixture({ lateCreation: true });
  const result = await cleanupNestedResources(fixture.ledger, { agentId: "fixture-agent" }, fixture.adapter);
  assert.equal(result.ok, true);
  assert.deepEqual(result.deleted, [fixture.nested.id]);
  assert(fixture.events.indexOf("stop") < fixture.events.indexOf("discover"));
  assert(fixture.events.indexOf("save") < fixture.events.indexOf(`remove:${fixture.nested.id}`));
  assert.equal(fixture.events.filter(event => event === "discover").length, 2);
  assert.deepEqual(fixture.ledger.nestedOwned, [{ id: fixture.nested.id, rawId: fixture.nested.rawId }]);
});

test("nested cleanup refuses destruction after failed or unconfirmed producer stop", async () => {
  for (const option of ["failedStop", "stillRunning"]) {
    const fixture = nestedFixture({ [option]: true });
    const result = await cleanupNestedResources(fixture.ledger, { agentId: "fixture-agent" }, fixture.adapter);
    assert.equal(result.ok, false);
    assert.equal(fixture.events.includes("discover"), false);
    assert.equal(fixture.events.some(event => event.startsWith("remove:")), false);
  }
});

test("nested cleanup rejects label and producer-identity replacement", async () => {
  for (const mismatch of ["producer", "agent", "release", "managed"]) {
    const fixture = nestedFixture();
    if (mismatch === "producer") fixture.producer.id = "c".repeat(64);
    else fixture.nested.labels[`com.axon.${mismatch === "managed" ? "managed" : `${mismatch}-id`}`] = "wrong";
    const result = await cleanupNestedResources(fixture.ledger, { agentId: "fixture-agent" }, fixture.adapter);
    assert.equal(result.ok, false);
    assert.equal(fixture.events.some(event => event.startsWith("remove:")), false);
  }
});

test("nested cleanup propagates final inspection and independent inventory failures", async () => {
  for (const option of ["absenceError", "finalMismatch"]) {
    const fixture = nestedFixture({ [option]: true });
    const result = await cleanupNestedResources(fixture.ledger, { agentId: "fixture-agent" }, fixture.adapter);
    assert.equal(result.ok, false);
    assert.equal(finalExit(null, result), 1);
  }
});

test("nested cleanup accepts an untouched preflight but rejects attempted agents without identity", async () => {
  const fixture = nestedFixture();
  assert.equal((await cleanupNestedResources({ ...fixture.ledger, attempted: [] }, null, fixture.adapter)).ok, true);
  assert.equal((await cleanupNestedResources(fixture.ledger, null, fixture.adapter)).ok, false);
  assert.equal(fixture.events.includes("discover"), false);
});

test("early fixture failure still quiesces the runner with null agent state", async () => {
  for (const failedStop of [false, true]) {
    const fixture = nestedFixture({ failedStop });
    fixture.producer.name = "runner";
    fixture.ledger.attempted[0].name = "runner";
    fixture.adapter.producerNames = ["runner"];
    fixture.adapter.inspect = async name => { assert.equal(name, "runner"); return fixture.producer; };
    const result = await cleanupNestedResources(fixture.ledger, null, fixture.adapter);
    assert.equal(result.ok, !failedStop);
    assert.deepEqual(fixture.events, ["stop"]);
    assert.equal(fixture.producer.raw.State.Running, failedStop);
    if (failedStop) assert.equal(finalExit(null, result), 1);
  }
});

function labels() {
  return { [OWNER_LABEL]: owner, [RUN_LABEL]: run };
}

function composeConfig() {
  return {
    services: {
      mongodb: {
        image: "mongo:7", networks: ["approval"], ports: [{ host_ip: "127.0.0.1", published: 41001, target: 27017 }], labels: labels(),
        volumes: [{ type: "volume", source: "approval-mongodb", target: "/data/db" }, { type: "volume", source: "approval-mongodb-config", target: "/data/configdb" }],
      },
      redis: {
        image: "redis:7-alpine", networks: { approval: null }, ports: [{ host_ip: "127.0.0.1", published: 41002, target: 6379 }], labels: labels(),
        volumes: [{ type: "volume", source: "approval-redis", target: "/data" }],
      },
      backend: {
        image: "axon-approval-backend:test", networks: ["approval"], ports: [{ host_ip: "127.0.0.1", published: 41003, target: 3000 }], labels: labels(), volumes: [],
        environment: {
          AXON_EXECUTION_PROFILE: "pilot", AXON_RELEASE_ID: "approval-test", CORS_ALLOWED_ORIGINS: "http://127.0.0.1:41003",
          DISPATCH_SIGNING_KEY: "test", ENCRYPTION_KEY: "test", JWT_SECRET: "test", LOG_LEVEL: "warn",
          MONGO_URI: `mongodb://user:pass@mongodb:27017/${manifest.database}?authSource=admin`, NODE_ENV: "production",
          PORT: "3000", PROMETHEUS_BEARER_TOKEN: "test", REDIS_URI: "redis://redis:6379/15",
        },
      },
    },
    networks: { approval: { internal: true, labels: labels() } },
    volumes: { "approval-mongodb": { labels: labels() }, "approval-mongodb-config": { labels: labels() }, "approval-redis": { labels: labels() } },
  };
}

function expectedCompose() {
  return { owner, run, mongoPort: 41001, redisPort: 41002, backendPort: 41003, backendImage: "axon-approval-backend:test" };
}

test("internal Compose requires zero publications and exact named config storage", () => {
  const make = () => {
    const config = composeConfig();
    for (const service of Object.values(config.services)) service.ports = [];
    for (const [key, volume] of Object.entries(config.volumes)) volume.name = `owned-${key}`;
    return config;
  };
  const expected = { ...expectedCompose(), runnerMode: "internal", volumeNames: Object.fromEntries(Object.keys(make().volumes).map(key => [key, `owned-${key}`])) };
  assert.equal(validateEffectiveCompose(make(), expected), true);
  for (const mutate of [
    c => { c.services.backend.ports = ["3000:3000"]; },
    c => { c.services.mongodb.volumes.pop(); },
    c => { c.services.mongodb.volumes[1].source = "approval-mongodb"; },
    c => { c.services.mongodb.volumes.push({ type: "volume", source: "extra", target: "/extra" }); },
    c => { c.volumes["approval-mongodb-config"].name = "customer-volume"; },
    c => { c.volumes.extra = { labels: labels() }; },
  ]) { const config = make(); mutate(config); assert.throws(() => validateEffectiveCompose(config, expected)); }
});

test("data endpoint guard accepts only the isolated database and Redis DB", () => {
  assert.equal(validateDataEndpoints({
    mongoUri: `mongodb://u:p@127.0.0.1:41001/${manifest.database}?authSource=admin`,
    redisUri: "redis://127.0.0.1:41002/15",
    manifest,
  }), true);
  assert.throws(() => validateDataEndpoints({ mongoUri: `mongodb://u:p@localhost:41001/${manifest.database}?authSource=admin`, redisUri: "redis://127.0.0.1:41002/15", manifest }), /Mongo host\/port mismatch/);
  assert.throws(() => validateDataEndpoints({ mongoUri: "mongodb://u:p@127.0.0.1:41001/wrong?authSource=admin", redisUri: "redis://127.0.0.1:41002/15", manifest }), /Mongo database mismatch/);
  assert.throws(() => validateDataEndpoints({ mongoUri: `mongodb://u:p@127.0.0.1:41001/${manifest.database}?authSource=admin`, redisUri: "redis://127.0.0.1:41002/0", manifest }), /Redis database must be 15/);
});

test("fresh database guard rejects nonempty and malformed inspections", () => {
  assert.equal(assertFreshDatabase({ users: 0, jobs: 0 }), true);
  assert.throws(() => assertFreshDatabase({ users: 1 }), /Database is not empty: users/);
  assert.throws(() => assertFreshDatabase({ users: "0" }), /Database is not empty: users/);
  assert.throws(() => assertFreshDatabase([]), /malformed/);
});

test("preexisting resource guard rejects present and malformed entries", () => {
  assert.equal(assertNoPreexisting([{ kind: "container", name: "new", present: false }]), true);
  assert.throws(() => assertNoPreexisting([{ kind: "container", name: "old", present: true }]), /Refusing preexisting resources/);
  assert.throws(() => assertNoPreexisting([{ kind: "volume", name: "bad", present: "false" }]), /entry is malformed/);
});

test("effective Compose guard accepts only the expected isolated topology", () => {
  assert.equal(validateEffectiveCompose(composeConfig(), expectedCompose()), true);
  const unexpected = composeConfig();
  unexpected.services.extra = structuredClone(unexpected.services.redis);
  assert.throws(() => validateEffectiveCompose(unexpected, expectedCompose()), /exactly backend, mongodb, and redis/);
  const hostMount = composeConfig();
  hostMount.services.mongodb.volumes = [{ type: "bind", source: "C:/", target: "/data/db" }];
  assert.throws(() => validateEffectiveCompose(hostMount, expectedCompose()), /unexpected mounts/);
  const privileged = composeConfig();
  privileged.services.backend.privileged = true;
  assert.throws(() => validateEffectiveCompose(privileged, expectedCompose()), /must not be privileged/);
  const external = composeConfig();
  external.networks.approval.external = true;
  assert.throws(() => validateEffectiveCompose(external, expectedCompose()), /must not be external/);
  const wrongRun = composeConfig();
  wrongRun.services.redis.labels[RUN_LABEL] = "other";
  assert.throws(() => validateEffectiveCompose(wrongRun, expectedCompose()), /run label mismatch/);
  const unexpectedEnvironment = composeConfig();
  unexpectedEnvironment.services.backend.environment.SURPRISE_SINK = "https://example.invalid";
  assert.throws(() => validateEffectiveCompose(unexpectedEnvironment, expectedCompose()), /unexpected environment variables/);
});

test("owned inspection requires immutable ID or exact volume identity and both labels", () => {
  const container = { kind: "container", id: "a".repeat(64), name: "planned", labels: labels() };
  assert.equal(validateOwnedInspection(container, { owner, run, name: "planned" }), container.id);
  assert.throws(() => validateOwnedInspection({ ...container, id: "not-an-id" }, { owner, run, name: "planned" }), /ID is malformed/);
  assert.throws(() => validateOwnedInspection({ ...container, labels: { ...labels(), [OWNER_LABEL]: "other" } }, { owner, run, name: "planned" }), /owner label mismatch/);
  const volume = { kind: "volume", id: "planned-volume", name: "planned-volume", labels: labels() };
  assert.equal(validateOwnedInspection(volume, { owner, run, name: "planned-volume" }), "planned-volume");
  assert.throws(() => validateOwnedInspection({ ...volume, id: "different" }, { owner, run, name: "planned-volume" }), /identity mismatch/);
});

test("cleanup deletes only manifest-owned resources and reports partial or malformed creation", async () => {
  const owned = { kind: "container", id: "a".repeat(64), rawId: "a".repeat(64), name: "planned", labels: labels() };
  const changedOwner = { kind: "volume", id: "planned-volume", name: "planned-volume", labels: { ...labels(), [OWNER_LABEL]: "other" } };
  const outside = { kind: "container", id: "b".repeat(64), rawId: "b".repeat(64), name: "outside", labels: labels() };
  const attempted = [{ kind: "container", name: "planned", id: owned.id }, { kind: "volume", name: "never-created" }, { kind: "volume", name: "planned-volume", id: changedOwner.id }];
  const present = new Map([["container:planned", owned], ["volume:planned-volume", changedOwner], ["container:outside", outside]]);
  const removed = [];
  const result = await cleanupOwnedResources({ owner, run, attempted }, {
    discover: async () => [owned, changedOwner, outside],
    remove: async (resource) => { removed.push(`${resource.kind}:${resource.name}`); present.delete(`${resource.kind}:${resource.name}`); },
    exists: async (entry) => present.get(`${entry.kind}:${entry.name}`) ?? null,
  });
  assert.deepEqual(removed, ["container:planned"]);
  assert.deepEqual(result.deleted, ["container:planned"]);
  assert.deepEqual(result.outside, ["container:outside"]);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /owner label mismatch/);
  assert.match(result.failures.join("\n"), /volume:planned-volume:still-present/);
  assert.match(result.failures.join("\n"), /owned-labels-outside-manifest/);
  assert.equal(present.has("container:outside"), true, "outside-manifest resource must remain untouched");
});

test("cleanup refuses a same-name resource whose immutable identity changed", async () => {
  const originalId = "d".repeat(64);
  const replacement = { kind: "container", id: "e".repeat(64), rawId: "e".repeat(64), name: "planned", labels: labels() };
  const removed = [];
  const result = await cleanupOwnedResources({ owner, run, attempted: [{ kind: "container", name: "planned", id: originalId }] }, {
    discover: async () => [replacement],
    remove: async (resource) => removed.push(resource.id),
    exists: async () => replacement,
  });
  assert.deepEqual(removed, []);
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /Manifest resource identity mismatch/);
  assert.match(result.failures.join("\n"), /identity-changed/);
});

test("cleanup propagates remove and final absence-check failures", async () => {
  const resource = { kind: "image", id: "c".repeat(64), name: "planned-image", labels: labels() };
  const result = await cleanupOwnedResources({ owner, run, attempted: [{ kind: "image", name: "planned-image", id: resource.id }] }, {
    discover: async () => [resource],
    remove: async () => { throw new Error("remove failed"); },
    exists: async () => { throw new Error("inspect failed"); },
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /remove failed/);
  assert.match(result.failures.join("\n"), /absence-check:inspect failed/);
  assert.equal(finalExit(null, result), 1);
  assert.equal(finalExit(new Error("work failed"), { ok: true }), 1);
  assert.equal(finalExit(null, { ok: true }), 0);
});

test("native runner times out and redacts child secrets", async () => {
  await assert.rejects(runNative(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 50 }), /timed out/);
  const secret = "guard-secret-value";
  await assert.rejects(
    runNative(process.execPath, ["-e", "process.stderr.write(process.env.GUARD_SECRET); process.exit(7)"], { env: { ...process.env, GUARD_SECRET: secret }, secrets: [secret] }),
    (error) => error.message.includes("[REDACTED]") && !error.message.includes(secret),
  );
});

test("native stdin failures reject through caller finally without uncaught events", async () => {
  let cleaned = false;
  let failure;
  try {
    await runNative(process.execPath, ["-e", "require('node:fs').closeSync(0); setTimeout(() => process.exit(0), 100)"], {
      input: Buffer.alloc(8 * 1024 * 1024, 97), timeoutMs: 3_000,
    });
  } catch (error) { failure = error; } finally { cleaned = true; }
  assert.equal(cleaned, true);
  assert.match(failure?.message ?? "", /stdin failed/);
});

test("native stdin transport preserves exact bytes", async () => {
  const input = "private-test-input";
  const result = await runNative(process.execPath, ["-e", "const fs=require('node:fs'),crypto=require('node:crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(0)).digest('hex'))"], { input });
  const { createHash } = await import("node:crypto");
  assert.equal(result.stdout, createHash("sha256").update(input).digest("hex"));
  assert.equal(result.code, 0);
});

test("synchronous native stdin errors also reach caller cleanup", async () => {
  let cleaned = false;
  let failure;
  try {
    await runNative(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { input: {}, timeoutMs: 3_000 });
  } catch (error) { failure = error; } finally { cleaned = true; }
  assert.equal(cleaned, true);
  assert.match(failure?.message ?? "", /stdin failed/);
});

test("native runner uses a child-only environment without mutating the parent", async () => {
  const key = "AXON_APPROVAL_GUARD_ENV";
  const before = process.env[key];
  const result = await runNative(process.execPath, ["-e", `process.stdout.write(process.env.${key})`], { env: { ...process.env, [key]: "child-only" } });
  assert.equal(result.stdout, "child-only");
  assert.equal(process.env[key], before);
});

test("HTTP guard rejects redirects, times out, and never leaves loopback", async (t) => {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { location: "/ok" }); response.end(); return; }
    if (request.url === "/slow") return;
    response.writeHead(200, { "content-type": "application/json" }); response.end('{"ok":true}');
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const port = server.address().port;
  assert.deepEqual((await fetchJson(`http://127.0.0.1:${port}/ok`)).body, { ok: true });
  await assert.rejects(fetchJson(`http://127.0.0.1:${port}/redirect`), /Redirect rejected/);
  await assert.rejects(fetchJson(`http://127.0.0.1:${port}/slow`, {}, { timeoutMs: 50 }), /timed out/);
  await assert.rejects(fetchJson(`http://localhost:${port}/ok`), /exact loopback/);
});

test("private temporary directory guard rejects paths outside its namespace", async () => {
  const safe = await fs.mkdtemp(path.join(os.tmpdir(), "axon-approval-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "other-harness-"));
  try {
    assert.equal(await assertPrivateTempDirectory(safe), await fs.realpath(safe));
    await assert.rejects(assertPrivateTempDirectory(outside), /outside its private namespace/);
  } finally {
    await fs.rm(safe, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
