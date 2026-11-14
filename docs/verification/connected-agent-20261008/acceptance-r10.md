# Frozen r10 security acceptance

Date: 2026-10-08. Independent Astra review of the numeric connection-generation report repair.

## Decision

**GO for exactly ONE fresh isolated full orchestrator run**, using the ten frozen inputs in `generation-repair-r10.md`. Parent must recheck those fingerprints immediately before execution; any input change invalidates this GO. No source repair is required by this review.

This accepts only the bounded harness repair and its execution gate. It is not live-runtime success, deployment permission, fleet acceptance or whole-product acceptance.

## Evidence and findings

- Read the complete r10 packet, approved `generation-repair-decision.md` and `runtime-r9.md`; reviewed the two modified runner files against the previously inspected r9 source.
- Independently computed all ten SHA-256 fingerprints from disk: **10/10 exact matches**, read-only command native exit **0**. The eight unchanged input fingerprints retain r9 security acceptance, including literal launch-intent correlation, exact Desktop proxy/endpoint restriction, same-daemon and fail-closed topology checks, redaction and owned cleanup authority.
- `sanitizeReport` now requires `Number.isSafeInteger(report.connectionGeneration) && report.connectionGeneration > 0`. It neither coerces nor defaults, and returns the same numeric counter. The separate string-ID predicate on `connectedAgentId` and all fixture, phase, scenario, outcome, replay, saved-GET, queue and whitelist checks remain intact. Runner identity, private installation and guarded copy behavior are unchanged.
- The corrected fixture uses numeric 1. Tests call the real exported sanitizer: JSON-round-tripped 1, 2 and MAX_SAFE_INTEGER preserve their numeric value; invalid agent IDs still reject. Missing/undefined/null/booleans, numeric and legacy-ID strings, array/object, zero/negative zero/negative/fraction/unsafe integer, NaN and both infinities reject. Existing scenario/whitelist negatives now use a valid generation and therefore exercise their intended checks.
- Reused stabilized execution evidence in the r10 packet: combined harness guards native exit **0**, **132 passed**, **0 failed/cancelled/skipped/todo**; all eight JavaScript syntax checks native exit **0**. No duplicate suite or Docker invocation was performed by this reviewer.
- `runtime-r9.md` records the prior native exit **1**, no published sanitized acceptance, and parent's exact-name, same-context **12/12 independent absence** confirmation. Its private report was removed; this review does not claim an observed generation value from that report.

## Runtime acceptance still required

The one permitted run must independently establish the real successful and exit-7 scenarios, approval/run/attempt correlation, replay without duplicate execution/history, saved GET, native exit **0**, nested-empty cleanup and independent absence of all **12** owned resources. Preserve all current guards and failure propagation. A failed run remains failed and does not authorize another run or expanded compatibility.

## Rejected alternatives, risks and affected files

String conversion, union acceptance, coercion, generation 0 and an exact-1 restriction remain rejected. Positive safe-integer validation matches a claimed connection while allowing reconnects; malformed/exhausted counters intentionally fail closed. This source repair cannot guarantee that the next runtime has no later failure.

Reviewed implementation changes are limited to `scripts/codex/approval-connected-agent-runner.mjs` and `scripts/codex/approval-connected-agent-runner.guard.test.mjs`; this reviewer wrote only this acceptance record. No backend/Rust contract or migration changed. Axon delivery/context-efficiency guidance kept the review bounded and reused unchanged evidence; the previously empty graph registry justified targeted source reads.
