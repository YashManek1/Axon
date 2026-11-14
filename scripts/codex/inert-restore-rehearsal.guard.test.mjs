import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import path from "node:path";
import {
  INERT_RESTORE_OWNER,
  validateEndpoint,
  validateImagePinned,
  validateDestinationPreflight,
  validateDestinationEmpty,
  compareCollections,
  compareIndexes,
  validateManifest,
  validateNoPathEscape,
  buildInertEnvironment,
} from "./inert-restore-rehearsal-lib.mjs";
import { generateSyntheticDataset } from "./inert-restore-rehearsal-fixture.mjs";
import { runInertRestoreSimulation } from "./inert-restore-rehearsal.mjs";

test("environment guard rejects ambient docker or database overrides", () => {
  assert.throws(
    () => buildInertEnvironment({ ...process.env, DOCKER_HOST: "tcp://192.168.1.50:2375" }),
    /Ambient override detected: DOCKER_HOST/
  );
  assert.throws(
    () => buildInertEnvironment({ ...process.env, MONGO_URI: "mongodb://production-cluster:27017" }),
    /Ambient override detected: MONGO_URI/
  );
  assert.throws(
    () => buildInertEnvironment({ ...process.env, REDIS_URI: "redis://production-redis:6379" }),
    /Ambient override detected: REDIS_URI/
  );
  const clean = buildInertEnvironment({ PATH: "C:\\Windows", SystemRoot: "C:\\Windows" });
  assert.equal(clean.PATH, "C:\\Windows");
});

test("endpoint guard requires local desktop-linux daemon", () => {
  assert.ok(validateEndpoint("desktop-linux", "npipe:////./pipe/dockerDesktopLinuxEngine"));
  assert.ok(validateEndpoint("desktop-linux", "unix:///var/run/docker.sock"));
  assert.throws(
    () => validateEndpoint("remote-linux", "npipe:////./pipe/dockerDesktopLinuxEngine"),
    /Context mismatch/
  );
  assert.throws(
    () => validateEndpoint("desktop-linux", "tcp://external-host:2375"),
    /Endpoint mismatch or external daemon/
  );
});

test("image pinning guard rejects unpinned or mismatched digests", () => {
  const digest = "sha256:" + "a".repeat(64);
  assert.ok(validateImagePinned({ repo: "mongo", tag: "7", digest }, { repo: "mongo", tag: "7", digest }));
  assert.throws(
    () => validateImagePinned({ repo: "mongo", tag: "8", digest }, { repo: "mongo", tag: "7" }),
    /Image tag mismatch/
  );
  assert.throws(
    () => validateImagePinned({ repo: "mongo", tag: "7", digest: "sha256:" + "b".repeat(64) }, { repo: "mongo", tag: "7", digest }),
    /Image digest mismatch/
  );
});

test("preflight guard refuses preexisting destination resources", () => {
  assert.ok(validateDestinationPreflight([
    { kind: "container", name: "dest-mongo", present: false },
    { kind: "volume", name: "dest-vol", present: false }
  ]));
  assert.throws(
    () => validateDestinationPreflight([
      { kind: "container", name: "dest-mongo", present: true }
    ]),
    /Destination resource already exists/
  );
});

test("fresh destination verification refuses nonempty collections or keys", () => {
  assert.ok(validateDestinationEmpty({ collections: ["system.views"], redisKeys: [], journalFiles: [] }));
  assert.throws(
    () => validateDestinationEmpty({ collections: ["organizations"], redisKeys: [], journalFiles: [] }),
    /Destination Mongo has preexisting application collections/
  );
  assert.throws(
    () => validateDestinationEmpty({ collections: [], redisKeys: ["some-key"], journalFiles: [] }),
    /Destination Redis has preexisting keys/
  );
  assert.throws(
    () => validateDestinationEmpty({ collections: [], redisKeys: [], journalFiles: ["journal.bin"] }),
    /Destination Journal has preexisting files/
  );
});

