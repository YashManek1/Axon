import express from "express";
import http from "http";
import { Server } from "socket.io";
import connectMongoDb from "./config/connection.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { environment } from "./config/environment.js";
import { createChildLogger } from "./config/logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { scheduledJobsQueue } from "./config/queue.js";
import mongoose from "mongoose";
import { FLUSH_AGENT_TELEMETRY_JOB_NAME } from "./workers/telemetryFlushWorker.js";
import { configureJobWorker } from "./workers/jobWorker.js";
import { httpRequestDuration, httpRequestTotal } from "./metrics.js";
import {
  configureLogStreamBroker,
  subscribeClient,
  unsubscribeClient,
} from "./services/logStreamBroker.js";

import userRoutes from "./routes/userR.js";
import jobRoutes from "./routes/jobR.js";
import adminRoutes from "./routes/adminR.js";
import agentRoutes from "./routes/agentR.js";
import agentProvisioningRoutes from "./routes/agentProvisioningR.js";
import auditRoutes from "./routes/auditR.js";

import { attachAgentConnection } from "./services/agentConnectionLifecycle.js";
import { authenticateSocket } from "./services/socketAuth.js";

const PORT = environment.PORT;
const app = express();
const serverLogger = createChildLogger({ module: "server" });

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
configureLogStreamBroker(io);
configureJobWorker(io);
app.set("io", io);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many requests from this IP, please try again later.",
});

// `origin: "*"` with `credentials: true` is invalid per the CORS spec and is rejected
// by every browser, which broke all authenticated requests. Reflecting an arbitrary
// origin would be spec-valid but disables same-origin protection, so the allowed
// origins come from an explicit allowlist in config/environment.js.
const allowedOrigins = environment.CORS_ALLOWED_ORIGINS.split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin navigations, curl, server-to-server.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Omit the CORS headers rather than throwing: the browser blocks the
      // response either way, and throwing here would turn every disallowed
      // preflight into a 500 in the logs.
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  }),
);

// The rate limiter MUST run after CORS. Mounted before it, a 429 is returned
// without Access-Control-Allow-Origin, so the browser reports a misleading
// "blocked by CORS policy" error instead of the real cause, and the client
// cannot read the RateLimit-* headers telling it when to retry.
app.use(apiLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestId);

// HTTP metrics middleware: record duration and count by method, route, status
app.use((req, res, next) => {
  const startMs = Date.now();
  const originalSend = res.send;

  res.send = function (data) {
    const durationSec = (Date.now() - startMs) / 1000;
    const route = req.baseUrl || req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status: res.statusCode },
      durationSec,
    );
    httpRequestTotal.inc({ method: req.method, route, status: res.statusCode });
    return originalSend.call(this, data);
  };

  next();
});

app.use("/user", userRoutes);
app.use("/jobs", jobRoutes);
app.use("/admin", adminRoutes);
app.use("/agents", agentProvisioningRoutes);
app.use("/agents", agentRoutes);
app.use("/audit", auditRoutes);
app.use(errorHandler);

io.use(authenticateSocket);

io.on("connection", async (socket) => {
  socket.on("subscribe_job_logs", async (data) => {
    try {
      if (socket.clientType !== "ui") {
        socket.emit("log_subscription_error", { error: "UI_SESSION_REQUIRED" });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(data?.jobId)) {
        socket.emit("log_subscription_error", {
          error: "INVALID_JOB_ID",
          jobId: data?.jobId,
        });
        return;
      }

      const subscribed = await subscribeClient(socket, data.jobId, socket.user);
      if (!subscribed) {
        socket.emit("log_subscription_error", {
          error: "JOB_NOT_FOUND",
          jobId: data.jobId,
        });
      }
    } catch (err) {
      serverLogger.error(
        { err, socketId: socket.id, jobId: data?.jobId, orgId: socket.orgId },
        "Failed to subscribe socket to job logs",
      );
      socket.emit("log_subscription_error", {
        error: "SUBSCRIPTION_FAILED",
        jobId: data?.jobId,
      });
    }
  });

  socket.on("unsubscribe_job_logs", async (data) => {
    try {
      if (data?.jobId) {
        await unsubscribeClient(socket, data.jobId);
      }
    } catch (err) {
      serverLogger.error(
        { err, socketId: socket.id, jobId: data?.jobId, orgId: socket.orgId },
        "Failed to unsubscribe socket from job logs",
      );
    }
  });

  if (socket.clientType === "ui") {
    serverLogger.info(
      { userId: socket.user?.id || socket.user?._id, orgId: socket.orgId, socketId: socket.id },
      "UI client connected",
    );
    return;
  }

  await attachAgentConnection(socket);
});

async function startServer() {
  try {
    await connectMongoDb(environment.MONGO_URI);
    await scheduledJobsQueue.add(
      FLUSH_AGENT_TELEMETRY_JOB_NAME,
      {},
      {
        repeat: { every: 30000 },
        jobId: "telemetry-flush-singleton",
      },
    );
    serverLogger.info({ mongoUriConfigured: true }, "MongoDB connected");
    server.listen(PORT, () => {
      serverLogger.info({ port: PORT }, "Axon server started");
    });
  } catch (err) {
    serverLogger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }
}

startServer();
