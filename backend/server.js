import dotenv from "dotenv";
import express from "express";
import connectMongoDb from "./config/connection.js";
import cors from "cors";
import rateLimit from "express-rate-limit"; 

import userRoutes from "./routes/userR.js";
import jobRoutes from "./routes/jobR.js";
import adminRoutes from "./routes/adminR.js";

import "./workers/jobWorker.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Security: Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again later.",
});
app.use(apiLimiter);

app.use(
  cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/users", userRoutes);
app.use("/jobs", jobRoutes);
app.use("/admin", adminRoutes);

async function startServer() {
  try {
    await connectMongoDb(process.env.MONGO_URI);
    console.log("MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`Axon Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
