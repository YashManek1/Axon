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

export function recordHeartbeat(agentId, telemetryData) {
  const now = Date.now();

  return new Promise((resolve) => {
    pendingHeartbeats.push({
      agentId,
      telemetryData,
      seenAtMs: now,
      resolve,
    });

    if (!heartbeatFlushScheduled) {
      heartbeatFlushScheduled = true;
      queueMicrotask(flushPendingHeartbeats);
    }
  });
}

export async function markAgentOffline(agentId) {
  try {
    await redisConnection.hset(telemetryKey(agentId), "status", "OFFLINE");
  } catch (err) {
    logger.error({ err, agentId }, "Failed to mark agent offline");
  }
}

export async function getAgentTelemetry(agentId) {
  try {
    const telemetry = await redisConnection.hgetall(telemetryKey(agentId));

    if (!telemetry || Object.keys(telemetry).length === 0) {
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
