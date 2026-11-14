# Connection-generation report repair decision

Date: 2026-10-08. Independent Astra decision; harness report-schema repair only.

## Decision

GO for the minimal two-file repair below. This is not runtime acceptance or permission to rerun yet. After stabilization, recorded checks and an independent frozen-source GO are required before ONE fresh isolated full harness run.

The acceptance report's `connectionGeneration` must satisfy `Number.isSafeInteger(report.connectionGeneration) && report.connectionGeneration > 0`, without coercion. Preserve it as the same numeric value in the sanitized output. Keep the existing, separate `connectedAgentId` string-ID check and all other acceptance/fixture/scenario checks unchanged.

## Evidence and meaning

- `backend/models/agent.js` declares a Number counter, default 0, minimum 0. `backend/services/agentConnectionLifecycle.js` atomically increments it by 1 when claiming the online connection and carries that numeric generation in connection identity.
- `approval-connected-agent-verifier.mjs` waits for the scoped agent to be online with a socket, then writes `agent.connectionGeneration` directly into the acceptance JSON. The acceptance sanitizer currently applies its string-ID predicate to that counter. The runner guard fixture incorrectly models it as a 32-character string.
- Parent reports r9 run `approval-f56df8984c83616f15011492669ca36b` exited 1 at acceptance identity sanitization after verifier export. The private raw report was removed: the mismatch is source-proven, not an independently observed raw generation value. Cleanup reports all 12 removals; independent absence verification and the runtime failure record remain with the parent. No full-runtime success is claimed here.

A successful connected-agent report requires a positive generation, unlike a newly seeded offline record's valid default 0. Reconnects may produce values greater than 1; do not require exactly 1. This is report validation, not a new fencing or connection lifecycle contract.

## Allowed files and invariants

Implementation writes only:

1. `scripts/codex/approval-connected-agent-runner.mjs`: replace only the incorrect generation predicate with strict positive safe-integer validation. A distinct error message is permitted, but failure must still throw and propagate as a failed run.
2. `scripts/codex/approval-connected-agent-runner.guard.test.mjs`: correct the fixture to a numeric counter and add focused sanitizer regressions.

Do not change backend schema/lifecycle, verifier serialization, connected-agent ID validation, report whitelisting, scenario evidence, runner identity/copy controls, launch intent, Desktop socket compatibility, same-daemon checks, cleanup authority, failure propagation or secret handling. No migration is needed. Do not recover or expose private reports to make this repair.

## Required acceptance

- Exercise the actual exported `sanitizeReport`, not a detached predicate. Accept 1, a later generation such as 2, and `Number.MAX_SAFE_INTEGER`; assert unchanged numeric output. Include a JSON-round-tripped verifier-shaped valid report.
- Reject missing/undefined, null, booleans, strings (including `"1"` and the old hexadecimal fixture), arrays/objects, zero/negative zero, negatives, fractional values, unsafe integers, NaN and either infinity. No coercion, rounding, default or fallback.
- With a valid numeric generation, invalid connected-agent ID still fails. Preserve existing fixture/scenario rejection and output-whitelist tests, ensuring the corrected fixture lets those checks reach their intended branches.
- Run the affected runner guard suite and combined existing harness guards; record native exit, passed/failed/skipped counts and syntax checks for the changed modules. Reuse unchanged evidence rather than rerunning backend or Docker checks during repair.
- Freeze the ten harness fingerprints in the next packet, identify these two changed files and unchanged eight, then obtain independent security acceptance. Any source change invalidates that freeze. The subsequent single isolated runtime must still prove both scenarios, correlation, replay, saved GET, native exit 0, nested-empty and all 12 owned-resource absence checks.

## Rejected alternatives and risks

Reject stringifying the producer, accepting number-or-string unions, coercing strings, allowing generation 0, requiring generation exactly 1, or weakening the whole identity assertion. These conceal the schema mismatch or reject legitimate reconnects. Strict safe-integer validation intentionally rejects malformed or exhausted counters; expanding backend counter semantics is outside this slice.

Offline source/test acceptance cannot establish what the removed r9 report contained or certify a successful runtime. This repair may expose a later independent runtime failure; retain fail-closed behavior and report it rather than broadening this contract.

Review method: targeted reads of the named model, lifecycle, verifier, runner and guard source with current project context; graph registry coverage was already recorded empty. Axon delivery/context-efficiency skills bounded this decision and reused unchanged evidence. No Docker, implementation edit or duplicate suite was performed by the reviewer.
