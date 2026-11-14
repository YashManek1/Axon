# Independent bounded r10 runtime acceptance

Decision: **ACCEPTED** for the isolated connected-agent preview → approval → real Rust-agent execution → saved-result gate, including deliberate exit-7 failure and owned cleanup. Review completed 9 October 2026; execution evidence is dated 8 October 2026. This is not whole-product or deployment acceptance and does not authorize another runtime.

## Evidence and findings

Reviewed `runtime-r10.md`, the frozen `acceptance-r10.md` and `generation-repair-r10.md`, and these four sanitized artifacts in `.codex/evidence/connected-agent-20261004/`:

- `runtime-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`
- `runtime-acceptance-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`
- `fixture-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`
- `cleanup-ledger-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`

The recorded orchestrator command exited natively 0 (session 41390). Its final report is `pass-cleaned`, with null error, for run `approval-3e20dc2ba2e6066fd6dc6d5989413399`. The acceptance report's intermediate `acceptance-complete-awaiting-owned-cleanup` phase is closed by that final report and ledger; it is not independently sufficient for cleanup acceptance.

Independent read-only SHA-256 comparison exited 0: all ten current harness inputs match both the frozen r10 packet and the runtime ledger's source fingerprints. The eight unchanged inputs retain their previous review; the approved two-file numeric-generation repair was the executed version. Existing 132-pass guard and eight successful syntax-check evidence was reused, not rerun.

The fixture contains one organization, one user, one agent and two jobs. Its agent ID equals the acceptance report's connected-agent ID, `6ac7b721e24ecc652d640235`; `connectionGeneration` is the numeric value **1**.

| Scenario | Preview / approval / replay HTTP | Saved status / outcome | Exit | Attempts | Saved GET | Duplicate run / history |
| --- | --- | --- | --- | --- | --- | --- |
| success | 201 / 200 / 200 | SUCCEEDED / COMPLETED | 0 | 1 | true | false / false |
| exit7 | 201 / 200 / 200 | FAILED / COMPLETED | 7 | 1 | true | false / false |

Both scenarios have zero waiting, active and delayed jobs at the verifier's quiet-queue observation. The frozen verifier only emits this report after checking preview/approval binding, tenant/agent/user targeting, attempt/operation/target-execution correlation with history, immediate and terminal replay idempotency, persisted GET results and unchanged run/history counts. These are successful assertions on the executed shared path, not separately retained raw correlation records or proof of indefinite queue quietness. The deliberate nonzero command outcome remains a failure result, not a transport success misreported as command success.

The socket diagnostic records the requested literal bind `/var/run/docker.sock:/var/run/docker.sock` and the bounded approved observed representation `/run/host-services/docker.proxy.sock` → `/var/run/docker.sock`. Context is exactly `desktop-linux`, endpoint is `npipe:////./pipe/dockerDesktopLinuxEngine`, OS is Linux, and daemon ID agrees across preflight, runtime and ledger. The exact agent identity/launch intent and named journal agree; there are two binds/two mounts and no malformed/truncated diagnostic flags. No broader socket allowlist or cleanup authority is inferred.

Nested cleanup reports success with empty inventory and no failures under the frozen cleanup path. Owned cleanup reports all twelve nonce-owned deletions, zero outside resources and zero failures. Independent report-set comparison exited 0: the twelve attempted `kind:name` identities exactly equal the twelve owned deletions (five containers, four volumes, one network, two images). The parent additionally records a separate read-only exact-ledger inspection, native exit 0, confirming **12/12 absent**. That live absence check is parent execution evidence; this reviewer did not run Docker or repeat deletion.

## Scope, risks and next gates

No blocker remains for this bounded runtime gate. Earlier failed runs are not retroactively accepted. The repository was dirty at execution, so this acceptance attaches to the ten frozen inputs and this isolated run, not to every file or an entire release.

This does **not** establish real-agent UNKNOWN/persistence-fault/crash recovery, machine-safe hold release or retry, customer installation, backup/restore, real multi-host operation, screen-reader or second-person acceptance, buyer validation, or customer/production readiness. Those require their own contracts and evidence. No additional implementation, suite, runtime, deployment or outreach is required or authorized by this decision.

Only this acceptance record was written; source, tracker, context and runtime resources were not changed.
