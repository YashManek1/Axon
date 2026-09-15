import { describe, expect, it } from "vitest";
import {
  canonicalDispatch,
  signDispatch,
  verifyDispatch,
} from "../utils/dispatchSigner.js";

const TEST_KEY = "deadbeefdeadbeefdeadbeefdeadbeef";
const BASE = {
  protocolVersion: 2,
  orgId: "org-1",
  jobId: "job-1",
  targetAgentId: "agent-1",
  runId: "11111111-1111-4111-8111-111111111111",
  targetExecutionId: "22222222-2222-4222-8222-222222222222",
  attemptId: "33333333-3333-4333-8333-333333333333",
  operationId: "44444444-4444-4444-8444-444444444444",
  actionVersion: "a".repeat(64),
  command: "echo \"héllo\"\n",
  allowedCommands: ["echo *"],
  timeoutMs: 30_000,
  startBefore: 1_700_000_060_000,
  maxOutputBytes: 65_536,
};

describe("protocol-v2 dispatch signing", () => {
  it("uses the frozen canonical fixed-order array", () => {
    const payload = {
      ...BASE,
      nonce: "55555555-5555-4555-8555-555555555555",
      ts: 1_700_000_000_000,
    };
    expect(canonicalDispatch(payload)).toBe(
      '[2,"org-1","job-1","agent-1","11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","echo \\"héllo\\"\\n",["echo *"],30000,1700000060000,65536,"55555555-5555-4555-8555-555555555555",1700000000000]',
    );
    expect(signDispatch(TEST_KEY, payload).sig).toBe(
      "4b80d69dee74e0d4d5af0de88ed3422119fcdde60f2a2090a314eca32d522af5",
    );
  });

  it("accepts an untampered signed envelope", () => {
    const signed = { ...BASE, ...signDispatch(TEST_KEY, BASE) };
    expect(verifyDispatch(TEST_KEY, signed)).toBe(true);
  });

  it.each([
    ["protocolVersion", 3],
    ["orgId", "org-2"],
    ["jobId", "job-2"],
    ["targetAgentId", "agent-2"],
    ["runId", "run-2"],
    ["targetExecutionId", "target-execution-2"],
    ["attemptId", "attempt-2"],
    ["operationId", "operation-2"],
    ["actionVersion", "2"],
    ["command", "echo changed"],
    ["allowedCommands", []],
    ["timeoutMs", 1],
    ["startBefore", 9],
    ["maxOutputBytes", 9],
  ])("rejects tampering with %s", (field, value) => {
    const signed = { ...BASE, ...signDispatch(TEST_KEY, BASE) };
    expect(verifyDispatch(TEST_KEY, { ...signed, [field]: value })).toBe(false);
  });
});
