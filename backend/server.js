import dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import connectMongoDb from "./config/connection.js";
import cors from "cors";
import rateLimit from "express-rate-limit";

import userRoutes from "./routes/userR.js";
import jobRoutes from "./routes/jobR.js";
import adminRoutes from "./routes/adminR.js";

import Agent from "./models/agent.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many requests from this IP, please try again later.",
});

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

app.use("/user", userRoutes);
app.use("/jobs", jobRoutes);
app.use("/admin", adminRoutes);

io.use(async (socket, next) => {
  try {
    const { agentId, apiKey } = socket.handshake.auth;
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
    next();
  } catch (error) {
    console.error("Socket Auth Error:", error.message);
    next(new Error("Internal Server Error during Auth"));
  }
});

io.on("connection", async (socket) => {
  const agent = socket.agent; // attached by auth middleware
  console.log(`Agent Connected: ${agent.name} (${socket.id})`);

  // Mark Online
  agent.status = "online";
  agent.socketId = socket.id;
  agent.lastSeen = new Date();
  await agent.save();

  socket.on("heartbeat", async (data) => {
    // Update the Agent's systemInfo in DB
    await Agent.findByIdAndUpdate(agent._id, {
      lastSeen: new Date(),
      systemInfo: {
        os: data.os,
        arch: data.arch,
        cpuLoad: data.cpuLoad,
        ramTotal: data.ramTotal,
        ramUsed: data.ramUsed,
      },
    });
  });

  socket.on("disconnect", async () => {
    console.log(`Agent Disconnected: ${agent.name}`);
    await Agent.findByIdAndUpdate(agent._id, {
      status: "offline",
      socketId: null,
    });
  });
});

async function startServer() {
  try {
    await connectMongoDb(process.env.MONGO_URI);
    console.log("MongoDB Connected");
    server.listen(PORT, () => {
      console.log(`Axon Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
import "./workers/jobWorker.js";
