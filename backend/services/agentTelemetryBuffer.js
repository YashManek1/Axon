import { redisConnection } from "../config/queue.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "agent-telemetry-buffer" });

const ACTIVE_POOL_KEY = "agent:active:pool";
const HEARTBEAT_SCRIPT_BATCH_SIZE = 250;
const pendingHeartbeats = [];
let heartbeatFlushScheduled = false;

const CLAIM_OWNER_IF_NEWER = `
  local storedGeneration = redis.call('HGET', KEYS[1], 'connectionGeneration')
  local incomingGeneration = tonumber(ARGV[3])
  if not incomingGeneration then
    return 0
  end

  if storedGeneration then
    local storedGenerationNumber = tonumber(storedGeneration)
    if not storedGenerationNumber or incomingGeneration < storedGenerationNumber then
      return 0
    end
    if incomingGeneration == storedGenerationNumber then
      if redis.call('HGET', KEYS[1], 'socketId') ~= ARGV[1]
        or redis.call('HGET', KEYS[1], 'tokenVersion') ~= ARGV[2]
      then
        return 0
      end
    end
  end

  redis.call('HSET', KEYS[1],
    'status', 'ONLINE',
    'socketId', ARGV[1],
    'tokenVersion', ARGV[2],
    'connectionGeneration', ARGV[3],
    'ownerClaimedAtMs', ARGV[4])
  return 1
`;

const RECORD_HEARTBEAT_BATCH_IF_OWNER = `
  local acceptedIndexes = ""
  for keyIndex = 2, #KEYS do
    local offset = (keyIndex - 2) * 10
    local ownerMatches = redis.call('HGET', KEYS[keyIndex], 'socketId') == ARGV[offset + 1]
      and redis.call('HGET', KEYS[keyIndex], 'tokenVersion') == ARGV[offset + 2]
      and redis.call('HGET', KEYS[keyIndex], 'connectionGeneration') == ARGV[offset + 3]
    if ownerMatches then
      redis.call('HSET', KEYS[keyIndex],
        'os', ARGV[offset + 4],
        'arch', ARGV[offset + 5],
        'cpuLoad', ARGV[offset + 6],
        'ramTotal', ARGV[offset + 7],
        'ramUsed', ARGV[offset + 8],
        'lastSeenMs', ARGV[offset + 9],
        'status', 'ONLINE',
        'socketId', ARGV[offset + 1],
        'tokenVersion', ARGV[offset + 2],
        'connectionGeneration', ARGV[offset + 3])
      if acceptedIndexes ~= "" then
        acceptedIndexes = acceptedIndexes .. ","
      end
      acceptedIndexes = acceptedIndexes .. tostring(keyIndex - 1)
    end
  end
  return acceptedIndexes
`;

function telemetryKey(agentId) {
  return `agent:telemetry:${agentId}`;
}

function redisValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

async function flushPendingHeartbeats() {
  heartbeatFlushScheduled = false;
  const batch = pendingHeartbeats.splice(0, pendingHeartbeats.length);

  if (batch.length === 0) {
    return;
  }

  try {
    const writes = [];
    for (let offset = 0; offset < batch.length; offset += HEARTBEAT_SCRIPT_BATCH_SIZE) {
      const entries = batch.slice(offset, offset + HEARTBEAT_SCRIPT_BATCH_SIZE);
      const telemetryKeys = entries.map((entry) => telemetryKey(entry.agentId));
      const argumentsByEntry = entries.flatMap((entry) => [
        entry.socketId,
        entry.tokenVersion,
        entry.connectionGeneration,
        redisValue(entry.telemetryData.os),
        redisValue(entry.telemetryData.arch),
        redisValue(entry.telemetryData.cpuLoad),
        redisValue(entry.telemetryData.ramTotal),
        redisValue(entry.telemetryData.ramUsed),
        String(entry.seenAtMs),
        String(entry.agentId),
      ]);

      writes.push(
        redisConnection
          .eval(
            RECORD_HEARTBEAT_BATCH_IF_OWNER,
            telemetryKeys.length + 1,
            ACTIVE_POOL_KEY,
            ...telemetryKeys,
            ...argumentsByEntry,
          )
          .then((acceptedIndexes) => ({ acceptedIndexes, entries })),
      );
    }

    const acceptedMembers = [];
    for (const result of await Promise.all(writes)) {
      for (const acceptedIndex of String(result.acceptedIndexes || "")
        .split(",")
        .filter(Boolean)) {
        const entry = result.entries[Number(acceptedIndex) - 1];
        acceptedMembers.push(entry.seenAtMs, String(entry.agentId));
      }
    }
    if (acceptedMembers.length > 0) {
      await redisConnection.zadd(ACTIVE_POOL_KEY, ...acceptedMembers);
    }
  } catch (err) {
    logger.error({ err, batchSize: batch.length }, "Failed to record agent heartbeat batch");
  } finally {
    for (const entry of batch) {
      entry.resolve();
    }
  }
}

