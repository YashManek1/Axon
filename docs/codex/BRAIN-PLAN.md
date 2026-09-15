# Axon Codex brain plan

Updated 12 September 2026. This is the control loop for Sol-led Axon work. It optimizes for accepted outcomes per model call, not activity or claimed token percentages.

## Memory layout

| Layer | Purpose | Load rule |
|---|---|---|
| `AGENTS.md` | Stable authority, safety and ownership rules | Always |
| `docs/AXON-CONTEXT.md` | Small current-state checkpoint and source map | At session start/resume |
| `docs/AXON-LIVE-TODO.md` | Accepted status and next milestone | At session start/resume and milestone close |
| Dated product/technical documents | Detailed decisions and evidence | Only when linked by the active task |
| `.codex/evidence/` | Machine-readable command results | Retrieve by matching source fingerprint and check; do not paste whole logs |
| Skills and agent briefs | Repeatable task procedure | Load only when the task matches |

The SessionStart hook injects at most 6,500 characters from the two checkpoint files on startup, resume, clear and post-compaction. It does not read transcripts, secrets or the full documentation set. There are no per-command hooks.

## Sol execution loop

1. State one observable outcome and its acceptance checks. Separate implementation, planning, deployment and external communication authority.
2. Read the two checkpoint files, then inspect the smallest source slice that can disprove the current hypothesis. Expand only when a caller, contract or failing check requires it.
3. Take a source fingerprint. Recover recent evidence for that fingerprint before rerunning a suite.
4. Apply the escalation gate. Sol calls `architecture_astra` before changing cross-runtime contracts, auth or tenant boundaries, target/retry/idempotency semantics, migrations, destructive behavior, or a public product promise. Security-sensitive stabilized code goes to `security_astra` for independent acceptance.
5. Split work only when tasks are independent and file ownership is exclusive. Maximum three workers: Sol for backend/Rust, Terra for UI, Luna for bounded read-only investigation. Keep dependent implementation with one owner.
6. Implement the smallest complete vertical behavior. Treat schemas, callers, telemetry, recovery and customer-visible failure states as part of the behavior.
7. Run the narrow relevant check once. Use `scripts/codex/axon-check.ps1` for bounded evidence; broaden only after a failure, cross-cutting change, or release gate justifies it.
8. Review the stabilized diff against the acceptance checks and forbidden effects. Ask Astra for acceptance when the escalation gate applied.
9. Update the live tracker and checkpoint only after acceptance. Record the exact command, exit status, counts, evidence path, limits and next action.

## Decision gate

| Situation | Owner | Expected output |
|---|---|---|
| Routine bounded implementation under an accepted contract | Sol | Working change plus focused evidence |
| Frontend-only interaction and accessibility work | Terra | UI change plus browser/component evidence |
| Inventory, source trace or check execution | Luna | Facts, locations and exit evidence; no edits |
| Shared architecture or product commitment | Astra | Decision record before implementation |
| Authentication, tenant isolation or distributed-execution security | Astra independent reviewer | ACCEPT or exact blocking paths after stabilization |

An Astra escalation is a decision checkpoint, not a second implementation thread. Sol supplies the exact ambiguity, involved files, candidate decision and consequences so Astra can answer without reloading the repository.

## Context and rate discipline

- Prefer symbol/relationship queries or `rg` with bounded file reads. Never load every skill or every product document for a scoped code task.
- Batch independent reads and searches. Keep returned tool output below the configured 3,000-token limit; store full logs locally.
- Preserve stable prefixes: put durable rules in in `AGENTS.md`, evolving state in the checkpoint, and new evidence after existing context.
- Do not retry an unchanged failing environment blindly. Diagnose once, record the blocker, and continue unaffected work.
- Do not rerun passing checks when source identity and environment remain valid. Run wider suites at integration/release boundaries.
- Automatic hooks may load bounded context. They may not update graphs, run tests, mutate source, inspect transcripts or contact external systems.

## Acceptance of the brain itself

The setup is accepted only when project TOML and hook JSON parse, agent definitions load, the session hook returns valid bounded JSON, both local skills validate, and the verification runner passes its behavioral self-test. `codex doctor` configuration success is recorded separately from unrelated host/network diagnostics.
