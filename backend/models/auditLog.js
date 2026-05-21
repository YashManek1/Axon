import mongoose from "mongoose";

const immutableFields = ["startedAt", "jobId", "orgId", "triggeredBy"];

const auditLogSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
    index: true,
  },
  orgId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  triggeredBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, required: true },
  },
  triggerType: {
    type: String,
    enum: ["SCHEDULED", "MANUAL_API", "MANUAL_UI", "RETRY"],
    required: true,
  },
  command: { type: String, required: true },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    required: false,
  },
  status: {
    type: String,
    enum: ["PENDING", "DISPATCHED", "COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"],
    required: true,
  },
  startedAt: { type: Date, default: Date.now, index: true },
  completedAt: { type: Date, required: false },
  durationMs: { type: Number, required: false },
  exitCode: { type: Number, required: false },
  stdoutSummary: { type: String, maxlength: 10000, required: false },
  stderrSummary: { type: String, maxlength: 10000, required: false },
  metadata: { type: mongoose.Schema.Types.Mixed, required: false },
});

auditLogSchema.pre("save", function preventImmutableChanges(next) {
  if (this.isNew) {
    return next();
  }

  const modifiedImmutableField = immutableFields.find((field) =>
    this.isModified(field),
  );

  if (modifiedImmutableField) {
    return next(
      new Error(`Audit field ${modifiedImmutableField} is immutable`),
    );
  }

  return next();
});

auditLogSchema.index({ orgId: 1, startedAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
