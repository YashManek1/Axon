import JobRun from "../models/jobRun.js";

const RUN_PROJECTION = [
  "_id",
  "runId",
  "jobId",
  "targetAgentId",
  "status",
  "requiresReview",
  "reasonCode",
  "createdAt",
  "updatedAt",
  "queuedAt",
  "completedAt",
  "transitionSequence",
  "attempts.attemptId",
  "attempts.targetExecutionId",
  "attempts.operationId",
  "attempts.sequence",
  "attempts.status",
  "attempts.dispatchedAt",
  "attempts.acknowledgedAt",
  "attempts.completedAt",
  "attempts.outcome",
  "attempts.exitCode",
  "attempts.reasonCode",
  "transitions.sequence",
  "transitions.from",
  "transitions.to",
  "transitions.at",
  "transitions.reasonCode",
  "transitions.source",
  "transitions.attemptId",
  "terminalSummary.status",
  "terminalSummary.outcome",
  "terminalSummary.exitCode",
  "terminalSummary.reasonCode",
  "terminalSummary.completedAt",
].join(" ");

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const serializeAttempt = (attempt) => ({
  attemptId: attempt.attemptId,
  targetExecutionId: attempt.targetExecutionId,
  operationId: attempt.operationId,
  sequence: attempt.sequence,
  status: attempt.status,
  dispatchedAt: attempt.dispatchedAt,
  acknowledgedAt: attempt.acknowledgedAt,
  completedAt: attempt.completedAt,
  outcome: attempt.outcome,
  exitCode: attempt.exitCode,
  reasonCode: attempt.reasonCode,
});

const serializeTransition = (transition) => ({
  sequence: transition.sequence,
  from: transition.from,
  to: transition.to,
  at: transition.at,
  reasonCode: transition.reasonCode,
  source: transition.source,
  attemptId: transition.attemptId,
});

const serializeTerminalSummary = (summary) => ({
  status: summary?.status,
  outcome: summary?.outcome,
  exitCode: summary?.exitCode,
  reasonCode: summary?.reasonCode,
  completedAt: summary?.completedAt,
});

const serializeRun = (run) => ({
  runId: run.runId,
  jobId: String(run.jobId),
  targetAgentId: String(run.targetAgentId),
  status: run.status,
  requiresReview: run.requiresReview,
  reasonCode: run.reasonCode,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  queuedAt: run.queuedAt,
  completedAt: run.completedAt,
  transitionSequence: run.transitionSequence,
  attempts: Array.isArray(run.attempts) ? run.attempts.map(serializeAttempt) : [],
  transitions: Array.isArray(run.transitions)
    ? run.transitions.map(serializeTransition)
    : [],
  terminalSummary: serializeTerminalSummary(run.terminalSummary),
});

export const noStoreRunEvidence = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

export const listJobRuns = async (req, res) => {
  try {
    const matches = await JobRun.find({
      orgId: req.user.orgId,
      jobId: req.resource._id,
    })
      .select(RUN_PROJECTION)
      .sort({ createdAt: -1, _id: -1 })
      .limit(11)
      .lean();

    return res.status(200).json({
      runs: matches.slice(0, 10).map(serializeRun),
      hasMore: matches.length > 10,
    });
  } catch (_error) {
    return res.status(503).json({ message: "Run evidence unavailable" });
  }
};

export const getJobRun = async (req, res) => {
  if (!CANONICAL_UUID.test(req.params.runId)) {
    return res.status(400).json({ message: "Invalid run ID" });
  }

  try {
    const run = await JobRun.findOne({
      orgId: req.user.orgId,
      jobId: req.resource._id,
      runId: req.params.runId.toLowerCase(),
    })
      .select(RUN_PROJECTION)
      .lean();

    if (!run) {
      return res.status(404).json({ message: "Run not found" });
    }

    return res.status(200).json(serializeRun(run));
  } catch (_error) {
    return res.status(503).json({ message: "Run evidence unavailable" });
  }
};
