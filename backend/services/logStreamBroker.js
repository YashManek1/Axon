import Job from "../models/job.js";
import {
  isInvalidHumanSessionError,
  resourceAccessFilter,
  resolveHumanSession,
} from "../middlewares/jwt.js";
import { redisConnection } from "../config/queue.js";
import { createChildLogger } from "../config/logger.js";

const logger = createChildLogger({ module: "log-stream-broker" });
const LOG_RETENTION_SECONDS = 3600;
const LOG_METADATA_RETENTION_SECONDS = 86400;
const MAX_RETAINED_LOGS = 1000;
let socketServer = null;

function logKey(streamId) {
  return `log:stream:${streamId}`;
}

function sequenceKey(streamId) {
  return `log:sequence:${streamId}`;
}

function metadataKey(streamId) {
  return `log:metadata:${streamId}`;
}

function jobRoom(jobId) {
  return `job:${jobId}`;
}

export function configureLogStreamBroker(io) {
  socketServer = io;
}

export async function publishLogChunk(jobId, orgId, chunk, streamId = jobId) {
  try {
    const normalizedStreamId = String(streamId);
    const sequence = await redisConnection.incr(sequenceKey(normalizedStreamId));
    const publishedAtMs = Date.now();
    const normalizedChunk = {
      ...chunk,
      jobId: String(jobId),
      orgId: String(orgId),
      streamId: normalizedStreamId,
      sequence,
    };
    const pipeline = redisConnection.pipeline();

    pipeline.lpush(logKey(normalizedStreamId), JSON.stringify(normalizedChunk));
    pipeline.ltrim(logKey(normalizedStreamId), 0, MAX_RETAINED_LOGS - 1);
    pipeline.expire(logKey(normalizedStreamId), LOG_RETENTION_SECONDS);
    pipeline.expire(sequenceKey(normalizedStreamId), LOG_METADATA_RETENTION_SECONDS);
    pipeline.hset(metadataKey(normalizedStreamId), {
      lastSequence: sequence,
      lastPublishedAtMs: publishedAtMs,
      expiresAtMs: publishedAtMs + LOG_RETENTION_SECONDS * 1000,
    });
    pipeline.expire(metadataKey(normalizedStreamId), LOG_METADATA_RETENTION_SECONDS);
    await pipeline.exec();

    if (!socketServer) {
      return normalizedChunk;
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
    return normalizedChunk;
  } catch (err) {
    logger.error({ err, jobId, orgId }, "Failed to publish log chunk");
    return null;
  }
}

export async function getLogEvidence(streamId, count = 100, afterSequence = null) {
  const normalizedStreamId = String(streamId);
  const [items, metadata] = await Promise.all([
    redisConnection.lrange(logKey(normalizedStreamId), 0, MAX_RETAINED_LOGS - 1),
    redisConnection.hgetall(metadataKey(normalizedStreamId)),
  ]);
  let malformed = false;
  const retained = items
    .map((item) => {
      try {
        return JSON.parse(item);
      } catch (err) {
        malformed = true;
        logger.warn({ err, streamId: normalizedStreamId }, "Skipping malformed log chunk");
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));

  const metadataPresent = metadata && Object.keys(metadata).length > 0;
  const lastSequence = metadataPresent
    ? Number(metadata.lastSequence || 0)
    : Number(retained.at(-1)?.sequence || 0);
  const retainedFromSequence = retained.length ? Number(retained[0].sequence) : null;
  const requestedAfter = afterSequence === null || afterSequence === undefined
    ? null
    : Number(afterSequence);
  let gap = malformed;
  for (let index = 1; index < retained.length; index += 1) {
    if (Number(retained[index].sequence) !== Number(retained[index - 1].sequence) + 1) {
      gap = true;
      break;
    }
  }
  if (
    requestedAfter !== null &&
    retainedFromSequence !== null &&
    requestedAfter < retainedFromSequence - 1
  ) {
    gap = true;
  }

  if (retained.length === 0) {
    const expired = metadataPresent && lastSequence > 0;
    return {
      streamId: normalizedStreamId,
      logs: [],
      cursor: requestedAfter ?? lastSequence,
      retainedFromSequence: null,
      lastSequence,
      gap: expired,
      expired,
      availability: expired ? "EXPIRED" : "UNAVAILABLE",
      reasonCode: expired ? "LOG_EVIDENCE_EXPIRED" : "LOG_EVIDENCE_UNAVAILABLE",
    };
  }

  const filtered = requestedAfter === null
    ? retained.slice(-Math.max(0, count))
    : retained.filter((entry) => Number(entry.sequence) > requestedAfter).slice(0, Math.max(0, count));
  return {
    streamId: normalizedStreamId,
    logs: filtered,
    cursor: Number(filtered.at(-1)?.sequence ?? requestedAfter ?? lastSequence),
    retainedFromSequence,
    lastSequence,
    gap,
    expired: false,
    availability: "AVAILABLE",
    reasonCode: gap ? "LOG_CURSOR_GAP" : null,
  };
}

export async function getRecentLogs(streamId, count = 100) {
  const evidence = await getLogEvidence(streamId, count);
  return evidence.logs;
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
  const evidence = await getLogEvidence(jobId);
  socket.emit("log_catchup", {
    jobId: String(jobId),
    logs: evidence.logs,
    cursor: evidence.cursor,
    gap: evidence.gap,
    expired: evidence.expired,
    availability: evidence.availability,
    reasonCode: evidence.reasonCode,
  });
  return true;
}

export async function unsubscribeClient(socket, jobId) {
  await socket.leave(jobRoom(jobId));
}
