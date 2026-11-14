import { invariant, validateOwnedInspection } from "./approval-connected-agent-lib.mjs";

// The same gate protects diagnostic observations and exact-ID deletion.
export function validateSocketProbeInspection(item, expected) {
  validateOwnedInspection(item, expected);
  invariant(!expected.id || item.id === expected.id, "Probe immutable ID changed");
  const raw = item.raw;
  invariant(raw.Image === expected.imageId && raw.State?.Status === "created" && raw.State?.Running === false
    && raw.State?.Restarting === false && raw.State?.StartedAt === "0001-01-01T00:00:00Z", "Probe image or never-started state mismatch");
  invariant(raw.HostConfig?.Privileged === false && raw.HostConfig.NetworkMode === "none" && raw.HostConfig.RestartPolicy?.Name === "no"
    && !raw.HostConfig.PublishAllPorts && !Object.keys(raw.HostConfig.PortBindings ?? {}).length
    && !raw.HostConfig.PidMode && !raw.HostConfig.IpcMode?.startsWith("host")
    && JSON.stringify(raw.Config.Healthcheck?.Test) === '["NONE"]', "Probe containment mismatch");
  invariant(JSON.stringify(raw.HostConfig.Binds) === '["/var/run/docker.sock:/var/run/docker.sock"]'
    && raw.Mounts?.length === 1, "Probe requested socket bind changed");
  const actual = raw.Mounts[0];
  invariant(actual.Type === "bind" && actual.Destination === "/var/run/docker.sock" && actual.RW === true
    && typeof actual.Source === "string" && actual.Source.length > 0, "Probe socket mount malformed");
  return { type: actual.Type, source: actual.Source, destination: actual.Destination, rw: actual.RW };
}

export async function cleanupSocketProbe(expected, adapter) {
  await adapter.checkDaemon();
  const current = await adapter.inspect(expected.name);
  let id = expected.id, removedId = null;
  if (current) {
    validateSocketProbeInspection(current, expected);
    id ??= current.id;
    await adapter.remove(id);
    removedId = id;
  }
  const nameAbsent = await adapter.inspect(expected.name) === null;
  const idAbsent = id ? await adapter.inspect(id) === null : nameAbsent;
  invariant(nameAbsent && idAbsent, "Probe absence not confirmed");
  return { id, removedId, nameAbsent, idAbsent };
}
