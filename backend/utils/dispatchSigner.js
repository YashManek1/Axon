import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export function canonicalDispatch(payload) {
  return JSON.stringify([
    payload.protocolVersion,
    payload.orgId,
    payload.jobId,
    payload.targetAgentId,
    payload.runId,
    payload.targetExecutionId,
    payload.attemptId,
    payload.operationId,
    payload.actionVersion,
    payload.command,
    payload.allowedCommands ?? [],
    payload.timeoutMs,
    payload.startBefore,
    payload.maxOutputBytes,
    payload.nonce,
    payload.ts,
  ]);
}

function digest(signingKeyHex, payload) {
  return createHmac("sha256", Buffer.from(signingKeyHex, "hex"))
    .update(canonicalDispatch(payload))
    .digest("hex");
}

export function signDispatch(signingKeyHex, payload) {
  const signed = {
    ...payload,
    nonce: payload.nonce ?? randomUUID(),
    ts: payload.ts ?? Date.now(),
  };
  return { nonce: signed.nonce, ts: signed.ts, sig: digest(signingKeyHex, signed) };
}

export function verifyDispatch(signingKeyHex, payload) {
  if (typeof payload?.sig !== "string") return false;
  const expected = Buffer.from(digest(signingKeyHex, payload), "hex");
  const actual = Buffer.from(payload.sig, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
