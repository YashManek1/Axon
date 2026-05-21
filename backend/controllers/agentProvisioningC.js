import bcrypt from "bcrypt";
import crypto from "crypto";
import mongoose from "mongoose";
import Agent from "../models/agent.js";
import AuditLog from "../models/auditLog.js";
import Organization from "../models/organization.js";
import { createChildLogger } from "../config/logger.js";
import { registerAgentSchema } from "../schemas/agentSchemas.js";

const logger = createChildLogger({ module: "agent-provisioning-controller" });
const INSTRUCTIONS = "Set AGENT_ID and AGENT_API_KEY in your .env file";

function generateAgentApiKey() {
  return crypto.randomBytes(32).toString("hex");
}

function validationResponse(result, res) {
  if (result.success) {
    return null;
  }

  return res.status(400).json({
    error: "VALIDATION_ERROR",
    issues: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

async function findOrgByApiKey(apiKey) {
  if (!apiKey) {
    return null;
  }

  const orgs = await Organization.find({ apiKeyHash: { $exists: true, $ne: null } });

  for (const org of orgs) {
    if (await bcrypt.compare(apiKey, org.apiKeyHash)) {
      return org;
    }
  }

  return null;
}

async function writeAgentAudit({ req, orgId, agentId, command }) {
  try {
    await AuditLog.create({
      jobId: new mongoose.Types.ObjectId(),
      orgId,
      triggeredBy: {
        userId: req.user.id,
        ipAddress: req.ip || "unknown",
        userAgent: req.get("user-agent") || "unknown",
      },
      triggerType: "MANUAL_API",
      command,
      agentId,
      status: "COMPLETED",
      completedAt: new Date(),
      metadata: { auditType: "AGENT_PROVISIONING" },
    });
  } catch (err) {
    logger.error({ err, orgId, agentId, command }, "Failed to write agent audit record");
  }
}

export async function registerAgent(req, res) {
  const parsedBody = registerAgentSchema.safeParse(req.body);
  const badRequest = validationResponse(parsedBody, res);
  if (badRequest) {
    return badRequest;
  }

  try {
    const apiKey = req.get("X-Axon-API-Key");
    const org = await findOrgByApiKey(apiKey);

    if (!org) {
      return res.status(401).json({ message: "Invalid organization API key" });
    }

    const { name, hardwareUuid } = parsedBody.data;
    const existingAgent = await Agent.findOne({ orgId: org._id, hardwareUuid });

    if (existingAgent) {
      return res.status(200).json({
        agentId: existingAgent._id.toString(),
        apiKey: null,
        instructions: INSTRUCTIONS,
      });
    }

    const plaintextKey = generateAgentApiKey();
    const agent = await Agent.create({
      name,
      hardwareUuid,
      orgId: org._id,
      apiKey: plaintextKey,
      status: "offline",
    });

    return res.status(201).json({
      agentId: agent._id.toString(),
      apiKey: plaintextKey,
      instructions: INSTRUCTIONS,
    });
  } catch (err) {
    logger.error({ err }, "Failed to register agent");
    return res.status(500).json({ message: "Failed to register agent" });
  }
}

export async function rotateAgentKey(req, res) {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      orgId: req.user.orgId,
      decommissionedAt: null,
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const plaintextKey = generateAgentApiKey();
    agent.apiKey = plaintextKey;
    agent.lastApiKeyRotatedAt = new Date();
    await agent.save();

    await writeAgentAudit({
      req,
      orgId: agent.orgId,
      agentId: agent._id,
      command: "ROTATE_AGENT_KEY",
    });

    return res.status(200).json({
      agentId: agent._id.toString(),
      apiKey: plaintextKey,
    });
  } catch (err) {
    logger.error(
      { err, agentId: req.params?.agentId, orgId: req.user?.orgId },
      "Failed to rotate agent key",
    );
    return res.status(500).json({ message: "Failed to rotate agent key" });
  }
}

export async function decommissionAgent(req, res) {
  try {
    const agent = await Agent.findOne({
      _id: req.params.agentId,
      orgId: req.user.orgId,
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    agent.decommissionedAt = agent.decommissionedAt || new Date();
    agent.status = "offline";
    await agent.save();

    const io = req.app.get("io");
    if (io && agent.socketId) {
      io.sockets.sockets.get(agent.socketId)?.disconnect(true);
    }

    await writeAgentAudit({
      req,
      orgId: agent.orgId,
      agentId: agent._id,
      command: "DECOMMISSION_AGENT",
    });

    return res.status(200).json({
      agentId: agent._id.toString(),
      decommissionedAt: agent.decommissionedAt,
    });
  } catch (err) {
    logger.error(
      { err, agentId: req.params?.agentId, orgId: req.user?.orgId },
      "Failed to decommission agent",
    );
    return res.status(500).json({ message: "Failed to decommission agent" });
  }
}
