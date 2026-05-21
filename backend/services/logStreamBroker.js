import Job from "../models/job.js";
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

export async function publishLogChunk(jobId, orgId, chunk) {
  try {
    const normalizedChunk = {
      ...chunk,
      jobId: String(jobId),
      orgId: String(orgId),
    };
    const pipeline = redisConnection.pipeline();

    pipeline.lpush(logKey(jobId), JSON.stringify(normalizedChunk));
    pipeline.ltrim(logKey(jobId), 0, 999);
    pipeline.expire(logKey(jobId), 3600);
    await pipeline.exec();

    if (!socketServer) {
      return;
    }

    const sockets = await socketServer.in(jobRoom(jobId)).fetchSockets();
    await Promise.all(
      sockets
        .filter((socket) => String(socket.data?.orgId) === String(orgId))
        .map((socket) => socket.emit("log_chunk", normalizedChunk)),
    );
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

export async function subscribeClient(socket, jobId, orgId) {
  const job = await Job.findOne({ _id: jobId, orgId }).select("_id").lean();

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
