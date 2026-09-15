import { resolveAgentToken } from "../controllers/agentProvisioningC.js";
import { resolveHumanSession } from "../middlewares/jwt.js";
import Agent from "../models/agent.js";
import jwt from "jsonwebtoken";

function getCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null;
}

function setSocketIdentity(socket, clientType, identity, options = {}) {
  socket.clientType = clientType;
  socket.orgId = String(identity.orgId);
  socket.data.orgId = String(identity.orgId);
  if (clientType === "ui") {
    socket.user = identity;
    socket.data.sessionToken = options.sessionToken;
  } else {
    socket.agent = identity;
    socket.agentId = identity._id.toString();
    socket.authGeneration = Number(options.tokenVersion ?? identity.tokenVersion ?? 0);
    socket.authApiKeyHash = options.apiKeyHash ?? null;
    const protocolVersions = Array.isArray(options.protocolVersions)
      ? options.protocolVersions.filter(Number.isInteger)
      : [];
    socket.protocolVersions = protocolVersions;
    socket.data.protocolVersions = protocolVersions;
  }
}

export async function authenticateSocket(socket, next) {
  try {
    const {
      agentId,
      apiKey,
      shortToken,
      token,
      clientType,
      protocolVersions,
    } = socket.handshake.auth;
    const sessionToken = token || getCookieValue(
      socket.handshake.headers.cookie,
      "axon_session",
    );

    if (clientType === "ui" || sessionToken) {
      if (!sessionToken) {
        return next(new Error("Authentication error: Missing UI token"));
      }
      const user = await resolveHumanSession(sessionToken);
      setSocketIdentity(socket, "ui", user, { sessionToken });
      return next();
    }

    if (shortToken) {
      const agent = await resolveAgentToken(shortToken);
      const payload = jwt.decode(shortToken);
      setSocketIdentity(socket, "agent", agent, {
        tokenVersion: payload?.tokenVersion ?? 0,
        protocolVersions,
      });
      return next();
    }

    if (!agentId || !apiKey) {
      return next(new Error("Authentication error: Missing Credentials"));
    }
    const agent = await Agent.findById(agentId);
    if (!agent || agent.decommissionedAt) {
      return next(new Error("Authentication error: Agent unavailable"));
    }
    if (!(await agent.matchApiKey(apiKey))) {
      return next(new Error("Authentication error: Invalid API Key"));
    }
    setSocketIdentity(socket, "agent", agent, {
      tokenVersion: agent.tokenVersion ?? 0,
      apiKeyHash: agent.apiKey,
      protocolVersions,
    });
    return next();
  } catch (error) {
    return next(new Error(`Authentication error: ${error.message}`));
  }
}
