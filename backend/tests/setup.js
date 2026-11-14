import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Capture any externally-supplied URI (e.g. CI service container) before
// this file mutates process.env. If set, MongoMemoryServer is skipped.
const externalMongoUri = process.env.MONGO_URI;

let mongoServer;

process.env.NODE_ENV = "test";
process.env.AXON_EXECUTION_PROFILE = "legacy";
process.env.AXON_RELEASE_ID = "test-release";
process.env.LOG_LEVEL = "info";
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
// Reserve Redis database 15 for tests so queue/state cleanup cannot touch the
// developer's normal Axon database (database 0).
process.env.REDIS_URI = "redis://localhost:6379/15";
process.env.PORT = "3001";
process.env.ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DISPATCH_SIGNING_KEY = "deadbeefdeadbeefdeadbeefdeadbeef";
process.env.PROMETHEUS_BEARER_TOKEN = "test-prometheus-token-do-not-use";
process.env.EMAIL_SMTP_HOST = "";
process.env.EMAIL_SMTP_USER = "";
process.env.EMAIL_SMTP_PASS = "";
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "";
process.env.OTEL_EXPORTER_OTLP_HEADERS = "";

// When no external URI is provided, use an RFC-reserved, non-resolving host so
// environment.js can validate at module-import time without ever pointing at a
// developer MongoDB. beforeAll replaces it only after the memory server starts.
if (!externalMongoUri) {
  process.env.MONGO_URI = "mongodb://axon-test-bootstrap.invalid/axon-test-bootstrap";
}

beforeAll(async () => {
  if (externalMongoUri) {
    process.env.MONGO_URI = externalMongoUri;
  } else {
    try {
      mongoServer = await MongoMemoryServer.create();
    } catch (error) {
      throw new Error(
        "MongoMemoryServer failed to start; refusing to fall back to any local MongoDB",
        { cause: error },
      );
    }
    process.env.MONGO_URI = mongoServer.getUri();
  }

  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
