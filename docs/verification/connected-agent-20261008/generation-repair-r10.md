# Frozen r10: numeric connection-generation report repair

8 October 2026. Implements `generation-repair-decision.md`; independent frozen-source review required before ONE fresh isolated runtime.

Only runner and runner guard changed from r9. The sanitizer now requires a positive safe-integer numeric connection generation, preserves the same numeric output, and retains all separate ID/scenario/whitelist checks. Fixture corrected to 1. No backend, lifecycle, verifier, socket, launch, same-daemon or cleanup changes.

## Verification

- `node --test --test-reporter=spec scripts/codex/approval-connected-agent.guard.test.mjs scripts/codex/approval-connected-agent-runner.guard.test.mjs`: native exit **0**, **132 passed**, 0 failed/cancelled/skipped/todo, 753.2441 ms. Actual sanitizer exercised for 1, 2, MAX_SAFE_INTEGER through JSON round-trip; unchanged numeric output and invalid agent ID rejection. Missing/undefined/null/booleans/strings/array/object/zero/negative zero/negative/fraction/unsafe integer/NaN/infinities rejected. Existing scenario, redaction, launch and cleanup checks retained. Elevated for existing Windows temporary-directory/loopback checks; no Docker or customer database used.
- `node --check` all eight frozen JavaScript modules: native exit **0** each.
- No duplicate backend suite: backend inputs unchanged. r9 runtime is failed, documented in `runtime-r9.md`; its owned resources were independently confirmed absent. Offline checks are not live acceptance.

## SHA-256: scripts/codex inputs

| File | SHA-256 | Change |
| --- | --- | --- |
| approval-connected-agent-compose.yml | a3d29a04889eff9b0291dee410a47fcd3d63ed3786b61b071e0b3842920711b7 | unchanged |
| approval-connected-agent-fixture.mjs | 199884250d8823b5932f39c89e8cf4f8830798c9761f67e72e3cedea466a1e21 | unchanged |
| approval-connected-agent-lib.mjs | 708fcaa0640baad3213757671f7176b88f0d940e1c69d8c4580a561029cec829 | unchanged |
| approval-connected-agent-orchestrator.mjs | aee1d915cc2b0018946399eead30eb22783bd06544e683ef33d8140d9e2e764f | unchanged |
| approval-connected-agent-runner.guard.test.mjs | e9324239833eea8195d1dd015dfbff9815c9c256f44b7320d9c89227ee4a427a | changed |
| approval-connected-agent-runner.mjs | afe6b0341013227fe38d60307c1de59c0b5376d0b4862613dc0cc333f78520f8 | changed |
| approval-connected-agent-verifier.mjs | b92e33148ed19b5a020ae5da82a5db232d9c5895814b12e09b2d07a94b01588d | unchanged |
| approval-connected-agent.guard.test.mjs | 7485962d34b47d523bf389396351ed606c142423a6b41e48fb7cb09418a4e593 | unchanged |
| approval-connected-agent.mjs | 065f56b60c1286e561d2065f3b7d2d420e48020b9b35fb18fff8fa86a24ff390 | unchanged |
| approval-connected-agent.ps1 | ce559860265b2f6455cf0178e5595f45207e51670a4a5e142328324b6fb50d6e | unchanged |

Any source change invalidates this freeze. Runtime must independently establish success, exit-7 failure, correlated approval/run/attempt, replay, saved GET, native exit 0, nested-empty cleanup and all 12 owned-resource absence checks. No fleet, human walkthrough or commercial-readiness acceptance implied.
