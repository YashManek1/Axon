import mongoose from "mongoose";

export const RUN_STATUSES = [
  "ACCEPTED",
  "QUEUED",
  "DISPATCHING",
  "ACKNOWLEDGED",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "REJECTED",
  "CANCELLED",
  "UNKNOWN",
];

export const ATTEMPT_STATUSES = [
  "PENDING",
  "DISPATCHING",
  "ACKNOWLEDGED",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "REJECTED",
  "CANCELLED",
  "UNKNOWN",
];

const AttemptSchema = new mongoose.Schema(
  {
    attemptId: { type: String, required: true },
    targetExecutionId: { type: String, required: true },
    operationId: { type: String, required: true },
    sequence: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ATTEMPT_STATUSES, default: "PENDING" },
    dispatchedAt: Date,
    dispatchedGeneration: { type: Number, default: 0 },
    acknowledgedAt: Date,
    completedAt: Date,
    outcome: {
      type: String,
      enum: ["COMPLETED", "REJECTED", "TIMED_OUT", "CANCELLED", "UNKNOWN"],
    },
    exitCode: { type: Number, default: null },
    reasonCode: { type: String, default: null },
  },
  { _id: false },
);

const TransitionSchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true, min: 1 },
    from: { type: String, default: null },
    to: { type: String, enum: RUN_STATUSES, required: true },
    at: { type: Date, required: true },
    reasonCode: { type: String, default: null },
    source: {
      type: String,
      enum: ["API", "QUEUE", "WORKER", "RECOVERY"],
      required: true,
    },
    queueJobId: { type: String, default: null },
    attemptId: { type: String, default: null },
  },
  { _id: false },
);

const ApprovalSchema = new mongoose.Schema(
  {
    previewId: { type: String, required: true, immutable: true },
    previewVersion: { type: Number, required: true, immutable: true },
    previewHash: { type: String, required: true, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    acceptedAt: { type: Date, required: true, immutable: true },
    preview: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    material: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  },
  { _id: false, versionKey: false },
);

const NonDispatchProofSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, enum: [1], immutable: true },
    proofId: { type: String, required: true, immutable: true },
    attemptId: { type: String, required: true, immutable: true },
    targetAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      immutable: true,
    },
    fromTransitionSequence: { type: Number, required: true, min: 1, immutable: true },
    terminalTransitionSequence: { type: Number, required: true, min: 2, immutable: true },
    recordedAt: { type: Date, required: true, immutable: true },
  },
  { _id: false, versionKey: false },
);

const OperatorResolutionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, enum: [1], immutable: true },
    resolutionId: { type: String, required: true, immutable: true },
    requestFingerprint: { type: String, required: true, immutable: true },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    actorRole: {
      type: String,
      enum: ["admin", "operator"],
      required: true,
      immutable: true,
    },
    recordedAt: { type: Date, required: true, immutable: true },
    proofId: { type: String, required: true, immutable: true },
    terminalTransitionSequence: { type: Number, required: true, min: 2, immutable: true },
    purpose: {
      type: String,
      enum: ["RELEASE_NEVER_DISPATCHED", "RELEASE_DISPATCHED_QUIESCENT"],
      required: true,
      immutable: true,
    },
    reason: { type: String, required: true, minlength: 1, maxlength: 500, immutable: true },
    certificateHash: { type: String, default: null, immutable: true },
  },
  { _id: false, versionKey: false },
);

const JobRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },
    targetAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },
    targetSocketId: { type: String, required: true },
    // ACCEPTED recovery validates that this equals attempts[0].attemptId.
    // Keeping the deterministic identity explicit prevents duplicate dispatch.
    queueJobId: { type: String, required: true },
    requestKey: { type: String, default: null },
    requestFingerprint: { type: String, required: true },
    approval: { type: ApprovalSchema, default: null },
    reconciliationSafetyVersion: { type: Number, enum: [1], immutable: true },
    nonDispatchProof: { type: NonDispatchProofSchema, immutable: true },
    operatorResolution: { type: OperatorResolutionSchema, immutable: true },
    triggeredBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      ipAddress: { type: String, default: "unknown" },
      userAgent: { type: String, default: "unknown" },
    },
    triggerType: { type: String, default: "MANUAL_API" },
    action: {
      actionVersion: { type: String, required: true },
      command: { type: String, required: true },
      allowedCommands: { type: [String], default: [] },
      timeoutMs: { type: Number, required: true, min: 100, max: 300_000 },
      startBefore: { type: Number, required: true },
      maxOutputBytes: { type: Number, required: true, min: 1, max: 65_536 },
    },
    // ACCEPTED is the durable pending-dispatch intent and the only replayable
    // state. Every later state requires queue evidence or becomes UNKNOWN.
    status: { type: String, enum: RUN_STATUSES, default: "ACCEPTED", index: true },
    requiresReview: { type: Boolean, default: false },
    reasonCode: { type: String, default: null },
    queuedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    transitionSequence: { type: Number, required: true, default: 1, min: 1 },
    transitions: {
      type: [TransitionSchema],
      required: true,
      validate: {
        validator: (transitions) => transitions.length > 0 && transitions.length <= 64,
        message: "A run must retain between one and 64 transitions",
      },
    },
    terminalSummary: {
      status: { type: String, enum: RUN_STATUSES, default: null },
      outcome: { type: String, default: null },
      exitCode: { type: Number, default: null },
      reasonCode: { type: String, default: null },
      completedAt: { type: Date, default: null },
    },
    attempts: {
      type: [AttemptSchema],
      validate: {
        validator: (attempts) => attempts.length === 1,
        message: "This milestone supports exactly one dispatch attempt",
      },
      required: true,
    },
  },
  { timestamps: true },
);

JobRunSchema.index(
  { orgId: 1, "triggeredBy.userId": 1, requestKey: 1 },
  {
    unique: true,
    partialFilterExpression: { requestKey: { $type: "string" } },
  },
);
JobRunSchema.index(
  { "approval.previewId": 1 },
  {
    unique: true,
    name: "unique_approval_preview",
    partialFilterExpression: { "approval.previewId": { $type: "string" } },
  },
);
JobRunSchema.index({ orgId: 1, jobId: 1, createdAt: -1 });
JobRunSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model("JobRun", JobRunSchema);
