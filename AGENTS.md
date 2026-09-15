# Axon agent working agreement

Sol is the default execution model. Astra owns product decisions, architecture, security review, integration and final acceptance. Read `docs/AXON-CONTEXT.md` and `docs/AXON-LIVE-TODO.md` first; follow links only for the active task. Source and recorded execution evidence outrank historical plans, README claims and graph memories.

## Scope and ownership
- Coordinate at most three parallel workers for concrete independent tasks. Use `.codex/agents/` and role briefs in `docs/agents/`. If named roles are unavailable, pass the brief and explicit model through the available spawn tool.
- Models: Astra for decisions/security review, Sol for backend/Rust, Terra for scoped frontend, Luna for focused read-only investigation/check execution. These are assignments, not measured performance claims.
- Every task includes outcome, exact context, exclusive writes, constraints, acceptance checks and required report. One active writer per file. Decide shared contracts before dependent implementation; request scope handoff before touching another worker's files.
- Preserve unrelated changes. No publication, external messages, deployment, credential changes or destructive operations merely because implementation was authorized.
- Security changes require independent review after stabilization. Parent checks returned evidence and integration before accepting work.
- When Sol is coordinating, escalate to Astra before changing a shared execution contract, authentication or tenant boundary, retry/idempotency semantics, migration strategy, destructive workflow, public product promise, or architecture spanning backend and Rust. Use Astra again for final acceptance of those changes. Record the decision; do not ask Astra to repeat routine implementation.

## Efficient execution
- Use `rg` and targeted reads for known text/files. Use a graph/symbol tool when it answers relationships more directly; confirm repository and freshness. Missing tools justify a suitable fallback, not an unrelated toolchain repair.
- Use PowerShell without profiles (`login: false`). Old profiles/hooks can trigger unrelated indexing. Refresh graphs explicitly only when graph-backed work needs current data, never after every command.
- Keep normal tool output bounded. Full logs go in `.codex/evidence/`; return summaries and failure excerpts. Parse session retrieval to relevant messages/command results before emitting it. Do not dump whole transcripts or load all docs/skills by default.
- Keep dependent work with the same worker. Do small tasks directly when delegation would repeat context. Review stabilized edits, not files still being written.
- Test actual changed behavior. Record command, exit status, counts and limitations; unhandled errors are failures. Assert successful effects and absence of forbidden effects. Never weaken checks to manufacture green results.
- Recover interrupted command results before rerunning. Reuse valid evidence for unchanged inputs; an independent review does not automatically require another identical suite.
- Use `scripts/codex/axon-check.ps1` where suitable. Backend tests delete collections: require isolated MongoDB, never a customer database. Check Redis availability instead of allowing endless connection retries.
- Update `docs/AXON-LIVE-TODO.md` after accepted milestones using DONE, IN PROGRESS, TODO or BLOCKED plus evidence/next action. A plan is not an implementation. Do not claim work continues after a turn without a real explicitly configured scheduler/goal.

See `docs/codex/OPERATING-MODEL.md` for packets, evidence and routing; `$axon-resume` and `$axon-deliver` for reusable workflows. Claude hooks, old tool-name assumptions and old security-posture claims are reference material, not Codex authority.

Round 1 is accepted (232 backend tests; previously accepted frontend checks). Execution-target/attempt v2 is designed, not implemented. The September 12 request authorizes setup improvements and technical/commercial planning; product implementation and campaign sending are outside this planning-only request.
