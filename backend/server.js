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
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import {
  markAgentOffline,
  recordHeartbeat,
} from "./services/agentTelemetryBuffer.js";
import { FLUSH_AGENT_TELEMETRY_JOB_NAME } from "./workers/telemetryFlushWorker.js";
import { configureJobWorker } from "./workers/jobWorker.js";
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

import Agent from "./models/agent.js";

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

function getCookieValue(cookieHeader, cookieName) {
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));

  return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null;
}

app.use(apiLimiter);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestId);

app.use("/user", userRoutes);
app.use("/jobs", jobRoutes);
app.use("/admin", adminRoutes);
app.use("/agents", agentProvisioningRoutes);
app.use("/agents", agentRoutes);
app.use("/audit", auditRoutes);
app.use(errorHandler);

io.use(async (socket, next) => {
  try {
    const { agentId, apiKey, token, clientType } = socket.handshake.auth;
    const sessionToken =
      token || getCookieValue(socket.handshake.headers.cookie, "axon_session");

    if (clientType === "ui" || sessionToken) {
      if (!sessionToken) {
        return next(new Error("Authentication error: Missing UI token"));
      }

      const user = jwt.verify(sessionToken, environment.JWT_SECRET);
      socket.clientType = "ui";
      socket.user = user;
      socket.orgId = String(user.orgId);
      socket.data.orgId = String(user.orgId);
      return next();
    }

    if (!agentId || !apiKey) {
      return next(new Error("Authentication error: Missing Credentials"));
    }
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return next(new Error("Authentication error: Agent not found"));
    }
    const isMatch = await agent.matchApiKey(apiKey);
    if (!isMatch) {
      return next(new Error("Authentication error: Invalid API Key"));
    }
    socket.agent = agent;
    socket.agentId = agent._id.toString();
    socket.clientType = "agent";
    socket.orgId = agent.orgId.toString();
    socket.data.orgId = agent.orgId.toString();
    next();
  } catch (error) {
    serverLogger.error({ err: error }, "Socket authentication failed");
    next(new Error("Internal Server Error during Auth"));
  }
});

io.on("connection", async (socket) => {
  socket.on("subscribe_job_logs", async (data) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(data?.jobId)) {
        socket.emit("log_subscription_error", {
          error: "INVALID_JOB_ID",
          jobId: data?.jobId,
        });
        return;
      }

      const subscribed = await subscribeClient(socket, data.jobId, socket.orgId);
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

  const agent = socket.agent; // attached by auth middleware
  serverLogger.info(
    { agentId: agent._id, agentName: agent.name, socketId: socket.id },
    "Agent connected",
  );

  // Mark Online
  agent.status = "online";
  agent.socketId = socket.id;
  agent.lastSeen = new Date();
  await agent.save();

  socket.on("heartbeat", async (data) => {
    await recordHeartbeat(socket.agentId, data);
  });

  socket.on("disconnect", async () => {
    serverLogger.info(
      { agentId: agent._id, agentName: agent.name, socketId: socket.id },
      "Agent disconnected",
    );
    await markAgentOffline(socket.agentId);
  });
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
