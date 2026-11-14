// Diagnostic only: never starts or executes the container; exports no environment.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OWNER_LABEL, RUN_LABEL, buildHarnessEnvironment, inspectDockerResource, invariant, makeNonce, redact, runNative } from "./approval-connected-agent-lib.mjs";
import { cleanupSocketProbe, validateSocketProbeInspection } from "./approval-socket-probe-lib.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const owner = "axon-approval-socket-probe", run = makeNonce();
const name = `axonsocketprobe${run}`, context = "desktop-linux";
const expectedDaemon = "ff2bc588-16ec-43a4-9702-a16c70975481";
const reportPath = path.join(repo, ".codex/evidence/connected-agent-20261004", `socket-probe-${run}.json`);
const docker = (args, options = {}) => runNative("docker", ["--context", context, ...args], { cwd: repo, env: buildHarnessEnvironment(), timeoutMs: 20_000, ...options });
const inspect = (kind, ref, missing = false) => inspectDockerResource(docker, kind, ref, missing);
const checkDaemon = async () => invariant((await docker(["info", "--format", "{{.ID}}"])).stdout.trim() === expectedDaemon, "Probe daemon changed");
let attempted = false, id, imageId, mount, error;
const cleanup = { ok: false, removedId: null, nameAbsent: false, idAbsent: false, failures: [] };

const validate = item => validateSocketProbeInspection(item, { owner, run, name, id, imageId });

try {
  await checkDaemon();
  invariant(await inspect("container", name, true) === null, "Probe name already exists");
  const image = await inspect("image", "node:22-alpine");
  invariant(!Object.keys(image.raw.Config?.Volumes ?? {}).length, "Probe image declares volumes");
  imageId = image.raw.Id;
  attempted = true;
  const created = await docker(["container", "create", "--name", name, "--network", "none", "--restart", "no", "--no-healthcheck",
    "--label", `${OWNER_LABEL}=${owner}`, "--label", `${RUN_LABEL}=${run}`,
    "--volume", "/var/run/docker.sock:/var/run/docker.sock", imageId, "node", "-e", "process.exit(0)"]);
  id = created.stdout.trim();
  invariant(/^[0-9a-f]{64}$/.test(id), "Probe creation identity malformed");
  const item = await inspect("container", id);
  mount = validate(item);
} catch (failure) { error = redact(failure.stack ?? failure.message); }
finally {
  try {
    await checkDaemon();
    if (attempted) {
      // Reconcile partial creation by exact name and ownership, never an inventory sweep.
      const result = await cleanupSocketProbe({ owner, run, name, id, imageId }, {
        checkDaemon, inspect: ref => inspect("container", ref, true), remove: ref => docker(["container", "rm", ref]),
      });
      id = result.id;
      Object.assign(cleanup, { removedId: result.removedId, nameAbsent: result.nameAbsent, idAbsent: result.idAbsent });
    }
    cleanup.ok = true;
  } catch (failure) { cleanup.failures.push(redact(failure.message)); }
  await fs.writeFile(reportPath, JSON.stringify({ owner, run, name, id, imageId, daemonId: expectedDaemon, requestedBind: "/var/run/docker.sock:/var/run/docker.sock", neverStarted: Boolean(mount), mount, error, cleanup }, null, 2) + "\n", { flag: "wx" });
}
process.stdout.write(`${reportPath}\n`);
if (error) process.stderr.write(`${error}\n`);
process.exitCode = error || !cleanup.ok ? 1 : 0;
