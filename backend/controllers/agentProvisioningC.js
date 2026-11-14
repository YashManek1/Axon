import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Agent from "../models/agent.js";
import AuditLog from "../models/auditLog.js";
import Organization from "../models/organization.js";
import User from "../models/user.js";
import Job from "../models/job.js";
import { environment } from "../config/environment.js";
import { createChildLogger } from "../config/logger.js";
import { registerAgentSchema } from "../schemas/agentSchemas.js";

const logger = createChildLogger({ module: "agent-provisioning-controller" });
const INSTRUCTIONS = "Set AGENT_ID and AGENT_API_KEY in your .env file";
const TOKEN_TTL_SEC = 15 * 60; // 15 minutes
const TOKEN_REFRESH_GRACE_SEC = 60; // 1 min clock-skew grace on refresh

class InvalidAgentIdentityError extends Error {}

export function issueAgentToken(agent) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      type: "agent-token",
      jti: crypto.randomUUID(),
      agentId: agent._id.toString(),
      orgId: agent.orgId.toString(),
      tokenVersion: agent.tokenVersion ?? 0,
      iat: now,
      exp: now + TOKEN_TTL_SEC,
    },
    environment.JWT_SECRET,
    { algorithm: "HS256" },
  );
}

function tokenVersionFilter(tokenVersion) {
  if (Number(tokenVersion) === 0) {
    return { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] };
  }
  return { tokenVersion: Number(tokenVersion) };
}

async function stampToken(agent) {
  const tokenVersion = Number(agent.tokenVersion ?? 0);
  const result = await Agent.updateOne(
    {
      _id: agent._id,
      decommissionedAt: null,
      ...tokenVersionFilter(tokenVersion),
    },
    {
      $set: {
        tokenIssuedAt: new Date(),
        tokenExpiry: new Date(Date.now() + TOKEN_TTL_SEC * 1000),
      },
    },
  );
  if (result.matchedCount !== 1) {
    throw new InvalidAgentIdentityError("Agent identity changed during token issue");
  }
}

export async function resolveAgentToken(token, { refreshGrace = false } = {}) {
  const payload = jwt.verify(token, environment.JWT_SECRET, {
    algorithms: ["HS256"],
    ignoreExpiration: refreshGrace,
  });
  if (payload.type !== "agent-token") {
    throw new InvalidAgentIdentityError("Invalid token type");
  }

  const now = Math.floor(Date.now() / 1000);
  if (refreshGrace && (!payload.exp || payload.exp + TOKEN_REFRESH_GRACE_SEC < now)) {
    const error = new InvalidAgentIdentityError("Token expired");
    error.code = "TOKEN_EXPIRED";
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(payload.agentId) || !payload.orgId) {
    throw new InvalidAgentIdentityError("Invalid agent identity");
  }

  const agent = await Agent.findById(payload.agentId);
  const tokenVersion = payload.tokenVersion ?? 0;
  if (
    !agent ||
    agent.decommissionedAt ||
    String(agent.orgId) !== String(payload.orgId) ||
    Number(agent.tokenVersion ?? 0) !== Number(tokenVersion)
  ) {
    throw new InvalidAgentIdentityError("Agent identity is no longer valid");
  }

  return agent;
}

export async function authAgentToken(req, res, next) {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing agent token" });
  }

  try {
    req.agent = await resolveAgentToken(header.slice(7), { refreshGrace: true });
    return next();
  } catch (error) {
    if (error.code === "TOKEN_EXPIRED") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (error instanceof jwt.JsonWebTokenError || error instanceof InvalidAgentIdentityError) {
      return res.status(401).json({ message: "Invalid token" });
    }
    return res.status(503).json({ message: "Authentication service unavailable" });
  }
}

