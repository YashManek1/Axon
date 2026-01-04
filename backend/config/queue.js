import { Queue } from "bullmq";
import Redis from "ioredis";
import { constants } from "os";

const redisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redisConnection.on("connect", () => {
  console.log("Connected to Redis");
});

redisConnection.on("error", (err) => {
  console.error("Redis connection error:", err);
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
