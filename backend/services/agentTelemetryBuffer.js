import { redisConnection } from "../config/queue.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "agent-telemetry-buffer" });

const ACTIVE_POOL_KEY = "agent:active:pool";
const pendingHeartbeats = [];
let heartbeatFlushScheduled = false;

function telemetryKey(agentId) {
  return `agent:telemetry:${agentId}`;
}

async function flushPendingHeartbeats() {
  heartbeatFlushScheduled = false;
  const batch = pendingHeartbeats.splice(0, pendingHeartbeats.length);

  if (batch.length === 0) {
    return;
  }

  try {
    const pipeline = redisConnection.pipeline();
    const activePoolMembers = [];

    for (const entry of batch) {
      pipeline.hset(telemetryKey(entry.agentId), {
        os: entry.telemetryData.os,
        arch: entry.telemetryData.arch,
        cpuLoad: entry.telemetryData.cpuLoad,
        ramTotal: entry.telemetryData.ramTotal,
        ramUsed: entry.telemetryData.ramUsed,
        lastSeenMs: entry.seenAtMs,
        status: "ONLINE",
        socketId: entry.socketId,
        tokenVersion: entry.tokenVersion,
      });
      activePoolMembers.push(entry.seenAtMs, String(entry.agentId));
    }

    if (activePoolMembers.length > 0) {
      pipeline.zadd(ACTIVE_POOL_KEY, ...activePoolMembers);
    }

    await pipeline.exec();
  } catch (err) {
    logger.error({ err, batchSize: batch.length }, "Failed to record agent heartbeat batch");
  } finally {
    for (const entry of batch) {
      entry.resolve();
    }
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
       then return redis.call('HSET', KEYS[1], 'status', 'OFFLINE')
       else return 0 end`,
      1,
      telemetryKey(agentId),
      String(identity.socketId || ""),
      String(identity.tokenVersion ?? 0),
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
        Number(telemetry.tokenVersion ?? 0) !== Number(identity.tokenVersion ?? 0))
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
