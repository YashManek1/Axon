import { redisConnection } from "../config/queue.js";

const FENCE_KEY_TTL = 86400; // 24 hours

function lockKey(jobId) {
  return `job:lock:${jobId}`;
}

function fenceKey(jobId) {
  return `job:fence:${jobId}`;
}

// Only deletes the lock when the stored value matches this worker's id.
// Returns 1 on success, 0 if the key is gone or owned by a different worker.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export async function acquireJobLock(jobId, workerId, ttlSeconds = 30) {
  const result = await redisConnection.set(
    lockKey(jobId),
    workerId,
    "NX",
    "EX",
    ttlSeconds,
  );

  if (result !== "OK") {
    const existingWorker = await redisConnection.get(lockKey(jobId));
    return { acquired: false, fencingToken: null, existingWorker };
  }

  const pipeline = redisConnection.pipeline();
  pipeline.incr(fenceKey(jobId));
  pipeline.expire(fenceKey(jobId), FENCE_KEY_TTL);
  const pipelineResults = await pipeline.exec();
  const fencingToken = pipelineResults[0][1];

  return { acquired: true, fencingToken, existingWorker: null };
}

export async function releaseJobLock(jobId, workerId) {
  return redisConnection.eval(RELEASE_SCRIPT, 1, lockKey(jobId), workerId);
}
