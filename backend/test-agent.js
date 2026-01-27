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

    // 4. HANDLE EVENTS
    socket.on("connect", () => {
      console.log("🎉 SUCCESS: Connected to Server!");
      console.log("✅ Socket ID:", socket.id);
      console.log("⏳ Waiting for commands... (Press Ctrl+C to stop)");
    });

    socket.on("connect_error", (err) => {
      console.error("❌ CONNECTION REJECTED:", err.message);
      process.exit(1);
    });

    // --- SPRINT 3 LOGIC: LISTEN & REPLY ---
    socket.on("execute_command", (data, callback) => {
      console.log(
        `\n📩 RECEIVED COMMAND: "${data.command}" (Job ID: ${data.jobId})`,
      );
      console.log("⚙️  Simulating Execution...");

      // Simulate a 1-second delay (as if running a script)
      setTimeout(() => {
        console.log("✅ Execution Done. Sending Output.");

        // Send the result back to the server (Worker)
        callback({
          stdout: `MOCK OUTPUT: Executed '${data.command}' on Test-Agent`,
          stderr: "",
          exitCode: 0,
        });
      }, 1000);
    });
  } catch (err) {
    console.error("Setup Error:", err);
    process.exit(1);
  }
}

runTest();
