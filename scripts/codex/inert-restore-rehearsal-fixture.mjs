import { randomUUID } from "node:crypto";

export function generateSyntheticDataset(runId) {
  const t1 = `tenant-1-${runId.slice(0, 8)}`;
  const t2 = `tenant-2-${runId.slice(0, 8)}`;

  const user1 = `user-1-${runId.slice(0, 8)}`;
  const user2 = `user-2-${runId.slice(0, 8)}`;

  const agent1 = `agent-1-${runId.slice(0, 8)}`;
  const agent2 = `agent-2-${runId.slice(0, 8)}`;

  const jobSuccessId = `job-succ-${runId.slice(0, 8)}`;
  const jobUnknownId = `job-unkn-${runId.slice(0, 8)}`;
  const jobPendingAcceptedId = `job-accp-${runId.slice(0, 8)}`;

  const attemptSuccessId = `att-succ-${runId.slice(0, 8)}`;
  const attemptUnknownId = `att-unkn-${runId.slice(0, 8)}`;
  const attemptPendingId = `att-accp-${runId.slice(0, 8)}`;

  const now = new Date().toISOString();

  const organizations = [
    { _id: t1, name: `Synthetic Org 1 ${runId}`, createdAt: now },
    { _id: t2, name: `Synthetic Org 2 ${runId}`, createdAt: now },
  ];

  const users = [
    { _id: user1, orgId: t1, username: `admin1_${runId}`, role: "admin", createdAt: now },
    { _id: user2, orgId: t2, username: `admin2_${runId}`, role: "admin", createdAt: now },
  ];

  const agents = [
    { _id: agent1, orgId: t1, name: `agent-1-${runId}`, status: "offline", allowedCommands: ["echo 1"], createdAt: now },
    { _id: agent2, orgId: t2, name: `agent-2-${runId}`, status: "offline", allowedCommands: ["echo 2"], createdAt: now },
  ];

  const jobs = [
    { _id: jobSuccessId, orgId: t1, name: "Synthetic Success Job", type: "shell", targetAgentId: agent1 },
    { _id: jobUnknownId, orgId: t1, name: "Synthetic UNKNOWN Job", type: "shell", targetAgentId: agent1 },
    { _id: jobPendingAcceptedId, orgId: t2, name: "Synthetic Accepted Pending Job", type: "shell", targetAgentId: agent2 },
  ];

  const jobRuns = [
    {
      _id: `run-succ-${runId.slice(0, 8)}`,
      jobId: jobSuccessId,
      orgId: t1,
      targetAgentId: agent1,
      status: "COMPLETED",
      attemptId: attemptSuccessId,
      terminalSummary: { status: "COMPLETED", outcome: "SUCCEEDED", exitCode: 0, completedAt: now },
      reconciliationSafetyVersion: 1,
      createdAt: now,
    },
    {
      _id: `run-unkn-${runId.slice(0, 8)}`,
      jobId: jobUnknownId,
      orgId: t1,
      targetAgentId: agent1,
      status: "UNKNOWN",
      attemptId: attemptUnknownId,
      requiresReview: true,
      reasonCode: "EXECUTION_TIMEOUT_UNKNOWN",
      terminalSummary: { status: "UNKNOWN", outcome: "UNKNOWN", reasonCode: "EXECUTION_TIMEOUT_UNKNOWN" },
      reconciliationSafetyVersion: 1,
      nonDispatchProof: null,
      operatorResolution: null,
      createdAt: now,
    },
    {
      _id: `run-accp-${runId.slice(0, 8)}`,
      jobId: jobPendingAcceptedId,
      orgId: t2,
      targetAgentId: agent2,
      status: "ACCEPTED",
      attemptId: attemptPendingId,
      reconciliationSafetyVersion: 1,
      createdAt: now,
    },
  ];

  const executionTargetHolds = [
    {
      _id: `hold-unkn-${runId.slice(0, 8)}`,
      orgId: t1,
      targetAgentId: agent1,
      runId: `run-unkn-${runId.slice(0, 8)}`,
      attemptId: attemptUnknownId,
      fencingToken: 101,
      acquiredAt: now,
    },
  ];

  const sentinelCollection = [
    { _id: "sentinel-1", runId, description: "Unmodelled collection preserving raw data faithfully", value: 42 },
  ];

  const mongoData = {
    organizations,
    users,
    agents,
    jobs,
    jobruns: jobRuns,
    executiontargetholds: executionTargetHolds,
    sentinels: sentinelCollection,
  };

  const redisData = {
    [`axon:fence:${t1}:${agent1}`]: "101",
    [`axon:run:${runId}:state`]: "synthetic-quiescent-fencing",
  };

  const rawJournalData = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      runId,
      agentId: agent1,
      entries: [
        { seq: 1, event: "RECEIVED", attemptId: attemptUnknownId, ts: now },
        { seq: 2, event: "RUNNING", attemptId: attemptUnknownId, ts: now },
      ],
    }) + "\n",
    "utf8"
  );

  return {
    mongoData,
    redisData,
    rawJournalData,
  };
}
