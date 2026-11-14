import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { invariant, validateOwnedInspection } from "./approval-connected-agent-lib.mjs";

export const RUNNER_ROOT = "/tmp/axon-harness";
export const RUNNER_COMMAND = ["node", "-e", "setInterval(() => {}, 1000)"];
export const RUNNER_MODULES = ["approval-connected-agent.mjs", "approval-connected-agent-lib.mjs", "approval-connected-agent-fixture.mjs", "approval-connected-agent-verifier.mjs"];
export const RUNNER_PRIVATE_FILES = ["manifest.json", "state.json", "fixture.json", "acceptance.json"];
// Fixed paths only: a fresh non-root container must not have an existing harness.
export const RUNNER_BOOTSTRAP = `const fs=require('node:fs');const root='/tmp/axon-harness';try{fs.lstatSync(root);throw new Error('Harness root already exists')}catch(e){if(e.code!=='ENOENT')throw e}fs.mkdirSync(root,{mode:448});fs.mkdirSync(root+'/scripts');fs.mkdirSync(root+'/scripts/codex');fs.symlinkSync('/app',root+'/backend');`;
// Stdin preserves private bytes without root-owned docker-cp files or secret argv.
export const RUNNER_MANIFEST_INSTALL = `const fs=require('node:fs'),crypto=require('node:crypto');const root='/tmp/axon-harness',file=root+'/manifest.json',uid=process.getuid();const r=fs.lstatSync(root);if(uid===0||!r.isDirectory()||r.isSymbolicLink()||r.uid!==uid||(r.mode&511)!==448)throw Error('Unsafe harness root');const hash=process.argv[1];if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid manifest fingerprint');const bytes=fs.readFileSync(0);if(bytes.length>1048576||crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Manifest input mismatch');fs.writeFileSync(file,bytes,{flag:'wx',mode:384});const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==uid||(s.mode&511)!==384||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw Error('Private manifest install mismatch');`;

export function validateRunner(inspection, expected) {
  validateOwnedInspection(inspection, expected);
  invariant(inspection.id === expected.id, "Runner immutable ID mismatch");
  const raw = inspection.raw, host = raw.HostConfig ?? {}, config = raw.Config ?? {};
  invariant(raw.Image === expected.image, "Runner immutable image mismatch");
  invariant(config.User === "axon", "Runner must be non-root axon user");
  invariant(JSON.stringify(config.Cmd) === JSON.stringify(RUNNER_COMMAND), "Runner must use fixed inert command");
  invariant(JSON.stringify(config.Entrypoint) === JSON.stringify(expected.entrypoint), "Runner entrypoint mismatch");
  invariant(JSON.stringify([...(config.Env ?? [])].sort()) === JSON.stringify([...expected.environment].sort()), "Runner environment mismatch");
  invariant(JSON.stringify(config.Healthcheck?.Test) === '["NONE"]', "Runner inherited healthcheck must be disabled");
  invariant(host.RestartPolicy?.Name === "no" && !host.Privileged && !host.PidMode && [undefined, "", "private"].includes(host.IpcMode), "Runner privilege/restart/namespace mismatch");
  invariant(!host.Binds?.length && !host.VolumesFrom?.length && !raw.Mounts?.length, "Runner must have no mounts");
  invariant(!host.PublishAllPorts && !Object.keys(host.PortBindings ?? {}).length && Object.values(raw.NetworkSettings?.Ports ?? {}).every(value => value === null), "Runner must publish no ports");
  invariant(JSON.stringify(Object.keys(raw.NetworkSettings?.Networks ?? {})) === JSON.stringify([expected.network]), "Runner network mismatch");
  invariant(raw.State?.Running === true && raw.State?.Restarting === false, "Runner must be running without restart");
  return true;
}

