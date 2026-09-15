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
      required: false,
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
    hardwareUuid: {
      type: String,
      required: true,
      trim: true,
    },
    decommissionedAt: {
      type: Date,
      default: null,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
    lastApiKeyRotatedAt: {
      type: Date,
      default: null,
    },
    tokenIssuedAt: {
      type: Date,
      default: null,
    },
    tokenExpiry: {
      type: Date,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
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
      os: String,
      arch: String,
      hostname: String,
      cpuLoad: Number, 
      ramTotal: Number, 
      ramUsed: Number, 
    },
    allowedCommands: {
      type: [String],
      default: [],
    },
    allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    allowedJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
    sandboxMode: {
      type: String,
      enum: ["none", "namespace", "docker"],
      default: "none",
    },
  },
  { timestamps: true },
);

AgentSchema.index({ orgId: 1, hardwareUuid: 1 }, { unique: true });

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
