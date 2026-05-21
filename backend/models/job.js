import mongoose from "mongoose";

const HttpPayloadSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    method: { type: String, required: true },
    headers: { type: Object, default: {} },
    body: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const ShellPayloadSchema = new mongoose.Schema(
  {
    command: { type: String, required: true },
  },
  { _id: false },
);

const JobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  category: { type: String, default: "Automation" },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High"],
    default: "Medium",
  },
  tags: [{ type: String }],
  timeout: { type: Number, default: 30 }, // timeout in seconds
  notifications: {
    onSuccess: { type: Boolean, default: false },
    onFailure: { type: Boolean, default: true },
    recipients: [{ type: String }],
  },
  executionWindow: {
    enabled: { type: Boolean, default: false },
    startTime: { type: String, default: "00:00" }, // e.g. "08:00"
    endTime: { type: String, default: "23:59" },
    activeDays: [
      { type: String, enum: ["M", "T", "W", "Th", "F", "Sa", "Su"] },
    ],
  },
  type: { type: String, enum: ["http", "shell"], required: true },
  schedule: { type: String, required: true }, // cron syntax
  scheduleType: {
    type: String,
    enum: ["Cron", "Interval", "Once"],
    default: "Cron",
  },
  timezone: { type: String, default: "UTC" },
  payload: { type: mongoose.Schema.Types.Mixed, required: true }, // HttpPayload or ShellPayload
  enabled: { type: Boolean, default: true },
  retryLimit: { type: Number, default: 0 }, // number of retries on failure
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  webhookUrl: { type: String, default: null },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  sink: {
    type: { type: String, enum: ["mongo", null], default: null },
    uri: { type: String, default: null },
    databaseName: { type: String, default: null },
    collectionName: { type: String, default: null },
    exportFormat: [{ type: String, enum: ["CSV", "JSON", "Excel"] }],
    encryptionAlg: { type: String, default: "AES-256-GCM" },
  },
  status: {
    type: String,
    default: "active",
    enum: ["active", "paused"],
    index: true,
  },
  nextRunAt: { type: Date, index: true },
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: "Job" }],
});

JobSchema.index({ orgId: 1, status: 1 });

export default mongoose.model("Job", JobSchema);
