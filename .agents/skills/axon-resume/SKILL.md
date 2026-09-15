---
name: axon-resume
description: Recover Axon work after a session interruption or answer project progress from saved source and evidence. Use for Axon handoffs, not generic Codex setup.
---

# Resume Axon

Read `docs/AXON-CONTEXT.md` and `docs/AXON-LIVE-TODO.md` first. Open only the linked milestone report and relevant source for the requested continuation.

For a past test, recover its actual exit status from the execution record or JSON evidence; a log containing passing assertions is not enough if the process failed. Check whether the relevant inputs changed after that evidence. Do not repeat an unchanged successful suite solely because a worker/session ended.

If the previous thread is needed, select the matching Axon thread and read recent turns. Filter tool results to user decisions, final reports, command exit codes and relevant output before returning them to model context. Never emit an entire session transcript.

State the accepted milestone, unfinished work and next concrete action. Preserve previous authorization without expanding a planning request into product implementation or external sending. Update the live tracker after acceptance, not merely after planning.

Use `scripts/codex/axon-check.ps1 -Check Snapshot` for a compact local evidence/fingerprint snapshot when useful. It is not a release test.
