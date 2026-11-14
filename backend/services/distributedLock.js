import { redisConnection } from "../config/queue.js";

const FENCE_KEY_TTL = 86400; // 24 hours

function lockKey(resourceKey) {
  return `job:lock:${resourceKey}`;
}

function fenceKey(resourceKey) {
  return `job:fence:${resourceKey}`;
}

// Only deletes the lock when the stored value matches this worker's id.
// Returns 1 on success, 0 if the key is gone or owned by a different worker.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export async function acquireJobLock(resourceKey, workerId, ttlSeconds = 30) {
  const result = await redisConnection.eval(
    ACQUIRE_SCRIPT,
    2,
    lockKey(resourceKey),
    fenceKey(resourceKey),
    workerId,
    String(ttlSeconds),
    String(FENCE_KEY_TTL),
  );

  if (Number(result?.[0]) !== 1) {
    return {
      acquired: false,
      fencingToken: null,
      existingWorker: result?.[1] ? String(result[1]) : null,
    };
  }

  return {
    acquired: true,
    fencingToken: Number(result[1]),
    existingWorker: null,
  };
}

export async function releaseJobLock(resourceKey, workerId) {
  return redisConnection.eval(RELEASE_SCRIPT, 1, lockKey(resourceKey), workerId);
}
// Redis runs this script atomically. The fencing counter is validated and
// incremented before the lock is committed, so a counter failure cannot leave
// an owner lock without a fencing token.
const ACQUIRE_SCRIPT = `
local existing = redis.call("get", KEYS[1])
if existing then
  return {0, existing}
end
local token = redis.call("incr", KEYS[2])
redis.call("expire", KEYS[2], ARGV[3])
redis.call("set", KEYS[1], ARGV[1], "EX", ARGV[2])
return {1, token}
`;
