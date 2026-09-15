import mongoose from "mongoose";

const JobHistorySchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true },
    runId: { type: String, default: null, index: true },
    targetExecutionId: { type: String, default: null },
    attemptId: { type: String, default: null },
    operationId: { type: String, default: null },
    targetAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", default: null },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    status: {
      type: String,
      enum: ["success", "failure", "timeout", "cancelled", "unknown"],
      required: true,
    },
    reasonCode: { type: String, default: null },

    // 1. Metadata (Small, Fast to Query)
    exitCode: { type: Number, default: null },
    duration: { type: Number }, // in milliseconds
    executedAt: { type: Date, default: Date.now },

    // 2. Structured Logs (Better than one big string)
    output: {
      stdout: { type: String }, // For now, keep string. In Sprint 5, we move this to S3.
      stderr: { type: String },
    },
  },
  { timestamps: true },
);

// Create an Index so loading history is fast
JobHistorySchema.index({ orgId: 1, executedAt: -1 });
JobHistorySchema.index({ jobId: 1, executedAt: -1 });

const JobHistory = mongoose.model("JobHistory", JobHistorySchema);
export default JobHistory;
