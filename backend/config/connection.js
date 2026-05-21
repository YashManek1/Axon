import mongoose from "mongoose";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger({ module: "mongo-connection" });

async function connectMongoDb(URL) {
  try {
    const conn = await mongoose.connect(URL, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      bufferCommands: false,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
    });
    logger.info({ host: conn.connection.host }, "Connected to MongoDB");

    mongoose.connection.on("connected", () => {
      logger.info({ readyState: mongoose.connection.readyState }, "Mongoose connected to MongoDB");
    });

    mongoose.connection.on("error", (err) => {
      logger.error({ err }, "Mongoose connection error");
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn({ readyState: mongoose.connection.readyState }, "Mongoose disconnected from MongoDB");
    });

    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      logger.info({ signal: "SIGINT" }, "MongoDB connection closed through app termination");
      process.exit(0);
    });

    return conn;
  } catch (err) {
    logger.fatal({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  }
}

export default connectMongoDb;
