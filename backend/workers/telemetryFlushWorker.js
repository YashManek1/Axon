import Agent from "../models/agent.js";
import {
  getActiveAgentIds,
  getAgentTelemetry,
} from "../services/agentTelemetryBuffer.js";
import { createChildLogger } from "../config/logger.js";

export const FLUSH_AGENT_TELEMETRY_JOB_NAME = "flush-agent-telemetry";

const logger = createChildLogger({ module: "telemetry-flush-worker" });

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function flushAgentTelemetry() {
  const startedAt = Date.now();

  try {
    const agentIds = await getActiveAgentIds();
    const telemetryEntries = await Promise.all(
      agentIds.map(async (agentId) => [agentId, await getAgentTelemetry(agentId)]),
    );

    const operations = telemetryEntries
      .filter(([, telemetry]) => telemetry)
      .map(([agentId, telemetry]) => ({
        updateOne: {
          filter: { _id: agentId },
          update: {
            $set: {
              status: telemetry.status === "ONLINE" ? "online" : "offline",
              lastSeen: telemetry.lastSeenMs
                ? new Date(Number(telemetry.lastSeenMs))
                : new Date(),
              systemInfo: {
                os: telemetry.os,
                arch: telemetry.arch,
                cpuLoad: toNumber(telemetry.cpuLoad),
                ramTotal: toNumber(telemetry.ramTotal),
                ramUsed: toNumber(telemetry.ramUsed),
              },
            },
          },
        },
      }));

    if (operations.length > 0) {
      await Agent.bulkWrite(operations, { ordered: false });
    }

    logger.info(
      { agentCount: operations.length, durationMs: Date.now() - startedAt },
      "Agent telemetry flushed",
    );

    return { agentCount: operations.length };
  } catch (err) {
    logger.error(
      { err, durationMs: Date.now() - startedAt },
      "Failed to flush agent telemetry",
    );
    return { agentCount: 0, error: err.message };
  }
}
