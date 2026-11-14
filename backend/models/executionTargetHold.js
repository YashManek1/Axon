import mongoose from "mongoose";

const ExecutionTargetHoldSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    targetAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
    },
    runId: { type: String, required: true },
    attemptId: { type: String, required: true },
    fencingToken: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

ExecutionTargetHoldSchema.index(
  { organizationId: 1, targetAgentId: 1 },
  { unique: true, name: "execution_target_owner" },
);

const ExecutionTargetHold = mongoose.model("ExecutionTargetHold", ExecutionTargetHoldSchema);

export default ExecutionTargetHold;
