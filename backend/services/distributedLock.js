import { redisConnection } from "../config/queue.js";

function lockKey(jobId) {
  return `job:lock:${jobId}`;
}

export async function acquireJobLock(jobId, ttlSeconds = 30) {
  const result = await redisConnection.set(
    lockKey(jobId),
    "processing",
    "NX",
    "EX",
    ttlSeconds,
  );

  return result === "OK";
}

export async function releaseJobLock(jobId) {
  await redisConnection.del(lockKey(jobId));
}
