# Saved-run evidence / operator reconciliation v1

Decision: Astra, 28 September 2026. Scope: read-only inspection of durable evidence, not resolution of remote effects, safe retry, or hold release.

## API and authority

MongoDB `JobRun` is the durable source. Audit history is a different record and cannot establish accepted-request state. Both routes use `authUser` and current `authResource(Job, "jobId")`; all run queries constrain authenticated organization and authorized job.

- `GET /jobs/:jobId/runs`: latest ten, ordered by `createdAt` descending then `_id` descending; returns `{ runs, hasMore }`.
- `GET /jobs/:jobId/runs/:runId`: exact canonical UUID lookup; malformed UUID is 400, absent/not-visible run is 404, storage failure is 503 rather than successful empty evidence.
- Responses use `Cache-Control: no-store`. Authorized viewers can inspect. No database mutation, queue inspection/enqueue, dispatch, recovery or hold changes.

Explicit DTO allowlist: runId, jobId, targetAgentId, status, requiresReview, reasonCode, createdAt, updatedAt, queuedAt, completedAt, transitionSequence; attempts with correlated identities, sequence, status, timestamps, outcome, exitCode and reasonCode; transitions with sequence, from, to, at, reasonCode, source and attemptId; terminalSummary with status, outcome, exitCode, reasonCode and completedAt. Optional evidence stays optional. Exclude commands, approval material, recipients, request keys/fingerprints, socket and queue identities, IP/user-agent and policy snapshots. No terminal output/logs in this slice.

## UI interpretation

Label the panel “Saved run evidence”; identify the original run and stable target from that record, never today's job target. Show the latest-ten limit and exact-run lookup for older/original runs.

- UNKNOWN or requiresReview: effects cannot be confirmed.
- ACCEPTED: durable request only, not queue or execution confirmation.
- QUEUED: saved queue transition, not current Redis availability.
- DISPATCHING / ACKNOWLEDGED: not completion.
- FAILED / TIMED_OUT / CANCELLED: do not prove absence of effects.

Never infer hold presence/release or retry safety. Guidance: retain correlated IDs, ask the responsible operator to inspect the original target, and do not rerun or clear holds to resolve uncertainty.

202 with queueStateConfirmed=false retains and displays the original run ID as accepted with queue state unconfirmed. Offer GET evidence/refresh, not another approval POST. Pending network/503 acceptance recovery remains separate: never guess the newest run to resolve pending identity or delete its saved request keys.

Scope query identity to actor, organization, job and selected run; suppress delayed old-context responses. Failed refresh marks data stale/unavailable; authentication/authorization denial clears protected evidence. Render evidence as escaped text with accessible controls.

Astra clarification: both evidence GETs use the existing `skipAuthRefresh: true` request option. A 401 reaches the panel without a refresh POST or replay, clears protected evidence and requests reauthentication. Other API authentication behavior is unchanged.

## Acceptance

Backend: authentication, tenant/current-job permission and cross-job denial, viewer reads, serializer redaction, deterministic bounded list and older exact lookup, historical records, missing versus unavailable evidence and no forbidden side effects. Frontend: uncertainty semantics, original target, unconfirmed acceptance, exact lookup, refresh errors, context switches/delayed responses, GET-only inspection and unchanged pending-approval identity. Independent stabilized review is required before local acceptance. Live persistence-fault/process-crash validation, safe retry and operational hold reconciliation remain separate gates.

Local bounded milestone accepted 29 September 2026 after stabilized independent review: `.codex/evidence/operator-reconciliation-20260928/architecture-final-review.md`. Integration and unchanged-source verification: `.codex/evidence/operator-reconciliation-20260928/verification.md`. This accepts saved-run inspection only; it does not make selected detail live, resolve effects or holds, authorize retry, or establish deployment/pilot readiness.
