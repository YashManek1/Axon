---
name: axon-context-efficiency
description: Keep Axon investigations and implementation turns within bounded context using compact retrieval, evidence reuse and role routing. Use for Axon work where repeated reads, long outputs or delegation overhead threaten token or rate-limit efficiency.
---

# Axon context efficiency

Start with `docs/AXON-CONTEXT.md` and `docs/AXON-LIVE-TODO.md`, then read only the exact linked milestone or source needed for the current decision. Use `rg` with a narrow path and context window; inspect symbols or focused excerpts instead of whole files.

Bound command output with the project tool-output cap. Save full logs or machine-readable results under `.codex/evidence/`, then return only exit status, counts, relevant failures and the evidence path. Recover an interrupted command result before rerunning; reuse unchanged successful evidence.

Delegate only when discovery spans several independent files or the delegate can absorb a large search and return a small conclusion. Use `investigator_luna` for read-only discovery, `backend_sol` or `frontend_terra` for assigned implementation, and `architecture_astra` before shared contracts, tenant/auth boundaries, retries, destructive workflows or security acceptance. Keep one writer per file.

Do not install or enable third-party token proxies or hooks from this skill. Evaluate them separately for provenance, supported platform behavior, interception scope and measured output savings.