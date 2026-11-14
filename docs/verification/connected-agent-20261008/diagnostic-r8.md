# Connected-agent diagnostic repair r8

8 October 2026. Scope: the three harness files named in the independently approved r7 repair contract in `.codex/evidence/connected-agent-20261004/acceptance.md`. No product execution contract, socket allowlist, cleanup authority or customer endpoint was changed. The graph registry previously returned zero repositories; targeted source retrieval was used.

## Implementation

- Every permitted diagnostic string is redacted against the complete available harness secret set before bounding; longer overlapping secrets are replaced first.
- Malformed collections/fields and truncated entries/strings are explicitly identified. Observation includes validated exact container identity, run and daemon correlation.
- The orchestrator calls `validateAgentAndContinue` and `runHarnessLifecycle`, the same functions exercised by offline tests. Invalid owned topology retains diagnostics, suppresses daemon exec/verifier, performs cleanup and produces nonzero final status. Identity failures produce no trusted diagnostic.
- Literal socket/journal comparisons, topology/same-daemon ordering, manifest ownership and cleanup implementations remain unchanged. Diagnostics never learn an accepted mount source.

## Verification

Command: `node --test --test-reporter=spec scripts/codex/approval-connected-agent.guard.test.mjs scripts/codex/approval-connected-agent-runner.guard.test.mjs`.

Final native result: exit **0**, **51 passed**, zero failed/cancelled/skipped, 672.9914 ms. Run used approved elevated execution for localhost/symlink access; no Docker job or customer system was accessed. Successful actual shared path plus wrong mount source/type/destination, missing/extra mount, wrong journal, wrong owner/run/name/ID/kind, absent attempted ID, different daemon, verifier failure, cleanup failure, malformed input, truncation and secrets in serialized final reporting are covered. Existing nested/owned cleanup tests remain green.

Initial sandbox run: 48/51 passed, exit 1. Two existing tests could not exercise symlink/localhost access under sandbox restrictions; one new test incorrectly expected truncation after redaction shortened a 262-character source to 255 characters. Corrected that assertion to require no truncation and exact fully redacted output. No check was removed or weakened; independent string/entry truncation tests remain. Final full run above supersedes that failed run.

`node --check` on all eight `.mjs` files listed below: exit 0. `git diff --check`: exit 0, with pre-existing LF/CRLF warnings. The harness files are untracked, so Git whitespace checking is not evidence for their contents; syntax and frozen source review are required. Only subsequent indentation formatting in the orchestrator occurred after the full test run; final syntax checks include it, and tested library/tests are unchanged.

## Frozen SHA-256

All paths below are under `scripts/codex/`.

| File | SHA-256 |
| --- | --- |
| approval-connected-agent-compose.yml | a3d29a04889eff9b0291dee410a47fcd3d63ed3786b61b071e0b3842920711b7 |
| approval-connected-agent-fixture.mjs | 199884250d8823b5932f39c89e8cf4f8830798c9761f67e72e3cedea466a1e21 |
| approval-connected-agent-lib.mjs | f7a9d6603dcba7a73e627e53eedbb2ff35947c6fddc9fa5fbdd87dd12fb9353d |
| approval-connected-agent-orchestrator.mjs | f23d5c8c7a8554505a6b8ea0017f9e63454508cdb95940e0e9c1f95e2c014a29 |
| approval-connected-agent-runner.guard.test.mjs | 4b8f87094494852dab4647a7f623986469fa00b8d246143b287de0d246ece0bb |
| approval-connected-agent-runner.mjs | 03ad689215634c0b4262060f502781f97599f1882a7a18e91b4881185e84562a |
| approval-connected-agent-verifier.mjs | b92e33148ed19b5a020ae5da82a5db232d9c5895814b12e09b2d07a94b01588d |
| approval-connected-agent.guard.test.mjs | 0daf6fb076505dd46df5cdc09695f3606cc7cb87b7508b311e1bab48c18b43d7 |
| approval-connected-agent.mjs | 065f56b60c1286e561d2065f3b7d2d420e48020b9b35fb18fff8fa86a24ff390 |
| approval-connected-agent.ps1 | ce559860265b2f6455cf0178e5595f45207e51670a4a5e142328324b6fb50d6e |

Independent frozen review pending. Runtime remains NO-GO until the reviewer explicitly accepts this repair. Real success/failure, approval/replay/GET assertions and twelve-resource cleanup are not established by these offline checks.
