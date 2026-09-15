import Job from "../models/job.js";
import {
  isInvalidHumanSessionError,
  resourceAccessFilter,
  resolveHumanSession,
} from "../middlewares/jwt.js";
import { redisConnection } from "../config/queue.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "log-stream-broker" });
let socketServer = null;

function logKey(jobId) {
  return `log:stream:${jobId}`;
}

function jobRoom(jobId) {
  return `job:${jobId}`;
}

export function configureLogStreamBroker(io) {
  socketServer = io;
}

export async function publishLogChunk(jobId, orgId, chunk, streamId = jobId) {
  try {
    const normalizedChunk = {
      ...chunk,
      jobId: String(jobId),
      orgId: String(orgId),
    };
    const pipeline = redisConnection.pipeline();

    pipeline.lpush(logKey(streamId), JSON.stringify(normalizedChunk));
    pipeline.ltrim(logKey(streamId), 0, 999);
    pipeline.expire(logKey(streamId), 3600);
    await pipeline.exec();

    if (!socketServer) {
      return;
    }

    const sockets = await socketServer.in(jobRoom(jobId)).fetchSockets();
    await Promise.all(sockets.map(async (socket) => {
      try {
        if (socket.clientType !== "ui" || !socket.data?.sessionToken) return;
        const currentUser = await resolveHumanSession(socket.data.sessionToken);
        const canRead = await Job.exists({
          _id: jobId,
          ...resourceAccessFilter(currentUser),
        });
        if (!canRead || String(currentUser.orgId) !== String(orgId)) {
          await socket.leave(jobRoom(jobId));
          return;
        }
        socket.user = currentUser;
        socket.emit("log_chunk", normalizedChunk);
      } catch (error) {
        await socket.leave(jobRoom(jobId));
        if (isInvalidHumanSessionError(error)) {
          socket.emit("log_subscription_error", {
            error: "SESSION_INVALID",
            jobId: String(jobId),
          });
          socket.disconnect(true);
        } else {
          socket.emit("log_subscription_error", {
            error: "AUTHENTICATION_UNAVAILABLE",
            jobId: String(jobId),
          });
        }
      }
    }));
  } catch (err) {
    logger.error({ err, jobId, orgId }, "Failed to publish log chunk");
  }
}

export async function getRecentLogs(jobId, count = 100) {
  const items = await redisConnection.lrange(logKey(jobId), 0, count - 1);

  return items
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch (err) {
        logger.warn({ err, jobId }, "Skipping malformed log chunk");
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
}

export async function subscribeClient(socket, jobId, user) {
  if (socket.clientType !== "ui" || !socket.data?.sessionToken || !user) {
    return false;
  }

  const currentUser = await resolveHumanSession(socket.data.sessionToken);
  socket.user = currentUser;

  const job = await Job.findOne({
    _id: jobId,
    ...resourceAccessFilter(currentUser),
  }).select("_id").lean();

  if (!job) {
    return false;
  }

  await socket.join(jobRoom(jobId));
  const recentLogs = await getRecentLogs(jobId);
  socket.emit("log_catchup", { jobId: String(jobId), logs: recentLogs });
  return true;
}

export async function unsubscribeClient(socket, jobId) {
  await socket.leave(jobRoom(jobId));
}
