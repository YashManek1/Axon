import mongoose from "mongoose";

const JobHistorySchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, index: true },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    status: {
      type: String,
      enum: ["success", "failure", "timeout"],
      required: true,
    },

    // 1. Metadata (Small, Fast to Query)
    exitCode: { type: Number, default: 0 },
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

const JobHistory = mongoose.model("JobHistory", JobHistorySchema);
export default JobHistory;
