const MONGO_ID = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RUN_STATUSES = new Set(["ACCEPTED", "QUEUED", "DISPATCHING", "ACKNOWLEDGED", "SUCCEEDED", "FAILED", "TIMED_OUT", "REJECTED", "CANCELLED", "UNKNOWN"]);
const ATTEMPT_STATUSES = new Set(["PENDING", "DISPATCHING", "ACKNOWLEDGED", "SUCCEEDED", "FAILED", "TIMED_OUT", "REJECTED", "CANCELLED", "UNKNOWN"]);
const OUTCOMES = new Set(["COMPLETED", "REJECTED", "TIMED_OUT", "CANCELLED", "UNKNOWN"]);

type RecordValue = Record<string, unknown>;

export type SavedRunHandoff = { canonical: string; text: string };
export type SavedRunHandoffResult = { handoff: SavedRunHandoff } | { error: "invalid-identity" | "identity-mismatch" };

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

export function normalizeMongoId(value: unknown): string | null {
  return typeof value === "string" && value.length === 24 && MONGO_ID.test(value) ? value.toLowerCase() : null;
}

export function normalizeRunUuid(value: unknown): string | null {
  return typeof value === "string" && value.length === 36 && UUID.test(value) ? value.toLowerCase() : null;
}

function identifier(value: unknown, normalizer: (input: unknown) => string | null) {
  return normalizer(value) ?? "Not recorded / invalid identifier";
}

function date(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === normalized ? normalized : "Unavailable";
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : "Not recorded";
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? String(value) : "Not recorded";
}

function allowed(value: unknown, values: Set<string>) {
  return typeof value === "string" && values.has(value) ? value : "Unrecognized / unavailable";
}

function optionalAllowed(value: unknown, values: Set<string>) {
  return value === undefined || value === null ? "Not recorded" : allowed(value, values);
}

function requiresReview(value: unknown) {
  return typeof value === "boolean" ? String(value) : "Not recorded";
}

function attemptLines(value: unknown) {
  const attempts = Array.isArray(value) ? value : [];
  const lines = attempts.slice(0, 20).flatMap((attempt, index) => {
    const item = record(attempt) ?? {};
    return [
      `Attempt ${index + 1} correlation ID: ${identifier(item.attemptId, normalizeRunUuid)}`,
      `Attempt ${index + 1} sequence: ${nonNegativeInteger(item.sequence)}`,
      `Attempt ${index + 1} status: ${allowed(item.status, ATTEMPT_STATUSES)}`,
      `Attempt ${index + 1} target execution ID: ${identifier(item.targetExecutionId, normalizeRunUuid)}`,
      `Attempt ${index + 1} operation ID: ${identifier(item.operationId, normalizeRunUuid)}`,
      `Attempt ${index + 1} outcome: ${optionalAllowed(item.outcome, OUTCOMES)}`,
      `Attempt ${index + 1} dispatched at (UTC): ${date(item.dispatchedAt)}`,
      `Attempt ${index + 1} acknowledged at (UTC): ${date(item.acknowledgedAt)}`,
      `Attempt ${index + 1} completed at (UTC): ${date(item.completedAt)}`,
      `Attempt ${index + 1} exit code: ${integer(item.exitCode)}`,
    ];
  });
  if (!lines.length) lines.push("Attempts: Not recorded");
  if (attempts.length > 20) lines.push(`Attempts omitted: ${attempts.length - 20}`);
  return lines;
}

export function formatSavedRunHandoff(value: unknown, requestedJobId: unknown, requestedRunId: unknown, retrievedAt = new Date()): SavedRunHandoffResult {
  const run = record(value);
  const expectedJob = normalizeMongoId(requestedJobId);
  const expectedRun = normalizeRunUuid(requestedRunId);
  if (!run || !expectedJob || !expectedRun) return { error: "invalid-identity" };
  const originalJob = normalizeMongoId(run.jobId);
  const originalRun = normalizeRunUuid(run.runId);
  if (!originalJob || !originalRun || originalJob !== expectedJob || originalRun !== expectedRun) return { error: "identity-mismatch" };

  const terminal = record(run.terminalSummary) ?? {};
  const canonicalLines = [
    `Original job ID: ${originalJob}`,
    `Original run ID: ${originalRun}`,
    `Original target ID: ${identifier(run.targetAgentId, normalizeMongoId)}`,
    `Saved status: ${allowed(run.status, RUN_STATUSES)}`,
    `Requires review: ${requiresReview(run.requiresReview)}`,
    `Created at (UTC): ${date(run.createdAt)}`,
    `Updated at (UTC): ${date(run.updatedAt)}`,
    `Queued at (UTC): ${date(run.queuedAt)}`,
    `Completed at (UTC): ${date(run.completedAt)}`,
    ...attemptLines(run.attempts),
    `Terminal status: ${optionalAllowed(terminal.status, RUN_STATUSES)}`,
    `Terminal outcome: ${optionalAllowed(terminal.outcome, OUTCOMES)}`,
    `Terminal completed at (UTC): ${date(terminal.completedAt)}`,
    `Terminal exit code: ${integer(terminal.exitCode)}`,
    "Interpretation: ACCEPTED records durable acceptance only.",
    "Interpretation: QUEUED records a saved transition only.",
    "Interpretation: Dispatch and acknowledgement do not establish completion.",
    "Interpretation: UNKNOWN, requires review, or unrecognized values cannot confirm effects.",
    "Interpretation: FAILED, TIMED_OUT, CANCELLED, or REJECTED do not make repetition safe.",
    "Interpretation: SUCCEEDED or COMPLETED does not establish application health.",
    "This summary does not authorize retry, hold release, or establish deployment readiness.",
  ];
  const canonical = canonicalLines.join("\n");
  const retrieval = date(retrievedAt instanceof Date && !Number.isNaN(retrievedAt.getTime()) ? retrievedAt.toISOString() : undefined);
  return { handoff: { canonical, text: ["Saved-run handoff - snapshot, not live", `Retrieved at (UTC): ${retrieval}`, canonical].join("\n") } };
}
