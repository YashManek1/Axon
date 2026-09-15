import Agent from "../models/agent.js";
import { agentConnected } from "../metrics.js";
import { markAgentOffline, recordHeartbeat } from "./agentTelemetryBuffer.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "agent-connection" });

// Claim the connection against current credentials, not the handshake snapshot.
export async function attachAgentConnection(socket) {
  let claimed = false;
  let counted = false;
  const generation = socket.authGeneration;
  const identity = { socketId: socket.id, tokenVersion: generation };
  const filter = {
    _id: socket.agentId,
    orgId: socket.orgId,
    decommissionedAt: null,
    ...(generation === 0
      ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
      : { tokenVersion: generation }),
  };

  const release = async () => {
    if (!claimed) return;
    claimed = false;
    if (counted) {
      agentConnected.dec();
      counted = false;
    }
    try {
      await Agent.updateOne(
        { ...filter, socketId: socket.id },
        { $set: { status: "offline", socketId: null } },
      );
      await markAgentOffline(socket.agentId, identity);
    } catch (err) {
      logger.error({ err, agentId: socket.agentId }, "Agent connection cleanup failed");
    }
  };

  // Disconnect can happen while the database claim is awaiting completion.
  socket.on("disconnect", release);
  try {
    const agent = await Agent.findOneAndUpdate(
      { ...filter, ...(socket.authApiKeyHash ? { apiKey: socket.authApiKeyHash } : {}) },
      { $set: { status: "online", socketId: socket.id, lastSeen: new Date() } },
      { new: true },
    );
    if (!agent) {
      socket.disconnect(true);
      return false;
    }
    claimed = true;
    if (!socket.connected) {
      await release();
      return false;
    }
    agentConnected.inc();
    counted = true;
    socket.agent = agent;
    socket.on("heartbeat", async (data) => {
      try {
        await recordHeartbeat(socket.agentId, data, identity);
      } catch (err) {
        logger.error({ err, agentId: socket.agentId }, "Agent heartbeat failed");
      }
    });
    return true;
  } catch (err) {
    logger.error({ err, agentId: socket.agentId }, "Agent connection claim failed");
    socket.disconnect(true);
    await release();
    return false;
  }
}