test("manifest guard enforces version, mandatory components, and relative paths without traversal", () => {
  const base = {
    schemaVersion: 1,
    runId: "run-123",
    components: {
      mongoArchive: { path: "a.json", sha256: "0".repeat(64), bytes: 10 },
      mongoInventory: { path: "b.json", sha256: "0".repeat(64), bytes: 10 },
      redisSnapshot: { path: "c.json", sha256: "0".repeat(64), bytes: 10 },
      redisInventory: { path: "d.json", sha256: "0".repeat(64), bytes: 10 },
      rawJournal: { path: "e.raw", sha256: "0".repeat(64), bytes: 10 },
    }
  };
  assert.ok(validateManifest(base));

  // Traversal rejected
  const traversal = JSON.parse(JSON.stringify(base));
  traversal.components.mongoArchive.path = "../escape.json";
  assert.throws(() => validateManifest(traversal), /Component path traversal forbidden/);

  // Absolute path rejected
  const abs = JSON.parse(JSON.stringify(base));
  abs.components.rawJournal.path = "/etc/shadow";
  assert.throws(() => validateManifest(abs), /Component path must be relative/);

  // Missing component rejected
  const missing = JSON.parse(JSON.stringify(base));
  delete missing.components.rawJournal;
  assert.throws(() => validateManifest(missing), /Missing mandatory manifest component: rawJournal/);
});

test("path escape guard prevents escaping private directory root", () => {
  const root = path.resolve("C:/mock/private/root");
  assert.equal(validateNoPathEscape(root, "subdir/file.json"), path.resolve(root, "subdir/file.json"));
  assert.throws(() => validateNoPathEscape(root, "../../outside.json"), /Path escape or traversal detected/);
});

test("comparison logic asserts exact BSON document and index preservation", () => {
  const docsA = [{ _id: "1", b: 2, a: 1 }, { _id: "2", x: "y" }];
  const docsB = [{ a: 1, _id: "1", b: 2 }, { x: "y", _id: "2" }];
  assert.ok(compareCollections(docsA, docsB));

  const docsDiff = [{ _id: "1", b: 3, a: 1 }, { _id: "2", x: "y" }];
  assert.throws(() => compareCollections(docsA, docsDiff), /Document mismatch/);

  const idxsA = [{ key: { orgId: 1, targetAgentId: 1 }, unique: true }];
  const idxsB = [{ key: { orgId: 1, targetAgentId: 1 }, unique: true }];
  assert.ok(compareIndexes(idxsA, idxsB));

  const idxsDiff = [{ key: { orgId: 1, targetAgentId: 1 }, unique: false }];
  assert.throws(() => compareIndexes(idxsA, idxsDiff), /Index uniqueness mismatch/);
});

test("synthetic fixture generator produces valid multi-tenant records with UNKNOWN and ACCEPTED", () => {
  const fixture = generateSyntheticDataset("run-abc");
  assert.equal(fixture.mongoData.organizations.length, 2);
  assert.ok(fixture.mongoData.jobruns.some(r => r.status === "UNKNOWN" && r.requiresReview === true));
  assert.ok(fixture.mongoData.jobruns.some(r => r.status === "ACCEPTED"));
  assert.ok(fixture.mongoData.executiontargetholds.length > 0);
  assert.ok(fixture.mongoData.sentinels.length > 0);
  assert.ok(Buffer.isBuffer(fixture.rawJournalData));
});

test("full orchestration simulation executes all lifecycle phases and cleanup with injected adapter", async () => {
  let created = false;
  let datasetImported = null;

  const mockAdapter = {
    context: "desktop-linux",
    endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine",
    mongoImage: { repo: "mongo", tag: "7", digest: "sha256:" + "1".repeat(64) },
    redisImage: { repo: "redis", tag: "7-alpine", digest: "sha256:" + "2".repeat(64) },
    inspectDestinationResources: async () => [
      { kind: "container", name: "dest-mongo", present: created },
      { kind: "volume", name: "dest-mongo-vol", present: created },
    ],
    createDestinationResources: async () => { created = true; },
    inspectDestinationState: async () => ({ collections: [], redisKeys: [], journalFiles: [] }),
    importData: async (ds) => { datasetImported = ds; },
    readRestoredMongo: async () => datasetImported.mongoData,
    readRestoredMongoIndexes: async () => {
      const idxs = {};
      for (const k of Object.keys(datasetImported.mongoData)) idxs[k] = [{ key: { _id: 1 }, unique: true }];
      return idxs;
    },
    readRestoredRedis: async () => datasetImported.redisData,
    readRestoredJournal: async () => datasetImported.rawJournalData,
    cleanupOwnedResources: async () => { created = false; return { ok: true, failures: [] }; },
  };

  const res = await runInertRestoreSimulation(mockAdapter);
  assert.equal(res.ok, true);
  assert.deepEqual(res.events, [
    "preflight",
    "seed_source",
    "export_components",
    "validate_manifest",
    "create_destinations",
    "import_destinations",
    "verify_preservation",
    "cleanup",
    "verify_absence"
  ]);
});