export async function claimTelemetryOwner(agentId, identity = {}) {
  try {
    const result = await redisConnection.eval(
      CLAIM_OWNER_IF_NEWER,
      1,
      telemetryKey(agentId),
      String(identity.socketId || ""),
      String(identity.tokenVersion ?? 0),
      String(identity.connectionGeneration ?? 0),
      String(Date.now()),
    );
    return Number(result) === 1;
  } catch (err) {
    logger.error({ err, agentId }, "Failed to claim agent telemetry ownership");
    return false;
  }
}

export function recordHeartbeat(agentId, telemetryData, identity = {}) {
  const now = Date.now();

  return new Promise((resolve) => {
    pendingHeartbeats.push({
      agentId,
      telemetryData,
      seenAtMs: now,
      socketId: String(identity.socketId || ""),
      tokenVersion: String(identity.tokenVersion ?? 0),
      connectionGeneration: String(identity.connectionGeneration ?? 0),
      resolve,
    });

    if (!heartbeatFlushScheduled) {
      heartbeatFlushScheduled = true;
      queueMicrotask(flushPendingHeartbeats);
    }
  });
}

export async function markAgentOffline(agentId, identity = {}) {
  try {
    await redisConnection.eval(
      `if redis.call('HGET', KEYS[1], 'socketId') == ARGV[1]
        and redis.call('HGET', KEYS[1], 'tokenVersion') == ARGV[2]
        and redis.call('HGET', KEYS[1], 'connectionGeneration') == ARGV[3]
       then return redis.call('HSET', KEYS[1], 'status', 'OFFLINE')
       else return 0 end`,
      1,
      telemetryKey(agentId),
      String(identity.socketId || ""),
      String(identity.tokenVersion ?? 0),
      String(identity.connectionGeneration ?? 0),
    );
  } catch (err) {
    logger.error({ err, agentId }, "Failed to mark agent offline");
  }
}

export async function getAgentTelemetry(agentId, identity = null) {
  try {
    const telemetry = await redisConnection.hgetall(telemetryKey(agentId));

    if (!telemetry || Object.keys(telemetry).length === 0) {
      return null;
    }

    if (
      identity &&
      (String(telemetry.socketId) !== String(identity.socketId || "") ||
        Number(telemetry.tokenVersion ?? 0) !== Number(identity.tokenVersion ?? 0) ||
        Number(telemetry.connectionGeneration ?? 0) !==
          Number(identity.connectionGeneration ?? 0))
    ) {
      return null;
    }
    return telemetry;
  } catch (err) {
    logger.error({ err, agentId }, "Failed to get agent telemetry");
    return null;
  }
}

export async function getActiveAgentIds(olderThanMs = 30000) {
  try {
    return await redisConnection.zrangebyscore(
      ACTIVE_POOL_KEY,
      Date.now() - olderThanMs,
      "+inf",
    );
  } catch (err) {
    logger.error({ err, olderThanMs }, "Failed to get active agent IDs");
    return [];
  }
}
