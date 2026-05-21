import Agent from "../models/agent.js";
import { createChildLogger } from "../config/logger.js";
import { getAgentTelemetry } from "../services/agentTelemetryBuffer.js";

const logger = createChildLogger({ module: "agent-controller" });

function mergeTelemetry(agent, telemetry) {
  if (!telemetry) {
    return agent;
  }

  return {
    ...agent,
    status: telemetry.status === "ONLINE" ? "online" : "offline",
    lastSeen: telemetry.lastSeenMs
      ? new Date(Number(telemetry.lastSeenMs))
      : agent.lastSeen,
    systemInfo: {
      ...agent.systemInfo,
      os: telemetry.os,
      arch: telemetry.arch,
      cpuLoad: Number(telemetry.cpuLoad),
      ramTotal: Number(telemetry.ramTotal),
      ramUsed: Number(telemetry.ramUsed),
    },
  };
}

// Get all agents for the authenticated user's organization
export const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find({ orgId: req.user.orgId })
      .select("-apiKey")
      .sort({ status: 1, lastSeen: -1 });
    return res.status(200).json(agents);
  } catch (error) {
    logger.error({ err: error, orgId: req.user?.orgId }, "Error fetching agents");
    return res.status(500).json({ message: "Failed to fetch agents" });
  }
};

// Get a single agent by ID
export const getAgentById = async (req, res) => {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      orgId: req.user.orgId,
    }).select("-apiKey");

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const telemetry = await getAgentTelemetry(req.params.agentId);
    return res.status(200).json(mergeTelemetry(agent.toObject(), telemetry));
  } catch (error) {
    logger.error(
      { err: error, agentId: req.params?.agentId, orgId: req.user?.orgId },
      "Error fetching agent",
    );
    return res.status(500).json({ message: "Failed to fetch agent" });
  }
};
