import test from "node:test";
import assert from "node:assert/strict";
import { OWNER_LABEL, RUN_LABEL } from "./approval-connected-agent-lib.mjs";
import { cleanupSocketProbe, validateSocketProbeInspection } from "./approval-socket-probe-lib.mjs";

const expected = { owner: "probe", run: "fresh", name: "freshprobe", imageId: "sha256:local" };
function candidate() {
  return { kind: "container", id: "a".repeat(64), name: expected.name,
    labels: { [OWNER_LABEL]: expected.owner, [RUN_LABEL]: expected.run },
    raw: { Image: expected.imageId, State: { Status: "created", Running: false, Restarting: false, StartedAt: "0001-01-01T00:00:00Z" },
      HostConfig: { Privileged: false, NetworkMode: "none", RestartPolicy: { Name: "no" }, PublishAllPorts: false, PortBindings: {},
        PidMode: "", IpcMode: "private", Binds: ["/var/run/docker.sock:/var/run/docker.sock"] },
      Config: { Healthcheck: { Test: ["NONE"] } },
      Mounts: [{ Type: "bind", Source: "/observed/socket", Destination: "/var/run/docker.sock", RW: true }] } };
}
test("partial creation without returned ID reconciles exact owned never-started container", async () => {
  const item = candidate(), removed = [], inspected = [];
  const result = await cleanupSocketProbe(expected, { checkDaemon: async () => {},
    inspect: async ref => { inspected.push(ref); return removed.length ? null : item; },
    remove: async id => removed.push(id) });
  assert.deepEqual(removed, [item.id]);
  assert.deepEqual(inspected, [expected.name, expected.name, item.id]);
  assert.equal(result.nameAbsent && result.idAbsent, true);
  assert.equal(validateSocketProbeInspection(item, expected).source, "/observed/socket");
});
const mutations = {
  image: x => x.raw.Image = "other", status: x => x.raw.State.Status = "exited",
  running: x => x.raw.State.Running = true, restarting: x => x.raw.State.Restarting = true,
  started: x => x.raw.State.StartedAt = "2026-10-06T00:00:00Z", owner: x => x.labels[OWNER_LABEL] = "other",
  run: x => x.labels[RUN_LABEL] = "other", name: x => x.name = "other",
  network: x => x.raw.HostConfig.NetworkMode = "host", privileged: x => x.raw.HostConfig.Privileged = true,
  restart: x => x.raw.HostConfig.RestartPolicy.Name = "always", health: x => x.raw.Config.Healthcheck.Test = ["CMD", "node"],
  ports: x => x.raw.HostConfig.PortBindings = { "80/tcp": [{}] }, publish: x => x.raw.HostConfig.PublishAllPorts = true,
  pid: x => x.raw.HostConfig.PidMode = "host", ipc: x => x.raw.HostConfig.IpcMode = "host",
  bind: x => x.raw.HostConfig.Binds = ["/other:/var/run/docker.sock"], extra: x => x.raw.Mounts.push(x.raw.Mounts[0]),
  type: x => x.raw.Mounts[0].Type = "volume", destination: x => x.raw.Mounts[0].Destination = "/other",
  readonly: x => x.raw.Mounts[0].RW = false,
};
for (const [name, mutate] of Object.entries(mutations)) test(`reject ${name} before removal even without returned ID`, async () => {
  const item = candidate(); mutate(item); let removed = false;
  await assert.rejects(cleanupSocketProbe(expected, { checkDaemon: async () => {}, inspect: async () => item, remove: async () => { removed = true; } }));
  assert.equal(removed, false);
});
test("reject immutable ID change before removal", async () => {
  let removed = false;
  await assert.rejects(cleanupSocketProbe({ ...expected, id: "b".repeat(64) }, {
    checkDaemon: async () => {}, inspect: async () => candidate(), remove: async () => { removed = true; } }));
  assert.equal(removed, false);
});
for (const failure of ["daemon", "remove", "absence"]) test(`${failure} uncertainty fails cleanup`, async () => {
  let removed = false;
  await assert.rejects(cleanupSocketProbe(expected, {
    checkDaemon: async () => { if (failure === "daemon") throw Error("changed daemon"); },
    inspect: async () => !removed || failure === "absence" ? candidate() : null,
    remove: async () => { if (failure === "remove") throw Error("failed removal"); removed = true; },
  }));
  if (failure === "daemon") assert.equal(removed, false);
});
