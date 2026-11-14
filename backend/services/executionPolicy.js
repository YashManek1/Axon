import { environment } from "../config/environment.js";

export const PILOT_POLICY_CODES = Object.freeze({
  HTTP: "HTTP_EXECUTION_DISABLED",
  WEBHOOK: "WEBHOOK_EXECUTION_DISABLED",
  SINK: "EXTERNAL_SINK_DISABLED",
});

function hasExternalSink(sink) {
  return Boolean(
    sink &&
      (sink.type || sink.uri || sink.databaseName || sink.collectionName || sink.collection),
  );
}

export function getExecutionPolicyViolation(
  definition,
  profile = environment.AXON_EXECUTION_PROFILE,
) {
  if (profile === "legacy") return null;

  if (definition?.type === "http" || (!definition?.type && definition?.payload?.url)) {
    return {
      code: PILOT_POLICY_CODES.HTTP,
      message: "Arbitrary HTTP jobs are disabled in the Axon pilot execution profile",
    };
  }
  if (definition?.webhookUrl) {
    return {
      code: PILOT_POLICY_CODES.WEBHOOK,
      message: "Execution webhooks are disabled in the Axon pilot execution profile",
    };
  }
  if (hasExternalSink(definition?.sink)) {
    return {
      code: PILOT_POLICY_CODES.SINK,
      message: "External result sinks are disabled in the Axon pilot execution profile",
    };
  }

  return null;
}
