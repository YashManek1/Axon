import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const INERT_RESTORE_OWNER = "axon-inert-restore-rehearsal";
export const OWNER_LABEL = "com.axon.restore.owner";
export const RUN_LABEL = "com.axon.restore.run";

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function makeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

export function redact(value, secrets = []) {
  let text = String(value ?? "");
  for (const secret of secrets.filter(Boolean).map(String).sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/(authorization\s*[:=]\s*)([^\s,}]+)/gi, "$1[REDACTED]");
}

export function buildInertEnvironment(environment = process.env) {
  const allowed = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "DOCKER_CONFIG", "ProgramFiles", "ProgramW6432"];
  const filtered = Object.fromEntries(allowed.filter(key => environment[key] !== undefined).map(key => [key, environment[key]]));
  const forbiddenOverrides = [
    "DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH",
    "MONGO_URI", "REDIS_URI", "JWT_SECRET", "ENCRYPTION_KEY",
  ];
  for (const forbidden of forbiddenOverrides) {
    if (environment[forbidden]) {
      throw new Error(`Ambient override detected: ${forbidden} is forbidden in harness environment`);
    }
  }
  return filtered;
}

export function validateEndpoint(context, endpoint) {
  invariant(context === "desktop-linux", `Context mismatch: expected desktop-linux, got ${context}`);
  const validEndpoints = [
    "npipe:////./pipe/dockerDesktopLinuxEngine",
    "unix:///var/run/docker.sock"
  ];
  invariant(validEndpoints.includes(endpoint), `Endpoint mismatch or external daemon: ${endpoint}`);
  return true;
}

export function validateImagePinned(image, expected) {
  invariant(image && typeof image === "object", "Image descriptor is malformed");
  invariant(image.repo === expected.repo, `Image repo mismatch: ${image.repo} != ${expected.repo}`);
  invariant(image.tag === expected.tag, `Image tag mismatch: ${image.tag} != ${expected.tag}`);
  invariant(typeof image.digest === "string" && /^sha256:[0-9a-f]{64}$/.test(image.digest), "Image digest missing or malformed");
  if (expected.digest) {
    invariant(image.digest === expected.digest, `Image digest mismatch: ${image.digest} != ${expected.digest}`);
  }
  return true;
}

export function validateDestinationPreflight(destinationResources) {
  invariant(Array.isArray(destinationResources), "Destination resources must be an array");
  for (const res of destinationResources) {
    invariant(!res.present, `Destination resource already exists: ${res.kind}:${res.name}`);
  }
  return true;
}

export function validateDestinationEmpty({ collections = [], redisKeys = [], journalFiles = [] }) {
  invariant(Array.isArray(collections), "Collections must be an array");
  const appCollections = collections.filter(c => !c.startsWith("system."));
  invariant(appCollections.length === 0, `Destination Mongo has preexisting application collections: ${appCollections.join(", ")}`);

  invariant(Array.isArray(redisKeys), "Redis keys must be an array");
  invariant(redisKeys.length === 0, `Destination Redis has preexisting keys: ${redisKeys.length}`);

  invariant(Array.isArray(journalFiles), "Journal files must be an array");
  invariant(journalFiles.length === 0, `Destination Journal has preexisting files: ${journalFiles.length}`);

  return true;
}

export function canonicalizeBson(doc) {
  if (doc === null || typeof doc !== "object") return doc;
  if (Array.isArray(doc)) return doc.map(canonicalizeBson);
  const keys = Object.keys(doc).sort();
  const sorted = {};
  for (const k of keys) {
    sorted[k] = canonicalizeBson(doc[k]);
  }
  return sorted;
}

export function compareCollections(sourceDocs, targetDocs) {
  invariant(sourceDocs.length === targetDocs.length, `Document count mismatch: source=${sourceDocs.length}, target=${targetDocs.length}`);
  const sourceCanonical = sourceDocs.map(canonicalizeBson).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const targetCanonical = targetDocs.map(canonicalizeBson).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  for (let i = 0; i < sourceCanonical.length; i++) {
    const sStr = JSON.stringify(sourceCanonical[i]);
    const tStr = JSON.stringify(targetCanonical[i]);
    invariant(sStr === tStr, `Document mismatch at index ${i}: ${sStr} != ${tStr}`);
  }
  return true;
}

export function compareIndexes(sourceIndexes, targetIndexes) {
  invariant(sourceIndexes.length === targetIndexes.length, `Index count mismatch: ${sourceIndexes.length} != ${targetIndexes.length}`);
  const sortKey = idx => JSON.stringify(idx.key) + (idx.unique ? ":unique" : "");
  const sSorted = [...sourceIndexes].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const tSorted = [...targetIndexes].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  for (let i = 0; i < sSorted.length; i++) {
    const s = sSorted[i];
    const t = tSorted[i];
    invariant(JSON.stringify(s.key) === JSON.stringify(t.key), `Index key order/fields mismatch: ${JSON.stringify(s.key)} != ${JSON.stringify(t.key)}`);
    invariant(Boolean(s.unique) === Boolean(t.unique), `Index uniqueness mismatch on ${JSON.stringify(s.key)}`);
    invariant(Boolean(s.sparse) === Boolean(t.sparse), `Index sparse mismatch on ${JSON.stringify(s.key)}`);
  }
  return true;
}

export function validateManifest(manifest, rawManifestBytes) {
  invariant(manifest && typeof manifest === "object", "Manifest is malformed");
  invariant(manifest.schemaVersion === 1, `Unsupported manifest schemaVersion: ${manifest.schemaVersion}`);
  invariant(typeof manifest.runId === "string" && manifest.runId.length > 0, "Manifest runId missing");
  invariant(manifest.components && typeof manifest.components === "object", "Manifest components missing");

  const required = ["mongoArchive", "mongoInventory", "redisSnapshot", "redisInventory", "rawJournal"];
  for (const req of required) {
    invariant(manifest.components[req], `Missing mandatory manifest component: ${req}`);
    const comp = manifest.components[req];
    invariant(typeof comp.path === "string" && !path.isAbsolute(comp.path), `Component path must be relative: ${comp.path}`);
    invariant(!comp.path.includes(".."), `Component path traversal forbidden: ${comp.path}`);
    invariant(typeof comp.sha256 === "string" && /^[0-9a-f]{64}$/.test(comp.sha256), `Component sha256 malformed: ${comp.sha256}`);
    invariant(typeof comp.bytes === "number" && comp.bytes >= 0, `Component byte count invalid: ${comp.bytes}`);
  }

  if (rawManifestBytes) {
    const computedHash = crypto.createHash("sha256").update(rawManifestBytes).digest("hex");
    invariant(manifest.manifestSha256 === computedHash, "Manifest self-checksum mismatch");
  }
  return true;
}

export function validateNoPathEscape(baseDir, relativePath) {
  const normalizedBase = path.resolve(baseDir);
  const resolved = path.resolve(normalizedBase, relativePath);
  invariant(resolved.startsWith(normalizedBase + path.sep), `Path escape or traversal detected: ${relativePath}`);
  return resolved;
}

export async function assertPrivateDirectory(candidate) {
  const resolved = await fs.realpath(candidate);
  const stat = await fs.lstat(candidate);
  invariant(stat.isDirectory() && !stat.isSymbolicLink(), "Directory must be a real directory, not symlink");
  return resolved;
}