// The copy helper is shared by the real adapter and offline negative tests.
export async function guardedCopy({ source, destination, direction, privateDir, scriptDir, sourceHashes, validate, copy }) {
  const moduleName = path.basename(source);
  const insideModule = `${RUNNER_ROOT}/scripts/codex/${moduleName}`;
  if (direction === "in-module") {
    invariant(RUNNER_MODULES.includes(moduleName) && path.resolve(source) === path.resolve(scriptDir, moduleName) && destination === insideModule, "Unexpected module copy path");
    const stat = await fs.lstat(source);
    invariant(stat.isFile() && !stat.isSymbolicLink(), "Module must be a regular non-symlink file");
    invariant(crypto.createHash("sha256").update(await fs.readFile(source)).digest("hex") === sourceHashes[moduleName], "Frozen module bytes changed");
  } else {
    invariant(direction === "in-private" || direction === "out-private", "Unexpected copy direction");
    const host = direction === "in-private" ? source : destination;
    const inside = direction === "in-private" ? destination : source;
    const name = path.basename(host);
    invariant(RUNNER_PRIVATE_FILES.includes(name) && path.resolve(host) === path.resolve(privateDir, name) && inside === `${RUNNER_ROOT}/${name}`, "Unexpected private copy path");
    if (direction === "in-private") {
      invariant(name === "manifest.json", "Only the manifest may be installed into the runner");
      const stat = await fs.lstat(host);
      invariant(stat.isFile() && !stat.isSymbolicLink(), "Private input must be a regular non-symlink file");
    } else {
      invariant(await fs.lstat(host).then(() => false, error => { if (error.code === "ENOENT") return true; throw error; }), "Private export destination must be absent");
    }
  }
  await validate();
  await copy(); // No fallback or retry after a native error.
}

const id = value => typeof value === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(value);
export function sanitizeReport(report, kind, manifest) {
  invariant(report && typeof report === "object" && !Array.isArray(report), "Malformed private report");
  if (kind === "fixture") {
    invariant(report.phase === "fixture-seeded" && report.database === manifest.database && id(report.agentId) && id(report.jobIds?.success) && id(report.jobIds?.exit7), "Fixture report identity mismatch");
    invariant(JSON.stringify(report.counts) === JSON.stringify({ organizations: 1, users: 1, agents: 1, jobs: 2 }), "Fixture counts mismatch");
    return { phase: report.phase, database: manifest.database, counts: { organizations: 1, users: 1, agents: 1, jobs: 2 }, agentId: report.agentId, jobIds: { success: report.jobIds.success, exit7: report.jobIds.exit7 } };
  }
  invariant(kind === "acceptance" && report.phase === "acceptance-complete-awaiting-owned-cleanup" && id(report.connectedAgentId) && Number.isSafeInteger(report.connectionGeneration) && report.connectionGeneration > 0, "Acceptance report identity mismatch");
  invariant(Array.isArray(report.scenarios) && report.scenarios.length === 2, "Acceptance scenarios missing");
  const scenarios = report.scenarios.map((row, index) => {
    const success = index === 0;
    invariant(row.scenario === (success ? "success" : "exit7") && row.status === (success ? "SUCCEEDED" : "FAILED") && row.exitCode === (success ? 0 : 7) && id(row.runId), "Scenario outcome mismatch");
    invariant(row.previewStatus === 201 && [200, 202].includes(row.approvalStatus) && row.replayStatus === 200 && row.outcome === "COMPLETED" && row.attempts === 1 && row.savedGet === true && row.duplicateRuns === false && row.duplicateHistory === false, "Scenario acceptance mismatch");
    invariant(["waiting", "active", "delayed"].every(key => row.quietQueue?.[key] === 0), "Scenario queue is not quiet");
    return { scenario: row.scenario, previewStatus: 201, approvalStatus: row.approvalStatus, replayStatus: 200, runId: row.runId, status: row.status, outcome: "COMPLETED", exitCode: row.exitCode, attempts: 1, savedGet: true, quietQueue: { waiting: 0, active: 0, delayed: 0 }, duplicateRuns: false, duplicateHistory: false };
  });
  return { phase: report.phase, connectedAgentId: report.connectedAgentId, connectionGeneration: report.connectionGeneration, scenarios };
}