function disconnectAgentSockets(io, agentId) {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    if (String(socket.agentId) === String(agentId)) {
      socket.disconnect(true);
    }
  }
}

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

  // Parse wire format: axk_<keyId>_<secret>
  // NOTE: the secret is base64url, whose alphabet INCLUDES "_". Splitting on
  // "_" therefore yields >3 parts for any secret containing an underscore and
  // silently rejects a valid key. keyId is hex, so the first underscore after
  // the "axk_" prefix is the real separator; everything after it is the secret.
  if (!apiKey.startsWith("axk_")) {
    return null;
  }
  const rest = apiKey.slice(4);
  const separatorIndex = rest.indexOf("_");
  if (separatorIndex <= 0 || separatorIndex === rest.length - 1) {
    return null;
  }

  const keyId = rest.slice(0, separatorIndex);
  const secret = rest.slice(separatorIndex + 1);

  // O(1) indexed lookup. $elemMatch is required: without it the keyId and the
  // revoked check can be satisfied by two DIFFERENT array elements, which would
  // let a revoked key authenticate whenever any other key in the org is active.
  const org = await Organization.findOne({
    apiKeys: {
      $elemMatch: {
        keyId,
        revokedAt: null,
      },
    },
  });

  if (!org) {
    return null;
  }

  // Find the specific key and verify secret
  const apiKeyObj = org.apiKeys.find((k) => k.keyId === keyId && !k.revokedAt);
  if (!apiKeyObj) {
    return null;
  }

  // Single bcrypt compare
  const isValid = await bcrypt.compare(secret, apiKeyObj.hash);
  if (!isValid) {
    return null;
  }

  // Update lastUsedAt asynchronously (do not block response)
  setImmediate(async () => {
    try {
      await Organization.updateOne(
        { _id: org._id, "apiKeys.keyId": keyId },
        { $set: { "apiKeys.$.lastUsedAt": new Date() } },
      );
    } catch (err) {
      logger.warn({ err, orgId: org._id, keyId }, "Failed to update key lastUsedAt");
    }
  });

  return org;
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

    if (existingAgent?.decommissionedAt) {
      return res.status(403).json({ message: "Agent has been decommissioned" });
    }

    if (existingAgent) {
      const shortToken = issueAgentToken(existingAgent);
      await stampToken(existingAgent);
      return res.status(200).json({
        agentId: existingAgent._id.toString(),
        apiKey: null,
        shortToken,
        sandboxMode: existingAgent.sandboxMode,
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
    const shortToken = issueAgentToken(agent);
    await stampToken(agent);

    return res.status(201).json({
      agentId: agent._id.toString(),
      apiKey: plaintextKey,
      shortToken,
      sandboxMode: agent.sandboxMode,
      instructions: INSTRUCTIONS,
    });
  } catch (err) {
    logger.error({ err }, "Failed to register agent");
    return res.status(500).json({ message: "Failed to register agent" });
  }
}

export async function rotateAgentKey(req, res) {
  try {
    const plaintextKey = generateAgentApiKey();
    const hashedKey = await bcrypt.hash(plaintextKey, 10);
    const agent = await Agent.findOneAndUpdate(
      {
        _id: req.params.agentId,
        orgId: req.user.orgId,
        decommissionedAt: null,
      },
      {
        $set: {
          apiKey: hashedKey,
          lastApiKeyRotatedAt: new Date(),
          status: "offline",
          socketId: null,
        },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const io = req.app.get("io");
    disconnectAgentSockets(io, agent._id);

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

const VALID_SANDBOX_MODES = ["none", "namespace", "docker"];

export async function updateAgentPermissions(req, res) {
  try {
    const { agentId } = req.params;
    const { allowedUsers, allowedJobs, allowedCommands, sandboxMode } = req.body;

    if (
      (allowedUsers !== undefined && !Array.isArray(allowedUsers)) ||
      (allowedJobs !== undefined && !Array.isArray(allowedJobs)) ||
      (allowedCommands !== undefined && !Array.isArray(allowedCommands))
    ) {
      return res.status(400).json({
        message: "allowedUsers, allowedJobs, and allowedCommands must be arrays",
      });
    }

    if (
      (allowedCommands?.length ?? 0) > 100 ||
      (allowedCommands ?? []).some(
        (command) =>
          typeof command !== "string" ||
          command.length === 0 ||
          command.length > 512 ||
          command.includes("\0"),
      )
    ) {
      return res.status(400).json({
        message: "allowedCommands must contain at most 100 exact non-empty commands of 512 characters or fewer",
      });
    }

    const invalidIds = [...(allowedUsers ?? []), ...(allowedJobs ?? [])].filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );
    if (invalidIds.length > 0) {
      return res.status(400).json({ message: "Permissions contain invalid IDs" });
    }

    const [orgUserCount, orgJobCount] = await Promise.all([
      User.countDocuments({ _id: { $in: allowedUsers ?? [] }, orgId: req.user.orgId }),
      Job.countDocuments({ _id: { $in: allowedJobs ?? [] }, orgId: req.user.orgId }),
    ]);
    if (
      (allowedUsers !== undefined && orgUserCount !== allowedUsers.length) ||
      (allowedJobs !== undefined && orgJobCount !== allowedJobs.length)
    ) {
      return res.status(400).json({ message: "Permissions must reference this organization" });
    }
    if (sandboxMode !== undefined && !VALID_SANDBOX_MODES.includes(sandboxMode)) {
      return res.status(400).json({
        message: `sandboxMode must be one of: ${VALID_SANDBOX_MODES.join(", ")}`,
      });
    }

    const agent = await Agent.findOne({ _id: agentId, orgId: req.user.orgId, decommissionedAt: null });
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const permissionUpdate = {};
    if (allowedUsers !== undefined) permissionUpdate.allowedUsers = allowedUsers;
    if (allowedJobs !== undefined) permissionUpdate.allowedJobs = allowedJobs;
    if (allowedCommands !== undefined) {
      permissionUpdate.allowedCommands = [...new Set(allowedCommands)];
    }
    if (sandboxMode !== undefined) {
      permissionUpdate.sandboxMode = sandboxMode;
    }
    const updatedAgent = await Agent.findOneAndUpdate(
      { _id: agentId, orgId: req.user.orgId, decommissionedAt: null },
      { $set: permissionUpdate },
      { new: true, runValidators: true },
    );
    if (!updatedAgent) return res.status(404).json({ message: "Agent not found" });

    return res.status(200).json({
      message: "Permissions updated",
      allowedUsers: updatedAgent.allowedUsers,
      allowedJobs: updatedAgent.allowedJobs,
      allowedCommands: updatedAgent.allowedCommands,
      sandboxMode: updatedAgent.sandboxMode,
    });
  } catch (err) {
    logger.error({ err, agentId: req.params?.agentId, orgId: req.user?.orgId }, "Failed to update agent permissions");
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function refreshAgentToken(req, res) {
  // req.agent set by authAgentToken middleware
  const agent = req.agent;
  try {
    const shortToken = issueAgentToken(agent);
    await stampToken(agent);
    return res.status(200).json({ shortToken });
  } catch (err) {
    logger.error({ err, agentId: agent._id }, "Failed to refresh agent token");
    if (err instanceof InvalidAgentIdentityError) {
      return res.status(401).json({ message: "Invalid token" });
    }
    return res.status(500).json({ message: "Failed to refresh token" });
  }
}

export async function decommissionAgent(req, res) {
  try {
    let agent = await Agent.findOneAndUpdate(
      {
        _id: req.params.agentId,
        orgId: req.user.orgId,
        decommissionedAt: null,
      },
      {
        $set: {
          decommissionedAt: new Date(),
          status: "offline",
          socketId: null,
        },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );

    if (!agent) {
      agent = await Agent.findOne({
        _id: req.params.agentId,
        orgId: req.user.orgId,
      });
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
    }

    const io = req.app.get("io");
    disconnectAgentSockets(io, agent._id);

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
