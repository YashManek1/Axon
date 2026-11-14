# Linux agent installation candidate — validation required

Updated: 6 November 2026. Status: **NO-GO for customer installation**.

This is a preflight and acceptance checklist for one disposable, non-production Linux amd64 host. It is not a verified fleet deployment procedure. The current release manifest lists Linux as a target but contains only a Windows agent binary hash; a built Linux artifact, backend/frontend image digests and matched-release installation evidence are still required. Do not copy a binary or run the steps on a customer host on the strength of this document.

## Preconditions for a controlled drill

1. Obtain explicit authorization for the host, operator, tenant, time window, read-only procedure and rollback. Use isolated test data and a dedicated non-root agent identity.
2. Freeze the source and build a Linux amd64 agent artifact. Record its SHA-256, the backend and frontend image digests, the release ID and exact configuration. Verify each digest before installation. The current `release-manifest.json` does not satisfy this gate.
3. Install and verify a working Docker daemon on the test host. The agent's Docker sandbox is the candidate process-containment mode. A host-process mode is not implemented; `none` does not provide the required containment.
4. Pin `AGENT_SANDBOX_DOCKER_IMAGE` to an immutable image digest. Verify access to the Docker socket, network egress to the control plane, journal-directory ownership and restart behavior with the actual service identity. A systemd unit has not yet been accepted for this combination.
5. Keep dispatched `UNKNOWN` target holds in place. Dispatched hold recovery is unavailable pending independent proof of process-tree death. Do not resume or retry work on a held target.

## Agent configuration to validate

These names come from `agent/src/main.rs` and `agent/src/sandbox.rs`. Values below are placeholders, not provisioned credentials or a ready-to-run environment file.

```ini
SERVER_URL=<approved-control-plane-url>
AGENT_ID=<provisioned-agent-id>
AGENT_API_KEY=<provisioned-agent-api-key>
DISPATCH_SIGNING_KEY=<at-least-32-hex-characters-matching-control-plane>
AXON_RELEASE_ID=<same-immutable-release-id-as-backend>
AXON_AGENT_JOURNAL_DIR=<persistent-private-journal-directory>
AGENT_SANDBOX_MODE=docker
AGENT_SANDBOX_DOCKER_IMAGE=<approved-image-at-immutable-digest>
```

Protect secrets and the journal from other users. The signing key is hexadecimal, not an arbitrary 32-character string. Verify that the control plane and agent reject a release mismatch before approving execution.

## Acceptance sequence on the disposable host

Record every command, exit status, version, artifact hash and the absence of forbidden execution. Stop at the first unexplained result.

1. Install the frozen artifact and test service configuration. Cold boot and restart; verify a single connected agent with the expected identity and release.
2. Approve one bounded, read-only command against that exact target. Verify success exit 0, a deliberately failing exit code, approval replay without another execution, and saved results.
3. Crash the agent while a child and descendant exist. Verify containment removes the full process tree, the run is `UNKNOWN`, its target hold remains, and no automatic redispatch occurs. Exercise Redis/Mongo interruption and restart with the same forbidden-effect checks.
4. Rotate and revoke test credentials, then verify old credentials cannot reconnect or execute. Backend routes are `POST /agents/:agentId/rotate-key` and `DELETE /agents/:agentId`, with admin authentication. Confirm any ingress prefix separately; do not assume `/api` is mounted.
5. Restore isolated backup data and roll back to a separately built prior artifact. Verify identity, journal, outbox and target-hold behavior after restart. The prior local rollback drill reused identical image bytes under different release IDs and does not establish this step.
6. Have the intended operator complete the workflow and accessibility walkthrough. Capture confusion, recovery behavior and approval scope. Automated component tests do not replace this observation.

Only after these gates pass may Astra review a narrowly scoped pilot GO decision. No production, multi-host or customer deployment is established by the existing local tests.
