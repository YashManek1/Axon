# Independent r8 diagnostic security acceptance

8 October 2026. Scope: the diagnostic-only repair approved in the first 24 lines of `.codex/evidence/connected-agent-20261004/acceptance.md`.

## Decision

**GO for one fresh isolated full connected-agent harness run at the frozen r8 sources.** No repair is required before that attempt. This is not runtime, whole-product, customer-pilot or deployment acceptance; it does not authorize broader cleanup or relaxed guards.

## Evidence and contract review

- Independently computed SHA-256 for all ten files listed in `diagnostic-r8.md`; all ten match. Reviewed the stabilized library, production orchestrator and changed guard tests. The parent-established empty graph registry justified targeted reads.
- `agentMountDiagnostic` validates ownership/run, expected name and exact attempted container ID before trusted capture. Its whitelist includes validated container identity and run/daemon correlation, excludes raw environment/configuration and volume host sources, and redacts every permitted dynamic string before the 256-character bound. Mount/bind lists stop at eight entries; fixed-field malformed/truncated indicators are structurally bounded and distinguish invalid collections/fields and clipped strings/entries.
- The orchestrator passes its complete available secret set (fixture token/API key and generated harness credentials), obtains the expected ID from the recorded attempted resource, and calls the same `validateAgentAndContinue` and `runHarnessLifecycle` functions used by offline tests. There is no parallel test-only topology validator or report serializer.
- Literal socket source/type/destination and named journal comparisons remain strict. Privilege, single-network, no-published-port and same-daemon gates remain present. The daemon query uses the validated immutable ID, and verification occurs only after topology and same-daemon success. Observation does not modify an allowlist.
- Actual shared-path tests cover accepted topology; wrong socket source/type/destination, missing/extra mounts and wrong journal; owner/run/name/ID/kind and missing-attempt-ID rejection; malformed input; daemon mismatch; verifier/cleanup failure; and known secrets in the serialized final report. Rejected owned mounts retain diagnostics, suppress daemon/verifier calls, execute cleanup, persist the report and return nonzero. Entry/string clipping has explicit focused coverage. Production final reporting sanitizes report values again and propagates the lifecycle exit code.
- Reused the packet's native test result: `node --test --test-reporter=spec scripts/codex/approval-connected-agent.guard.test.mjs scripts/codex/approval-connected-agent-runner.guard.test.mjs`, exit 0, 51 passed, zero failures/cancellations/skips. Reused final eight-module syntax exit 0. The packet discloses the initial failed sandbox/assertion run and subsequent corrected result. Only orchestrator indentation changed after the full suite; final syntax and this frozen-source review cover that formatting. Git whitespace success is not treated as proof of untracked-file contents.
- Reused prior unchanged nested/owned cleanup review and recorded evidence; no duplicate suite, Docker operation or runtime probe was performed during this review.

## Remaining gates and risks

Local Docker socket authority remains powerful; diagnostic redaction covers known harness secrets, not arbitrary unknown secrets. The real running-agent socket observation may still fail the unchanged literal-source guard. Such a failure must remain nonzero with sanitized evidence and owned cleanup; it is not permission to accept another source automatically.

After the single isolated attempt, return for independent runtime acceptance with real success and exit-7 failure, persisted approval/target/attempt correlation, replay and saved-GET assertions, native exit 0, nested cleanup and confirmed absence of all twelve owned resources. Offline success proves none of those runtime outcomes. Preserve customer isolation and the existing cleanup ownership boundaries.

Rejected alternatives remain: relaxing socket acceptance, substituting serializer-only tests, treating the aggregate count as runtime proof, or declaring product readiness from this diagnostic repair.

Reviewer wrote only this acceptance record. Source ownership and other working-tree edits were preserved.
