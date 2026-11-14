import { describe, expect, it } from "vitest";
import logger, { createChildLogger } from "../config/logger.js";
import { validateEnvironment } from "../config/environment.js";

const validEnvironment = {
  PORT: "3001",
  MONGO_URI: "mongodb://localhost:27017/axon-test",
  REDIS_HOST: "localhost",
  REDIS_PORT: "6379",
  JWT_SECRET: "test-secret-do-not-use-in-production",
  ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  DISPATCH_SIGNING_KEY: "deadbeefdeadbeefdeadbeefdeadbeef",
  LOG_LEVEL: "info",
  NODE_ENV: "test",
};

describe("environment validation", () => {
  it("throws when MONGO_URI is missing", () => {
    const { MONGO_URI, ...environment } = validEnvironment;

    expect(() => validateEnvironment(environment)).toThrow(/MONGO_URI/);
  });

  it("throws when JWT_SECRET is shorter than 32 chars", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_SECRET: "too-short",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("throws when DISPATCH_SIGNING_KEY is too short", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DISPATCH_SIGNING_KEY: "deadbeef",
      }),
    ).toThrow(/DISPATCH_SIGNING_KEY/);
  });

  it("throws when ENCRYPTION_KEY is not 64 hex chars", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        ENCRYPTION_KEY: "not-a-valid-encryption-key",
      }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it("succeeds with all valid variables", () => {
    const environment = validateEnvironment(validEnvironment);

    // Zod applies defaults for optional fields (e.g. EMAIL_SMTP_PORT).
    // Compare only the fields we explicitly supplied.
    expect(environment).toMatchObject(validEnvironment);
    expect(Object.isFrozen(environment)).toBe(true);
  });

  it("defaults to the safe pilot execution profile", () => {
    const environment = validateEnvironment(validEnvironment);
    expect(environment.AXON_EXECUTION_PROFILE).toBe("pilot");
  });

  it("rejects an unknown execution profile", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, AXON_EXECUTION_PROFILE: "unsafe" }),
    ).toThrow(/AXON_EXECUTION_PROFILE/);
  });

  it("accepts and trims an optional matched release id", () => {
    const environment = validateEnvironment({
      ...validEnvironment,
      AXON_RELEASE_ID: " release-2026-09-19 ",
    });

    expect(environment.AXON_RELEASE_ID).toBe("release-2026-09-19");
  });

  it("logger does not throw when called with structured data", () => {
    const childLogger = createChildLogger({ testName: "environment.test" });

    expect(() => {
      logger.info({ requestId: "test-request" }, "Root logger accepts structured data");
      childLogger.debug({ nested: { value: true } }, "Child logger accepts structured data");
    }).not.toThrow();
  });
});
