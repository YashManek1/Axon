# Frozen r9: fixed local Desktop socket compatibility

8 October 2026. Implementation follows `socket-compatibility-decision.md`; runtime remains NO-GO until independent security review.

## Bounded implementation

Only three harness files changed since accepted r8: library, orchestrator and library guard tests. Product backend/Rust, Compose, fixture, runner, verifier and cleanup authority are unchanged.

The shared `launchOwnedAgent` builds frozen argv with the literal socket bind and named journal. An allowlisted intent is derived from those exact argv and persisted before invocation, after the existing attempted-container record. Launch-plan overrides are rejected. After creation, the existing attempted immutable ID, ownership/run/name and topology gates still precede diagnostic capture. Missing/nonliteral/mismatched intent fails closed before daemon exec.

Both accepted mount representations require exactly two corresponding observed Binds and mounts. The proxy branch is the fixed `/run/host-services/docker.proxy.sock` only, gated on exact `desktop-linux`, exact `npipe:////./pipe/dockerDesktopLinuxEngine`, Linux and the matching nonempty preflight daemon ID. Production preflight stops before resource mutation if the inspected context/endpoint differs. Same-daemon query by immutable agent ID still precedes the verifier. No discovery, normalization or learned allowlist was added.

Diagnostics rename inspected `requestedBinds` to truthful `observedBinds`. Allowlisted launch-intent/preflight fields are redacted before clipping and again on final serialization. Observed representation is not a claim of same-daemon success. No raw argv/environment/context export.

## Native verification

- `node --test --test-reporter=spec scripts/codex/approval-connected-agent.guard.test.mjs scripts/codex/approval-connected-agent-runner.guard.test.mjs`: native **exit 0; 112 passed, 0 failed/cancelled/skipped/todo; 722.0621 ms**. Elevated only for existing local loopback/symlink checks; no product/customer database. Captured command output includes complete summary; display truncated some passing names.
- Actual shared launch/validation/report paths cover exact argv and intent ordering, persistence/launch failures, literal/proxy success, missing/wrong metadata and intent, remote/variant endpoints, inconsistent/missing/extra Binds, lookalike paths, privilege/network/ports, mismatched daemon, redaction/clipping and all prior cleanup/runner tests.
- `node --check` for all eight JavaScript modules below: native **exit 0**, all passed.
- `git diff --check`: native **exit 0**, unrelated LF/CRLF advisories. These harness files are untracked, so that check does not inspect them; syntax/tests and frozen-source review do.

## SHA-256: all ten harness inputs

Under `scripts/codex/`:

| File | SHA-256 |
| --- | --- |
| approval-connected-agent-compose.yml | a3d29a04889eff9b0291dee410a47fcd3d63ed3786b61b071e0b3842920711b7 |
| approval-connected-agent-fixture.mjs | 199884250d8823b5932f39c89e8cf4f8830798c9761f67e72e3cedea466a1e21 |
| approval-connected-agent-lib.mjs | 708fcaa0640baad3213757671f7176b88f0d940e1c69d8c4580a561029cec829 |
| approval-connected-agent-orchestrator.mjs | aee1d915cc2b0018946399eead30eb22783bd06544e683ef33d8140d9e2e764f |
| approval-connected-agent-runner.guard.test.mjs | 4b8f87094494852dab4647a7f623986469fa00b8d246143b287de0d246ece0bb |
| approval-connected-agent-runner.mjs | 03ad689215634c0b4262060f502781f97599f1882a7a18e91b4881185e84562a |
| approval-connected-agent-verifier.mjs | b92e33148ed19b5a020ae5da82a5db232d9c5895814b12e09b2d07a94b01588d |
| approval-connected-agent.guard.test.mjs | 7485962d34b47d523bf389396351ed606c142423a6b41e48fb7cb09418a4e593 |
| approval-connected-agent.mjs | 065f56b60c1286e561d2065f3b7d2d420e48020b9b35fb18fff8fa86a24ff390 |
| approval-connected-agent.ps1 | ce559860265b2f6455cf0178e5595f45207e51670a4a5e142328324b6fb50d6e |

If accepted, exactly one fresh isolated full harness attempt is authorized by the decision's later runtime GO. Real success/exit-7 failure, persisted approval/target/attempt, replay/saved GET and cleanup must still be demonstrated. Offline guards alone do not finish this gate or establish pilot readiness.
