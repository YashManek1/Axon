import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "info";
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
process.env.REDIS_URI = "redis://localhost:6379";
process.env.PORT = "3001";
process.env.ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/axon-test-bootstrap";

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();

  await mongoose.connect(process.env.MONGO_URI);
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});
