import { redisConnection } from "../config/queue.js";

const validStates = new Set([
  "PENDING",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "TIMEOUT",
]);

function stateKey(jobId) {
  return `job:state:${jobId}`;
}

function lockKey(jobId) {
  return `job:lock:${jobId}`;
}

export async function setJobState(jobId, state) {
  if (!validStates.has(state)) {
    throw new Error(`Invalid job state: ${state}`);
  }

  await redisConnection.set(stateKey(jobId), state, "EX", 86400);
}

export async function getJobState(jobId) {
  return redisConnection.get(stateKey(jobId));
}

export async function checkDependenciesMet(jobId, dependencyIds = []) {
  if (!dependencyIds || dependencyIds.length === 0) {
    return { met: true, blockedBy: [] };
  }

  const pipeline = redisConnection.pipeline();

  for (const dependencyId of dependencyIds) {
    pipeline.get(stateKey(dependencyId));
  }

  const results = await pipeline.exec();
  const blockedBy = results
    .map(([err, state], index) => {
      const dependencyId = String(dependencyIds[index]);

      if (err || state === null) {
        return { jobId: dependencyId, currentState: "NEVER_RUN" };
      }

      if (state !== "COMPLETED") {
        return { jobId: dependencyId, currentState: state };
      }

      return null;
    })
    .filter(Boolean);

  return {
    met: blockedBy.length === 0,
    blockedBy,
  };
}

export async function acquireExecutionSlot(jobId, workerId, ttlSeconds = 60) {
  const result = await redisConnection.set(
    lockKey(jobId),
    workerId,
    "NX",
    "EX",
    ttlSeconds,
  );

  if (result === "OK") {
    return { acquired: true, existingWorker: null };
  }

  const existingWorker = await redisConnection.get(lockKey(jobId));
  return { acquired: false, existingWorker };
}
