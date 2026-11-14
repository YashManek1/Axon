# Server-bound approval rollout checklist

Status: implementation checklist, not deployment approval or completed evidence. Updated 27 September 2026. The [approval contract](axon-server-bound-approval-contract-v1.md) governs behavior; independent acceptance is still required.

## Local implementation gate

Backend and frontend must be verified together before this milestone is accepted. Preserve the previously accepted terminal-write recovery and accessibility behavior. Do not infer approval enforcement from the architecture gate alone.

- Verify both actual JobRun unique indexes: tenant/actor/request key and consumed approval preview ID. Missing or incompatible indexes must prevent admission and dispatch; do not silently remove indexes or duplicate records.
- Cover startup, not only route guards. Current baseline starts Bull workers at module import in `backend/workers/jobWorker.js` and a recovery interval at module import in `backend/config/queue.js`; `backend/server.js` connects MongoDB later. Index verification must precede any worker/outbox dispatch as well as HTTP admission. These are baseline findings to close, not a claim about the implemented solution.
- Verify authenticated replay before mutable job/agent/expiry checks, while retaining current resource access checks. A changed job type must not route an approval-bearing request into legacy HTTP execution.
- Test immutable preview creation without run, hold, queue, notification or command side effects; test acceptance through real API and worker paths, including missing/stale/corrupt approvals.
- Exercise both unique-index collision paths in isolated MongoDB, uncertain insertion/readback, durable outbox recovery, and replay after preview deletion. No database cleanup on a customer database.
- Verify queue recovery and worker notifications use only integrity-checked persisted approval content, never mutable job or queue recipients.
- Verify UI response-loss recovery retains the same key, preview ID and hash across same-tab refresh and account boundaries, with no stored command or recipients. Distinguish acceptance uncertainty from execution UNKNOWN.
- Freeze sources, preserve command/exit/count/fingerprint records, obtain independent Astra review, and check integration before changing the live tracker to accepted.

## Supervised rollout gate (not executed)

1. Obtain explicit deployment authority and an identified isolated/pilot environment, operator, matched artifact manifest and rollback candidate. Release-label equality is not artifact provenance.
2. Quiesce shell admission and all dispatch/recovery instances. Merely hiding the UI or stopping one replica is insufficient. Do not apply a live migration while an old dispatcher can emit approval-less commands.
3. Inventory nonterminal runs, queued attempts and retained target holds. Reconcile old or uncertain work using durable run/agent evidence. Do not invent approvals, replace targets, or clear holds to enable a retry.
4. Preserve a verified backup and deduplication records. Build and inspect the required indexes using the approved startup/migration path. Resolve any conflicts under a separately reviewed recovery procedure; do not delete records to manufacture uniqueness.
5. Install matched API/worker enforcement and preview-aware frontend. Old shell clients must receive PREVIEW_REQUIRED, and historical approval-less queue records must fail closed. Historical runs remain readable.
6. Verify missing-index startup failure, old-client denial, old-queue denial, approved exact-target launch, committed-response-loss recovery, stale snapshot rejection and outbox recovery in the intended topology. Record absent forbidden effects as well as successful effects.
7. Resume admission only after operator reconciliation, index readiness, matched-release checks and independent acceptance. Record unresolved effects and ownership; local unit tests do not establish multi-host Linux or paid-pilot readiness.

## Rollback gate

Rollback may use only a compatible version retaining approval enforcement, or keep shell admission and dispatch disabled. An old approval-less release is not a safe live rollback. Do not restore queues or databases and replay uncertain external effects. Retain accepted request/approval identities; do not remove replay protection during preview cleanup or backup restoration.

No deployment, migration, backup, hold release, credential change or outbound message is authorized by this checklist.
