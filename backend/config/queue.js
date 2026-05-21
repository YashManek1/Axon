import { Queue } from "bullmq";
import Redis from "ioredis";
import { environment } from "./environment.js";
import { createChildLogger } from "./logger.js";

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

export { redisConnection, scheduledJobsQueue, immediateJobsQueue };
