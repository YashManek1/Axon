import crypto from "crypto";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Organization from "../models/organization.js";
import { createChildLogger } from "../config/logger.js";
import { createAuditRecord } from "../services/auditService.js";

const logger = createChildLogger({ module: "org-api-keys-controller" });

// Wire format: axk_<keyId>_<secret>
// keyId: 16 hex chars (public, indexed)
// secret: 32 bytes base64url (never stored in plaintext)

function generateApiKey() {
  const keyId = crypto.randomBytes(8).toString("hex"); // 16 hex chars
  const secret = crypto.randomBytes(32).toString("base64url"); // 32 bytes -> base64url
  return {
    keyId,
    secret,
    wireFormat: `axk_${keyId}_${secret}`,
  };
}

async function auditKeyOperation({ orgId, userId, ipAddress, userAgent, command, keyId }) {
  try {
    await createAuditRecord({
      jobId: new mongoose.Types.ObjectId(),
      orgId,
      triggeredBy: {
        userId,
        ipAddress: ipAddress || "unknown",
        userAgent: userAgent || "unknown",
      },
      triggerType: "MANUAL_API",
      command,
      status: "COMPLETED",
      completedAt: new Date(),
      metadata: {
        auditType: "ORG_API_KEY_MANAGEMENT",
        keyId,
      },
    });
  } catch (err) {
    logger.error({ err, orgId, command, keyId }, "Failed to write API key audit record");
  }
}

export async function createApiKey(req, res) {
  // Defence in depth: explicit role check (should not rely on route middleware alone)
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin privileges required",
    });
  }

  try {
    const { label } = req.body;
    if (!label || typeof label !== "string" || label.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "label is required and must be a non-empty string",
      });
    }

    const org = await Organization.findById(req.user.orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const { keyId, secret, wireFormat } = generateApiKey();
    const hash = await bcrypt.hash(secret, 10);

    org.apiKeys.push({
      keyId,
      hash,
      label: label.trim(),
      createdBy: req.user.id,
      createdAt: new Date(),
    });

    await org.save();

    await auditKeyOperation({
      orgId: req.user.orgId,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      command: "CREATE_ORG_API_KEY",
      keyId,
    });

    // Return plaintext key ONLY at creation time
    return res.status(201).json({
      success: true,
      apiKey: wireFormat,
      keyId,
      label: label.trim(),
      createdAt: new Date().toISOString(),
      message: "API key created successfully. Save it now — it will not be retrievable later.",
    });
  } catch (error) {
    logger.error(
      { err: error, orgId: req.user?.orgId, userId: req.user?.id },
      "Error creating API key",
    );
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export async function listApiKeys(req, res) {
  // Defence in depth: explicit role check (should not rely on route middleware alone)
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin privileges required",
    });
  }

  try {
    const org = await Organization.findById(req.user.orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    // Return metadata only: never the secret or hash
    const keys = org.apiKeys.map((key) => ({
      keyId: key.keyId,
      label: key.label,
      createdAt: key.createdAt,
      createdBy: key.createdBy,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    }));

    return res.status(200).json({
      success: true,
      apiKeys: keys,
    });
  } catch (error) {
    logger.error(
      { err: error, orgId: req.user?.orgId, userId: req.user?.id },
      "Error listing API keys",
    );
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

export async function revokeApiKey(req, res) {
  // Defence in depth: explicit role check (should not rely on route middleware alone)
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Admin privileges required",
    });
  }

  try {
    const { keyId } = req.params;
    if (!keyId) {
      return res.status(400).json({
        success: false,
        message: "keyId is required",
      });
    }

    const org = await Organization.findById(req.user.orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const apiKey = org.apiKeys.find((k) => k.keyId === keyId && !k.revokedAt);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: "API key not found or already revoked",
      });
    }

    apiKey.revokedAt = new Date();
    await org.save();

    await auditKeyOperation({
      orgId: req.user.orgId,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      command: "REVOKE_ORG_API_KEY",
      keyId,
    });

    return res.status(200).json({
      success: true,
      message: "API key revoked successfully",
      keyId,
      revokedAt: apiKey.revokedAt.toISOString(),
    });
  } catch (error) {
    logger.error(
      { err: error, orgId: req.user?.orgId, userId: req.user?.id, keyId: req.params?.keyId },
      "Error revoking API key",
    );
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
