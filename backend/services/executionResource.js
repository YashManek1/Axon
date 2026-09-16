const MAX_START_WINDOW_MS = 60_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 300_000;
const COMPLETION_MARGIN_MS = 15_000;
const MIN_LOCK_TTL_SECONDS = 60;

export function buildExecutionResourceKey({ orgId, targetAgentId, jobId }) {
  if (orgId && targetAgentId) {
    return `org:${String(orgId)}:agent:${String(targetAgentId)}`;
  }
  return `legacy-job:${String(jobId)}`;
}

export function calculateExecutionLockTtlSeconds({ timeoutMs, startBefore, now = Date.now() }) {
  const boundedTimeoutMs = Number.isSafeInteger(timeoutMs)
    ? Math.min(Math.max(timeoutMs, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
    : 30_000;
  const remainingStartWindowMs = Number.isFinite(startBefore)
    ? Math.min(Math.max(startBefore - now, 0), MAX_START_WINDOW_MS)
    : 0;
  return Math.max(
    MIN_LOCK_TTL_SECONDS,
    Math.ceil((remainingStartWindowMs + boundedTimeoutMs + COMPLETION_MARGIN_MS) / 1000),
  );
}
