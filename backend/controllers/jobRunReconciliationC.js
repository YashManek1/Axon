import {
  getJobRunReconciliation,
  JobRunReconciliationError,
  resolveDispatchedQuiescentRun,
  resolveNeverDispatchedRun,
} from "../services/jobRunReconciliationService.js";

function sendError(res, error) {
  if (error instanceof JobRunReconciliationError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...error.details,
    });
  }
  return res.status(503).json({
    error: "RECONCILIATION_UNAVAILABLE",
    message: "Reconciliation evidence is unavailable",
  });
}

export const getRunReconciliation = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const result = await getJobRunReconciliation({
      orgId: req.user.orgId,
      jobId: req.resource._id,
      runId: req.params.runId,
      actorId: req.user.id ?? req.user._id,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const postRunReconciliation = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const resolver = req.body?.certificate
      ? resolveDispatchedQuiescentRun
      : resolveNeverDispatchedRun;
    const result = await resolver({
      orgId: req.user.orgId,
      jobId: req.resource._id,
      runId: req.params.runId,
      actorId: req.user.id ?? req.user._id,
      resolutionId: req.header("Idempotency-Key"),
      body: req.body,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};
