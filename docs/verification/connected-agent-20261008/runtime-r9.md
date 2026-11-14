# Connected-agent runtime r9 — failed, cleanup confirmed

Date: 8 October 2026. Frozen sources and one-run authorization: `acceptance-r9.md`; contract: `socket-compatibility-decision.md`.

Command: `node scripts/codex/approval-connected-agent-orchestrator.mjs`; native exit **1**. Run: `approval-f56df8984c83616f15011492669ca36b`. Docker context: `desktop-linux`; daemon ID: `ff2bc588-16ec-43a4-9702-a16c70975481`.

The fixed Docker Desktop socket compatibility gate passed, including literal launch intent and same-daemon confirmation. The verifier completed its native command/export; the host then rejected the private acceptance report with `Acceptance report identity mismatch` at `sanitizeReport` (`approval-connected-agent-runner.mjs`). No sanitized acceptance report was published. This is **not** an accepted live approval/success/failure result.

Source inspection found a type mismatch: `backend/models/agent.js` defines `connectionGeneration` as Number, `agentConnectionLifecycle.js` increments it, and the verifier exports that number. The sanitizer incorrectly requires a string identifier; its offline fixture also incorrectly uses a string identifier. The private raw report was removed during cleanup, so no specific observed generation value is claimed. A bounded independent decision is required before repair and another run.

Runtime artifacts: `.codex/evidence/connected-agent-20261004/runtime-approval-f56df8984c83616f15011492669ca36b.json` and the corresponding `cleanup-ledger-approval-f56df8984c83616f15011492669ca36b.json`. Owned cleanup reports 12 deletions, no failures/outside resources; nested cleanup reports no failures. Parent independently inspected the ledger's exact 12 names through `inspectDockerResource`, pinned to `desktop-linux`, using the strict missing-resource classifier: native exit **0**, **12/12 confirmed absent**. This check was read-only, with no broad cleanup command.

Existing frozen r9 offline evidence remains 112 passing guards and eight clean JavaScript syntax checks. It does not override the failed runtime. No customer database, publication, deployment or outreach was involved.
