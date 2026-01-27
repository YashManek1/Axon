import mongoose from "mongoose";
import bcrypt from "bcrypt";

const AgentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    apiKey: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["online", "offline", "busy"],
      default: "offline",
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    socketId: {
      type: String, // Tracks the live socket connection ID
      default: null,
    },
    systemInfo: {
      // Stores metadata sent by the Rust Agent (OS, CPU, etc.)
      os: String,
      arch: String,
      hostname: String,
      version: String,
    },
  },
  { timestamps: true },
);

AgentSchema.pre("save", async function (next) {
  if (!this.isModified("apiKey")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.apiKey = await bcrypt.hash(this.apiKey, salt);
    next();
  } catch (error) {
    next(error);
  }
});

AgentSchema.methods.matchApiKey = async function (enteredKey) {
  return await bcrypt.compare(enteredKey, this.apiKey);
};

const Agent = mongoose.model("Agent", AgentSchema);
export default Agent;
