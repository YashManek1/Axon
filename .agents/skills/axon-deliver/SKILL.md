---
name: axon-deliver
description: Implement or review a bounded Axon product milestone with ownership, regression evidence and handoff. Use for code changes and QA, not business-plan drafting.
---

# Deliver an Axon milestone

Read the current tracker and the relevant section of `docs/codex/OPERATING-MODEL.md`. Define one customer-visible outcome, dependencies, exclusive file scope and acceptance cases before delegating.

For execution work, read `docs/axon-execution-contract-v2.md` and the actual backend/Rust callers. An unknown remote outcome is not a known failure. A chosen target must never silently change. A queue completion is not proof of successful process effects. These are intended v2 requirements, not claims that current runtime implements them.

Keep one writer per file. Use Astra for contracts/security acceptance, Sol for backend/Rust, Terra for frontend and Luna for focused investigation. Spawn only when independent work reduces time or repeated context; reuse the worker for dependent follow-ups. Pass the smallest sufficient context packet.

Reproduce or specify the actual failing behavior. Test denied actions for absence of side effects and allowed actions for actual successful effects. Do not weaken tests or replace the production path with a fake route to get green results.

Use the verification runner when suitable; otherwise save exact commands, input fingerprint, exit status, pass/fail counts and limitations in `.codex/evidence/`. Read failures, not every passing line. Security changes require independent review after implementation stabilizes. Parent reviews integration and evidence rather than automatically rerunning the same tests.

Update the live tracker and handoff with accepted behavior, evidence and next action. A checked plan, a unit test and a real Linux integration test prove different things; label them accurately.
