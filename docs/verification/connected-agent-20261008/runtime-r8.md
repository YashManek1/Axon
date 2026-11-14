# Connected-agent runtime r8 — rejected safely

8 October 2026. Independent frozen r8 security GO is recorded in `acceptance-r8.md`; ten frozen harness hashes matched immediately before execution. This is a failed runtime attempt, not pilot acceptance.

Command: `node scripts/codex/approval-connected-agent-orchestrator.mjs`, approved elevated execution, native **exit 1**. Run: `approval-b07074b07dbea8b3bccd0ef9cf8c2a9a`; local `desktop-linux` daemon ID `ff2bc588-16ec-43a4-9702-a16c70975481`.

The harness built fresh owned images, started isolated MongoDB/Redis/backend/runner, created its journal and agent, then rejected the agent before verifier execution: **Agent daemon socket mount mismatch**. The bounded, redacted, identity-validated observation reports Docker Desktop's exact socket source `/run/host-services/docker.proxy.sock` in both requested binds and effective mounts, destination `/var/run/docker.sock`. The named journal mount is correct. No malformed or truncated diagnostic fields. The harness requested the literal `/var/run/docker.sock` source; observation does not establish permission to accept the rewritten source.

Recorded runtime and cleanup ledger:

- `.codex/evidence/connected-agent-20261004/runtime-approval-b07074b07dbea8b3bccd0ef9cf8c2a9a.json`
- `.codex/evidence/connected-agent-20261004/cleanup-ledger-approval-b07074b07dbea8b3bccd0ef9cf8c2a9a.json`

Nested cleanup: `ok: true`, no nested job resources created. Owned cleanup: `ok: true`, twelve deleted, no outside resources and no failures. A separate read-only native Node check reused `inspectDockerResource` and `buildHarnessEnvironment`, inspected all twelve exact manifest names through `desktop-linux`, and confirmed **12/12 absent**, native **exit 0**. Missing-resource responses were strictly validated; arbitrary Docker errors were not treated as absence.

Real job success, exit-7 failure, approval/replay and saved-result assertions were **not performed**. No customer database or deployment was involved. Next: independent Astra decision for narrowly bounded Docker Desktop socket compatibility before any guard change, frozen review, then one newly authorized isolated attempt.
