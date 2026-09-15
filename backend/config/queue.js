import { Queue } from "bullmq";
import Redis from "ioredis";
import { environment } from "./environment.js";
import { createChildLogger } from "./logger.js";
import { queueDepth } from "../metrics.js";

const logger = createChildLogger({ module: "queue" });

const redisConnection = new Redis(environment.REDIS_URI, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisConnection.on("connect", () => {
  logger.info({ redisUriConfigured: true }, "Connected to Redis");
});

redisConnection.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

const scheduledJobsQueue = new Queue("scheduled-jobs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      //backoff strategy for retries
      type: "exponential", // exponential backoff strategy
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // 1 day
      count: 1000, // keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // 7 days
    },
  },
});

const immediateJobsQueue = new Queue("immediate-jobs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // 1 day
      count: 1000, // keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600, // 1 day
    },
  },
});

// Periodic queue depth collector: updates metrics every 15 seconds.
// Wraps in try/catch and timeout to prevent Redis hiccups from crashing.
function startQueueDepthCollector() {
  const queues = [
    { instance: scheduledJobsQueue, name: "scheduled-jobs" },
    { instance: immediateJobsQueue, name: "immediate-jobs" },
  ];

  const interval = setInterval(async () => {
    for (const { instance, name } of queues) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const counts = await instance.getJobCounts();
        clearTimeout(timeoutId);

        // Record depth for each state (waiting, active, delayed, failed, completed).
        for (const [state, count] of Object.entries(counts)) {
          queueDepth.set({ queue: name, state }, count);
        }
      } catch (err) {
        // Log but do not crash: queue metrics are observability, not critical path.
        if (err?.name !== "AbortError") {
          logger.warn(
            { err, queueName: name },
            "Failed to collect queue depth metrics",
          );
        }
      }
    }
  }, 15000);

  // Unref so this interval does not keep the process alive on shutdown.
  interval.unref();
}

startQueueDepthCollector();

export { redisConnection, scheduledJobsQueue, immediateJobsQueue };
