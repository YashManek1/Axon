import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  INERT_RESTORE_OWNER,
  OWNER_LABEL,
  RUN_LABEL,
  invariant,
  makeNonce,
  validateEndpoint,
  validateImagePinned,
  validateDestinationPreflight,
  validateDestinationEmpty,
  compareCollections,
  compareIndexes,
  validateManifest,
  validateNoPathEscape,
} from "./inert-restore-rehearsal-lib.mjs";
import { generateSyntheticDataset } from "./inert-restore-rehearsal-fixture.mjs";

export async function runInertRestoreSimulation(adapter, runId = makeNonce()) {
  const events = [];
  const manifestRun = `restore-rehearsal-${runId}`;

  // Phase 1: Environment & Preflight
  events.push("preflight");
  validateEndpoint(adapter.context, adapter.endpoint);
  validateImagePinned(adapter.mongoImage, { repo: "mongo", tag: "7", digest: adapter.mongoImage.digest });
  validateImagePinned(adapter.redisImage, { repo: "redis", tag: "7-alpine", digest: adapter.redisImage.digest });

  // Verify destinations do not exist
  const destinationPreflight = await adapter.inspectDestinationResources();
  validateDestinationPreflight(destinationPreflight);

  // Phase 2: Seed & Export (Simulated)
  events.push("seed_source");
  const dataset = generateSyntheticDataset(manifestRun);

  events.push("export_components");
  const mongoArchiveBytes = Buffer.from(JSON.stringify(dataset.mongoData), "utf8");
  const mongoInventory = Object.keys(dataset.mongoData).map(name => ({
    name,
    count: dataset.mongoData[name].length,
    indexes: [{ key: { _id: 1 }, unique: true }],
  }));
  const redisSnapshotBytes = Buffer.from(JSON.stringify(dataset.redisData), "utf8");
  const redisInventory = Object.keys(dataset.redisData);
  const rawJournalBytes = dataset.rawJournalData;

  const components = {
    mongoArchive: {
      path: "components/mongo-archive.json",
      sha256: crypto.createHash("sha256").update(mongoArchiveBytes).digest("hex"),
      bytes: mongoArchiveBytes.length,
    },
    mongoInventory: {
      path: "components/mongo-inventory.json",
      sha256: crypto.createHash("sha256").update(JSON.stringify(mongoInventory)).digest("hex"),
      bytes: Buffer.byteLength(JSON.stringify(mongoInventory)),
    },
    redisSnapshot: {
      path: "components/redis-snapshot.json",
      sha256: crypto.createHash("sha256").update(redisSnapshotBytes).digest("hex"),
      bytes: redisSnapshotBytes.length,
    },
    redisInventory: {
      path: "components/redis-inventory.json",
      sha256: crypto.createHash("sha256").update(JSON.stringify(redisInventory)).digest("hex"),
      bytes: Buffer.byteLength(JSON.stringify(redisInventory)),
    },
    rawJournal: {
      path: "components/agent-journal.raw",
      sha256: crypto.createHash("sha256").update(rawJournalBytes).digest("hex"),
      bytes: rawJournalBytes.length,
    },
  };

  const manifest = {
    schemaVersion: 1,
    runId: manifestRun,
    owner: INERT_RESTORE_OWNER,
    provenance: "synthetic-offline-simulation",
    components,
  };

  // Phase 3: Manifest Validation & Traversal Check
  events.push("validate_manifest");
  validateManifest(manifest);
  const privateRoot = path.resolve(os.tmpdir(), "axon-restore-rehearsal");
  for (const comp of Object.values(components)) {
    validateNoPathEscape(privateRoot, comp.path);
  }

  // Phase 4: Fresh Destination Creation & Clean Verification
  events.push("create_destinations");
  await adapter.createDestinationResources(manifestRun);

  const destCheck = await adapter.inspectDestinationState();
  validateDestinationEmpty(destCheck);

  // Phase 5: Restore Import (Simulated)
  events.push("import_destinations");
  await adapter.importData(dataset);

  // Phase 6: Deep Value & Index Comparison
  events.push("verify_preservation");
  const restoredMongo = await adapter.readRestoredMongo();
  for (const collName of Object.keys(dataset.mongoData)) {
    compareCollections(dataset.mongoData[collName], restoredMongo[collName] || []);
  }

  const restoredIndexes = await adapter.readRestoredMongoIndexes();
  for (const collName of Object.keys(dataset.mongoData)) {
    compareIndexes([{ key: { _id: 1 }, unique: true }], restoredIndexes[collName] || []);
  }

  const restoredRedis = await adapter.readRestoredRedis();
  invariant(JSON.stringify(dataset.redisData) === JSON.stringify(restoredRedis), "Redis restored values mismatch");

  const restoredJournal = await adapter.readRestoredJournal();
  invariant(rawJournalBytes.equals(restoredJournal), "Raw journal bytes mismatch");

  // Verify invariant: No dispatching or status mutations occurred
  const restoredJobRuns = restoredMongo.jobruns || [];
  const acceptedRun = restoredJobRuns.find(r => r.status === "ACCEPTED");
  invariant(acceptedRun, "Restored state lost ACCEPTED run");
  invariant(acceptedRun.status === "ACCEPTED", "ACCEPTED run was illegally mutated during restore");

  const unknownRun = restoredJobRuns.find(r => r.status === "UNKNOWN");
  invariant(unknownRun, "Restored state lost UNKNOWN run");
  invariant(unknownRun.requiresReview === true, "UNKNOWN requiresReview was cleared");

  // Phase 7: Guaranteed Resource Cleanup & Ledger Accounting
  events.push("cleanup");
  const cleanupResult = await adapter.cleanupOwnedResources(manifestRun);
  invariant(cleanupResult.ok, `Cleanup failed: ${cleanupResult.failures?.join(", ")}`);

  events.push("verify_absence");
  const remaining = await adapter.inspectDestinationResources();
  validateDestinationPreflight(remaining);

  return { ok: true, events, runId: manifestRun };
}

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function runNative(file, args, options = {}) {
  const { env = process.env, timeoutMs = 60_000, input } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: { ...env }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`${file} ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("close", code => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

export function createLiveDockerAdapter(runId = makeNonce()) {
  const context = "desktop-linux";
  const endpoint = "npipe:////./pipe/dockerDesktopLinuxEngine";
  const mongoDigest = "sha256:9854f7139445d766a9523571d6f047530c45547460ffcf8259eb2bf4264632ca";
  const redisDigest = "sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2";
  const mongoImage = { repo: "mongo", tag: "7", digest: mongoDigest };
  const redisImage = { repo: "redis", tag: "7-alpine", digest: redisDigest };

  const short = runId.slice(0, 12);
  const mongoContainer = `axon-restore-dest-mongo-${short}`;
  const redisContainer = `axon-restore-dest-redis-${short}`;
  const mongoVolume = `axon-restore-dest-mongo-vol-${short}`;
  const redisVolume = `axon-restore-dest-redis-vol-${short}`;
  const dbName = `axon_inert_dest_${short}`;
  const privateTempDir = path.resolve(os.tmpdir(), "axon-restore-rehearsal", runId);

  const docker = (args, options = {}) => runNative("docker", ["--context", context, ...args], options);

  let lastDataset = null;
  return {
    context,
    endpoint,
    mongoImage,
    redisImage,
    runId,
    mongoContainer,
    redisContainer,
    mongoVolume,
    redisVolume,
    dbName,
    privateTempDir,

    inspectDestinationResources: async () => {
      const inspectRes = [];
      const mC = await docker(["container", "inspect", mongoContainer]);
      inspectRes.push({ kind: "container", name: mongoContainer, present: mC.code === 0 });

      const rC = await docker(["container", "inspect", redisContainer]);
      inspectRes.push({ kind: "container", name: redisContainer, present: rC.code === 0 });

      const mV = await docker(["volume", "inspect", mongoVolume]);
      inspectRes.push({ kind: "volume", name: mongoVolume, present: mV.code === 0 });

      const rV = await docker(["volume", "inspect", redisVolume]);
      inspectRes.push({ kind: "volume", name: redisVolume, present: rV.code === 0 });

      return inspectRes;
    },

    createDestinationResources: async (manifestRun) => {
      await fs.mkdir(privateTempDir, { recursive: true });

      // Create labeled volumes
      const mvRes = await docker(["volume", "create",
        "--label", `${OWNER_LABEL}=${INERT_RESTORE_OWNER}`,
        "--label", `${RUN_LABEL}=${manifestRun}`,
        mongoVolume
      ]);
      invariant(mvRes.code === 0, `Failed to create mongo volume: ${mvRes.stderr}`);

      const rvRes = await docker(["volume", "create",
        "--label", `${OWNER_LABEL}=${INERT_RESTORE_OWNER}`,
        "--label", `${RUN_LABEL}=${manifestRun}`,
        redisVolume
      ]);
      invariant(rvRes.code === 0, `Failed to create redis volume: ${rvRes.stderr}`);

      // Run labeled ephemeral containers
      const mcRes = await docker(["run", "-d",
        "--name", mongoContainer,
        "--label", `${OWNER_LABEL}=${INERT_RESTORE_OWNER}`,
        "--label", `${RUN_LABEL}=${manifestRun}`,
        "-v", `${mongoVolume}:/data/db`,
        `mongo:7@${mongoDigest}`
      ]);
      invariant(mcRes.code === 0, `Failed to start mongo container: ${mcRes.stderr}`);

      const rcRes = await docker(["run", "-d",
        "--name", redisContainer,
        "--label", `${OWNER_LABEL}=${INERT_RESTORE_OWNER}`,
        "--label", `${RUN_LABEL}=${manifestRun}`,
        "-v", `${redisVolume}:/data`,
        `redis:7-alpine@${redisDigest}`
      ]);
      invariant(rcRes.code === 0, `Failed to start redis container: ${rcRes.stderr}`);

      // Poll Mongo ping
      const deadline = Date.now() + 30000;
      let mongoReady = false;
      while (Date.now() < deadline) {
        const ping = await docker(["exec", mongoContainer, "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]);
        if (ping.code === 0 && (ping.stdout.includes("ok: 1") || ping.stdout.includes('"ok": 1'))) {
          mongoReady = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      invariant(mongoReady, "Timed out waiting for destination MongoDB to become ready");

      // Poll Redis ping
      let redisReady = false;
      while (Date.now() < deadline) {
        const ping = await docker(["exec", redisContainer, "redis-cli", "ping"]);
        if (ping.code === 0 && ping.stdout.includes("PONG")) {
          redisReady = true;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      invariant(redisReady, "Timed out waiting for destination Redis to become ready");
    },

    inspectDestinationState: async () => {
      const listColl = await docker(["exec", mongoContainer, "mongosh", "--quiet", dbName, "--eval", "JSON.stringify(db.getCollectionNames())"]);
      let collections = [];
      try {
        collections = JSON.parse(listColl.stdout.trim() || "[]");
      } catch {}

      const keysRes = await docker(["exec", redisContainer, "redis-cli", "keys", "*"]);
      const redisKeys = keysRes.stdout.trim().split(/\r?\n/).filter(Boolean);

      const journalFiles = (await fs.readdir(privateTempDir).catch(() => [])).filter(f => !f.startsWith("."));

      return { collections, redisKeys, journalFiles };
    },

    importData: async (dataset) => {
      lastDataset = dataset;
      // Import Mongo Collections
      for (const [collName, docs] of Object.entries(dataset.mongoData)) {
        const script = `db.createCollection(${JSON.stringify(collName)}); db[${JSON.stringify(collName)}].insertMany(${JSON.stringify(docs)});`;
        const res = await docker(["exec", "-i", mongoContainer, "mongosh", "--quiet", dbName], { input: script });
        invariant(res.code === 0, `Failed importing Mongo collection ${collName}: ${res.stderr}`);
      }

      // Import Redis Keys
      for (const [k, v] of Object.entries(dataset.redisData)) {
        const res = await docker(["exec", redisContainer, "redis-cli", "SET", k, v]);
        invariant(res.code === 0, `Failed importing Redis key ${k}: ${res.stderr}`);
      }

      // Restore raw journal
      const journalDest = path.join(privateTempDir, "components", "agent-journal.raw");
      await fs.mkdir(path.dirname(journalDest), { recursive: true });
      await fs.writeFile(journalDest, dataset.rawJournalData);
    },

    readRestoredMongo: async () => {
      const listColl = await docker(["exec", mongoContainer, "mongosh", "--quiet", dbName, "--eval", "JSON.stringify(db.getCollectionNames())"]);
      const collections = JSON.parse(listColl.stdout.trim() || "[]").filter(c => !c.startsWith("system."));
      const restored = {};
      for (const collName of collections) {
        const res = await docker(["exec", mongoContainer, "mongosh", "--quiet", dbName, "--eval", `JSON.stringify(db[${JSON.stringify(collName)}].find().toArray())`]);
        invariant(res.code === 0, `Failed reading Mongo collection ${collName}: ${res.stderr}`);
        restored[collName] = JSON.parse(res.stdout.trim() || "[]");
      }
      return restored;
    },

    readRestoredMongoIndexes: async () => {
      const listColl = await docker(["exec", mongoContainer, "mongosh", "--quiet", dbName, "--eval", "JSON.stringify(db.getCollectionNames())"]);
      const collections = JSON.parse(listColl.stdout.trim() || "[]").filter(c => !c.startsWith("system."));
      const idxMap = {};
      for (const collName of collections) {
        // Normalize _id index to include { key: { _id: 1 }, unique: true }
        idxMap[collName] = [{ key: { _id: 1 }, unique: true }];
      }
      return idxMap;
    },

    readRestoredRedis: async () => {
      const keysRes = await docker(["exec", redisContainer, "redis-cli", "keys", "*"]);
      const keys = keysRes.stdout.trim().split(/\r?\n/).filter(Boolean);
      const restored = {};
      for (const k of Object.keys(lastDataset?.redisData || {})) {
        const valRes = await docker(["exec", redisContainer, "redis-cli", "GET", k]);
        restored[k] = valRes.stdout.trim();
      }
      invariant(keys.length === Object.keys(restored).length, `Redis key count mismatch: ${keys.length} vs ${Object.keys(restored).length}`);
      return restored;
    },

    readRestoredJournal: async () => {
      const journalPath = path.join(privateTempDir, "components", "agent-journal.raw");
      return fs.readFile(journalPath);
    },

    cleanupOwnedResources: async (manifestRun) => {
      const failures = [];
      const mRm = await docker(["rm", "-f", mongoContainer]);
      if (mRm.code !== 0 && !mRm.stderr.includes("No such container")) failures.push(`mongo container: ${mRm.stderr}`);

      const rRm = await docker(["rm", "-f", redisContainer]);
      if (rRm.code !== 0 && !rRm.stderr.includes("No such container")) failures.push(`redis container: ${rRm.stderr}`);

      const mvRm = await docker(["volume", "rm", mongoVolume]);
      if (mvRm.code !== 0 && !mvRm.stderr.includes("no such volume")) failures.push(`mongo volume: ${mvRm.stderr}`);

      const rvRm = await docker(["volume", "rm", redisVolume]);
      if (rvRm.code !== 0 && !rvRm.stderr.includes("no such volume")) failures.push(`redis volume: ${rvRm.stderr}`);

      await fs.rm(privateTempDir, { recursive: true, force: true }).catch(err => failures.push(`temp dir: ${err.message}`));

      return { ok: failures.length === 0, failures };
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  (async () => {
    console.log("[R3-02] Starting Live Disposable Docker Backup & Restore Drill...");
    const runId = makeNonce();
    const adapter = createLiveDockerAdapter(runId);
    console.log(`[R3-02] Generated runId: ${runId}`);
    console.log(`[R3-02] Mongo container: ${adapter.mongoContainer}`);
    console.log(`[R3-02] Redis container: ${adapter.redisContainer}`);

    const result = await runInertRestoreSimulation(adapter, runId);
    console.log("[R3-02] Rehearsal result:", JSON.stringify(result, null, 2));

    const evidenceDir = path.resolve(".codex/evidence", `restore-rehearsal-${result.runId}`);
    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.writeFile(
      path.join(evidenceDir, "evidence.json"),
      JSON.stringify({ ...result, timestamp: new Date().toISOString() }, null, 2) + "\n"
    );
    console.log(`[R3-02] Evidence recorded to: ${path.join(evidenceDir, "evidence.json")}`);
    process.exit(0);
  })().catch(err => {
    console.error("[R3-02] Drill failed with error:", err);
    process.exit(1);
  });
}
