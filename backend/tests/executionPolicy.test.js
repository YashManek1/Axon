import { describe, expect, it } from "vitest";
import {
  PILOT_POLICY_CODES,
  getExecutionPolicyViolation,
} from "../services/executionPolicy.js";

describe("pilot execution policy", () => {
  it.each([
    [{ type: "http", payload: { url: "http://169.254.169.254" } }, PILOT_POLICY_CODES.HTTP],
    [{ type: "shell", webhookUrl: "https://example.com/hook" }, PILOT_POLICY_CODES.WEBHOOK],
    [{ type: "shell", sink: { type: "mongo", uri: "mongodb://example" } }, PILOT_POLICY_CODES.SINK],
  ])("rejects unsupported outbound execution before side effects", (definition, code) => {
    expect(getExecutionPolicyViolation(definition, "pilot")).toMatchObject({ code });
  });

  it("allows only the bounded shell definition in pilot", () => {
    expect(
      getExecutionPolicyViolation(
        { type: "shell", payload: { command: "uptime" }, webhookUrl: null, sink: null },
        "pilot",
      ),
    ).toBeNull();
  });

  it("keeps legacy compatibility explicit", () => {
    expect(
      getExecutionPolicyViolation({ type: "http", payload: { url: "https://example.com" } }, "legacy"),
    ).toBeNull();
  });
});
