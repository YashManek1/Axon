#!/usr/bin/env node
// Bounded, independently authorized diagnostic. No Axon jobs, mounts or secrets.
import fs from "node:fs/promises";
import net from "node:net";
import { OWNER_LABEL, RUN_LABEL, makeNonce, invariant, runNative, buildHarnessEnvironment, inspectDockerResource, validateOwnedInspection } from "./approval-connected-agent-lib.mjs";

const nonce = makeNonce();
const owner = "axon-approval-network-probe";
const run = `probe-${nonce}`;
const network = `axonprobe${nonce}-network`;
const container = `axonprobe${nonce}-http`;
const reportPath = new URL(`../../.codex/evidence/connected-agent-20261004/network-${run}.json`, import.meta.url);
const docker = (args, options = {}) => runNative("docker", ["--context", "desktop-linux", ...args], { env: buildHarnessEnvironment(), timeoutMs: 20_000, ...options });
const report = { owner, run, network, container, attempted: [], cleanup: [], errors: [] };
async function save() { await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); }
async function inspect(kind, name, missing = false) { return inspectDockerResource(docker, kind, name, missing); }
async function record(kind, name) {
  const item = await inspect(kind, name);
  validateOwnedInspection(item, { owner, run, name });
  const entry = report.attempted.find(entry => entry.kind === kind && entry.name === name);
  invariant(!entry.id || entry.id === item.id, "Diagnostic resource changed identity");
  entry.id = item.id;
  await save();
  return item;
}
try {
  const info = JSON.parse((await docker(["info", "--format", "{{json .}}"])).stdout);
  invariant(info.OSType === "linux", "Probe requires Linux Docker");
  report.daemonId = info.ID;
  const image = await inspect("image", "node:22-alpine");
  invariant(Object.keys(image.raw.Config?.Volumes ?? {}).length === 0, "Probe image declares unexpected volumes");
  report.imageId = image.rawId;
  for (const [kind, name] of [["network", network], ["container", container]]) {
    invariant(await inspect(kind, name, true) === null, "Probe target already exists");
  }
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
  report.port = port;
  report.attempted.push({ kind: "network", name: network });
  await save();
  await docker(["network", "create", "--internal", "--driver", "bridge", "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`, network]);
  const networkItem = await record("network", network);
  invariant(networkItem.raw.Internal === true && networkItem.raw.Driver === "bridge", "Probe network differs");
  report.attempted.push({ kind: "container", name: container });
  await save();
  await docker(["container", "create", "--name", container, "--restart", "no", "--network", network,
    "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`, "--publish", `127.0.0.1:${port}:3000`,
    report.imageId, "node", "-e", "require('node:http').createServer((req,res)=>res.end('axon-probe')).listen(3000,'0.0.0.0')"]);
  const created = await record("container", container);
  invariant(created.raw.HostConfig.Privileged === false && created.raw.Mounts.length === 0, "Unexpected probe privilege/mounts");
  invariant(JSON.stringify(Object.keys(created.raw.NetworkSettings.Networks)) === JSON.stringify([network]), "Unexpected probe network");
  await docker(["container", "start", created.id]);
  const running = await record("container", container);
  invariant(running.raw.HostConfig.Privileged === false && running.raw.Mounts.length === 0, "Unexpected probe privilege/mounts");
  invariant(JSON.stringify(Object.keys(running.raw.NetworkSettings.Networks)) === JSON.stringify([network]), "Unexpected probe network");
  report.observed = { desiredBindings: running.raw.HostConfig.PortBindings, runtimePorts: running.raw.NetworkSettings.Ports, networks: Object.keys(running.raw.NetworkSettings.Networks) };
  const internal = await docker(["exec", running.id, "node", "-e", "fetch('http://127.0.0.1:3000',{signal:AbortSignal.timeout(5000)}).then(async r=>{if(await r.text()!=='axon-probe')process.exit(1)}).catch(()=>process.exit(1))"]);
  report.internalHealthExit = internal.code;
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    report.hostReachable = response.status === 200 && await response.text() === "axon-probe";
  } catch (error) { report.hostReachable = false; report.hostError = error.message; }
} catch (error) { report.errors.push(error.message); }
finally {
  for (const entry of [...report.attempted].reverse()) {
    try {
      const current = await inspect(entry.kind, entry.name, true);
      if (current) {
        validateOwnedInspection(current, { owner, run, name: entry.name });
        invariant(!entry.id || entry.id === current.id, "Probe cleanup identity changed");
        entry.id = current.id; // Reconcile a failed create only by exact name + both labels.
        await save();
        await docker(entry.kind === "container" ? ["container", "rm", "--force", entry.id] : ["network", "rm", entry.id]);
      }
      if (entry.id) invariant(await inspect(entry.kind, entry.id, true) === null, "Probe cleanup identity absence unconfirmed");
      invariant(await inspect(entry.kind, entry.name, true) === null, "Probe cleanup name absence unconfirmed");
      report.cleanup.push({ kind: entry.kind, name: entry.name, absent: true });
    } catch (error) { report.errors.push(`${entry.kind} cleanup: ${error.message}`); }
  }
  report.ok = report.errors.length === 0 && report.internalHealthExit === 0 && report.cleanup.length === report.attempted.length;
  await save();
  process.stdout.write(JSON.stringify({ report: reportPath.pathname, ok: report.ok, hostReachable: report.hostReachable, errors: report.errors }) + "\n");
  process.exitCode = report.ok ? 0 : 1;
}
