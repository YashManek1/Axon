// A script to simulate a Rust Agent connecting to your server
import { io } from "socket.io-client";
import mongoose from "mongoose";
import Agent from "./models/agent.js";
import User from "./models/user.js";
import Organization from "./models/organization.js";
import dotenv from "dotenv";

dotenv.config();

const SERVER_URL = "http://localhost:5000";

async function runTest() {
  try {
    // 1. Connect to DB to create a Fake Agent
    await mongoose.connect(process.env.MONGO_URI);
    console.log("📝 Connected to DB for setup...");

    // Find an existing user/org to attach the agent to
    const user = await User.findOne();
    const org = await Organization.findOne();

    if (!user || !org) {
      console.error(
        "❌ No User/Org found. Run your app and register a user first!",
      );
      process.exit(1);
    }

    // 2. Create/Reset a Dummy Agent
    const AGENT_NAME = "Test-Runner-01";
    const API_KEY = "secret_agent_key_123"; // Raw key

    // Delete if exists
    await Agent.deleteOne({ name: AGENT_NAME });

    // Create new
    const newAgent = new Agent({
      name: AGENT_NAME,
      userId: user._id,
      orgId: org._id,
      apiKey: API_KEY, // Will be hashed by pre-save hook
      status: "offline",
    });
    await newAgent.save();
    console.log(`✅ Created Fake Agent in DB: ${newAgent._id}`);

    // 3. ATTEMPT CONNECTION
    console.log("🔌 Attempting Socket Connection...");

    const socket = io(SERVER_URL, {
      auth: {
        agentId: newAgent._id.toString(),
        apiKey: API_KEY, // Sending the RAW key
      },
    });

    socket.on("connect", () => {
      console.log("🎉 SUCCESS: Connected to Server!");
      console.log("✅ Socket ID:", socket.id);
      console.log(
        "Check your MongoDB 'agents' collection. Status should be 'online'.",
      );

      // Keep alive for 5 seconds then kill
      setTimeout(() => {
        console.log("👋 Disconnecting...");
        socket.disconnect();
        process.exit(0);
      }, 5000);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ CONNECTION REJECTED:", err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error("Setup Error:", err);
    process.exit(1);
  }
}

runTest();
