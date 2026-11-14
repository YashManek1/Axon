# R2-02: prospective never-dispatched hold resolution v1

Status: DECIDED, bounded implementation GO; not implemented or accepted by this record.
Decision owner: Astra. Date: 8 October 2026.

## Decision and boundary

GO for a prospective machine witness that a manual v2 run became UNKNOWN before any worker acquired its dispatch claim, an immutable authenticated operator release intent, and exact-owner durable-hold cleanup. Reuse the existing fresh server-bound preview/approval flow for any explicitly NEW run. There is no retry endpoint, automatic preview, automatic enqueue, or automatic execution following resolution.

NO-GO for releasing a hold belonging to a run that reached DISPATCHING/ACKNOWLEDGED, a legacy UNKNOWN without the prospective witness, or an agent restart/journal uncertainty. Those branches stay locked. Human assurances, elapsed time, disconnected agents, missing queue items, missing/expired journal entries, new sockets, process IDs, and a terminal UNKNOWN receipt are not proof that the previous process tree is absent. A future release of those branches needs a separately decided machine quiescence protocol; this slice does not design one.

This is not full effect reconciliation or general safe retry. R2-02 remains IN PROGRESS after local acceptance of this slice.

## Evidence and rejected alternatives

- `jobRunService.claimRunForDispatch` and `markRunUnknown` already compete through a single-document status/attempt/transition-sequence CAS. Emission occurs only after the dispatch claim succeeds. This is the proof boundary to strengthen, not queue presence or a reason string.
- `executionTargetHoldService` has a unique organization/target owner and deletes conclusive holds by the complete organization/target/run/attempt/fencing tuple. UNKNOWN retains the hold. Preserve this invariant and its existing conclusive-outcome API.
- `jobWorker` acquires the target hold before claiming dispatch. A stale queue delivery can acquire a new hold after an operator removed the previous one; merely deleting the first hold is insufficient.
- Rust journal recovery converts interrupted received/running entries to UNKNOWN. It does not establish process-tree quiescence. The R2-04 contract and local containment evidence do not make restart-to-UNKNOWN a release certificate.
- The saved-run contract is read-only. New mutation routes must not change its existing GET behavior or imply its history is live execution evidence.
- Rejected: human-confirmation release; setting UNKNOWN to REJECTED/COMPLETED to invoke the normal release helper; deleting by target only; resetting Redis locks/fences; replaying the original outbox; retroactively constructing a witness from transitions; and adding a second approval protocol for this slice.

## Invariants and additive persisted contract

Add optional fields to `JobRun`; old documents remain readable and ineligible. Do not backfill witnesses or migrate existing holds.

1. `reconciliationSafetyVersion: 1` is immutable and set only when accepting a new manual v2 run after the matched-worker rollout gate is enabled. It identifies runs covered by the new dispatch/cleanup contract. Missing/unsupported versions fail closed.
2. `nonDispatchProof` is optional and server generated: `{ version: 1, proofId, attemptId, targetAgentId, fromTransitionSequence, terminalTransitionSequence, recordedAt }`. UUID `proofId`, original attempt/target, and consecutive sequence values are required. It is immutable once present.
3. `operatorResolution` is optional: `{ version: 1, resolutionId, requestFingerprint, actorId, actorRole, recordedAt, proofId, terminalTransitionSequence, purpose: 'RELEASE_NEVER_DISPATCHED', reason }`. `resolutionId` is the submitted UUID Idempotency-Key; reason is trimmed plain text of 1–500 characters. Identity, time, purpose, fingerprint and proof linkage are server-derived or server-validated. This is immutable release intent, not a claim that effects were observed or that the target is free.

Mint `nonDispatchProof` only in the SAME atomic update that wins `ACCEPTED|QUEUED` plus the sole attempt `PENDING` plus the expected transition sequence to terminal UNKNOWN, on a version-1 eligible manual run. Match absence of dispatch/acknowledgment timestamps and any pre-existing proof/resolution. The update records the UNKNOWN transition, terminal summary, requiresReview and proof together. If dispatch wins, no witness may be written. If UNKNOWN already exists, no later caller may manufacture a witness. On update uncertainty, only a successful fresh read of the complete committed witness establishes eligibility.

The universal worker rule remains: no command emission without a successful durable dispatch CAS for that immutable run/attempt/target descriptor. All error, duplicate and recovery paths obey it. A witness proves only that this run never acquired that claim under this protocol; it does not prove unrelated/manual changes on the machine were absent.

Resolution does not change UNKNOWN, attempt outcome, terminal summary, transition history, completion time, `requiresReview`, outbox state or historical reason. There is no second mutable 'effects resolved' status. No release-confirmed bit that might become stale is needed: each request returns an observation separately from the immutable intent.

## API and authorization

Add exactly two routes under the existing job/run resource:

- `GET /jobs/:jobId/runs/:runId/reconciliation`
- `POST /jobs/:jobId/runs/:runId/reconciliation`

Both require the current authenticated human, current organization membership and `authResource(Job)` access. Every run lookup is explicitly scoped by organization, job and canonical UUID run ID. Reads follow existing saved-run visibility (including permitted viewers); POST is admin/operator only, not viewer or the legacy user role. Revalidate the current user/role and current job permission in the service immediately before committing intent and again before deleting a hold; accepted intent does not become a bearer authorization for another human. A worker may use a committed intent solely for its own stale-delivery cleanup, without creating new execution authority.

Before a human release mutation, require the original target to still exist in this organization, not be decommissioned, and pass its current allowed-user/allowed-job restrictions. Do not silently substitute the job's new target. Agent online status is not a proof requirement or a release requirement in this never-dispatched branch. Deletion/reassignment/permission loss fails closed; recovery of those administration cases is deferred. As in the existing approval contract, authorization is checked at action boundaries, not claimed to be cross-document linearizable against a concurrent administrator edit.

GET uses `Cache-Control: no-store` and returns an explicit allowlist:

`{ runId, attemptId, targetAgentId, status, transitionSequence, eligible, blockedReason, proof: null | { version, proofId, recordedAt, terminalTransitionSequence }, resolution: null | { resolutionId, actorId, actorRole, recordedAt, purpose, reason }, originalHoldObservation: 'PRESENT' | 'ABSENT' | 'UNAVAILABLE' }`.

`eligible` means the authenticated actor can submit the release request now, not that release already happened. Stable blocked reasons include `FEATURE_DISABLED`, `READ_ONLY_ACTOR`, `NO_SUPPORTED_PROOF`, `TARGET_ACCESS_DENIED` and `EVIDENCE_UNAVAILABLE`. Validate full proof/run consistency server-side. No command, approval material, request fingerprint, socket, address, Redis data, unrelated holder identity or other-job existence is exposed. `ABSENT` means this original owner was not observed at this read; it never means the target is globally free. A conflicting holder's details are not disclosed.

POST body is strict `{ proofId, expectedTransitionSequence, reason }`, plus required UUID `Idempotency-Key`. No client-supplied actor, target, fence, status or evidence certificate is accepted. Commit the entire immutable intent by CAS on scoped run, UNKNOWN, exact supported proof/attempt/target/sequence and absent resolution. Same key and same canonical body returns the existing intent and safely rechecks original-holder cleanup; same key with different body, or a different resolution key once intent exists, returns 409. A replay by a different actor does not reuse another actor's idempotency request: return 409 without mutation. Scope all readback and comparisons to the current tenant/job/run.

Return 200 only after committed intent is confirmed and the original owner is observed absent after bounded cleanup/readback. Body is `{ resolutionId, runId, status: 'UNKNOWN', releaseIntentRecorded: true, originalHoldObservation: 'ABSENT', targetAvailability: 'NOT_ESTABLISHED' }`. Return 400 invalid shape/IDs, 401 current authentication failure, 403 mutation role/resource/target denial, 404 invisible/missing job or run, 409 stale sequence/proof/conflicting intent/ineligible state/feature disabled, and 503 unavailable or ambiguous persistence. A 503 may include the already verified original resolution ID and `releaseIntentRecorded: true`; never guess success. Client retains the SAME identity/body for recovery. Bound load/CAS/readback attempts to at most three; no unbounded loops or background release/retry daemon.

GET does not mutate, release, repair or inspect agent journals/Redis. Existing run GETs and DTOs remain unchanged. Frontend requests use the existing `skipAuthRefresh: true` mechanism so an authentication failure is not silently replayed as another actor.

## Hold release ordering and stale-worker race

Introduce a separate proof-authorized release helper. Do not widen the existing conclusive-outcome helper. It requires freshly confirmed immutable proof + intent and an exact owner tuple belonging to that run/attempt/original target, then deletes only that full tuple including fencingToken. An unrelated run/attempt/newer owner is never deleted. Missing, conflicting, unsupported or unavailable evidence retains the hold.

Human path: authorize -> scoped run/proof read -> atomic immutable intent -> confirm committed intent -> current authorization recheck -> load original holder -> exact-owner delete -> bounded owner readback. No hold deletion precedes confirmed durable intent. A crash or database failure at any point leaves either a retained hold or an idempotently recoverable intent; it never creates execution authority.

Worker path retains hold-before-claim ordering. When dispatch claim is denied and the durable run is terminal UNKNOWN, freshly read the supported proof and intent. If both authorize this never-dispatched run, use the new helper for the hold tuple THIS worker acquired, then return without emit, acknowledgment creation, outbox enqueue or status rewrite. With no proof/intent, preserve existing fail-closed retention. A cleanup failure also retains the hold; the same operator request may later clean it.

Required interleavings: (a) stale worker acquired before human deletion; (b) stale worker acquires a new fenced hold after human deletion; (c) new legitimate run acquires between old-owner read and delete. In (a)/(b), the stale run cannot win dispatch and can delete only its own tuple with confirmed intent. In (c), exact fencing leaves the new owner untouched. A late worker crash may temporarily recreate a retained old hold, so the response deliberately does not certify perpetual absence; same-key recovery is safe. Do not implement target-wide delete or queue purge to hide this condition.

No Redis fence counter, lock or lease is deleted/reset by operator APIs. Existing worker token-safe Redis cleanup remains unchanged; retained UNKNOWN Redis ownership may delay a new run until its existing TTL. Never advertise immediate target availability. Mongo hold evidence and dispatch CAS, not Redis disappearance, are decisive.

## Explicit new run and UI boundary

After a confirmed response, display: 'Release intent recorded; the original hold was absent at the latest check. This run remains UNKNOWN. A new run requires a new preview and approval; target availability has not been established.' Show the original identities, machine proof and authenticated operator intent separately from historical execution evidence.

No dedicated successor/retry API, preview schema version, approval migration or successor-uniqueness index is authorized in this slice. An optional 'Prepare a new run' control may only initiate the existing current-job preview flow after explicit user action, with a fresh preview and normal explicit approval plus fresh Idempotency-Key. It must not reuse the old run's approval, pending approval identity, request key, queue payload or attempt. Existing acceptance/replay rules still apply; acceptance ambiguity retains the new request identity. There is no promise of one total future run per old UNKNOWN.

If the current job target differs from the original target, do not offer this reconciliation shortcut; ordinary job editing/new execution remains a separate explicitly approved workflow. Normal server preview displays and binds the current exact target and all current policies. Any new run receives new run/attempt/target-execution/operation identities; existing worker authorization, agent policy, durable hold and current-release checks still decide whether it can execute.

Keep reconciliation request identity separate from pending execution approval identity. Clear protected data on actor/organization/job/run/proof changes and 401/403/404; fence late promises and overlapping requests. Denial cannot be overwritten by another older success. Present unsupported/legacy/dispatched UNKNOWN as blocked, not as a checkbox-enabled release. No automatic polls, repair requests or effect assertions are introduced.

## Migration, ownership and rollout

- Add optional JobRun fields and validators first; no new database collection or index is required. Never annotate old runs as safe based on their saved history. Existing target-owner uniqueness must still be verified before any release operation; unavailable/malformed index state fails closed.
- Add `AXON_OPERATOR_RESOLUTION_ENABLED`, default false. While false, no safety-version stamping/witness minting or mutation release is enabled; GET can report disabled. Enabling requires all API, recovery and queue-worker processes to run the reviewed same backend release. Old readers tolerate the additive fields. Rust wire/journal format is unchanged.
- Use a quiesced, matched-backend upgrade: stop admission/dispatch, finish or explicitly account for in-flight claims, stop all old workers/recovery processes, upgrade every backend process, verify hold index and reviewed release/configuration, then enable and resume. No rolling mixed-worker enablement. Release-ID matching with the agent remains required for actual new dispatch.
- Rollback: disable feature and stop admission/dispatch; quiesce updated workers before starting an older backend. Do not strip proofs/intents, delete holds, reset fences or replay UNKNOWN to make rollback work. Old workers may retain a stale hold they cannot clean; this availability limitation is preferable to unsafe cleanup. Re-enable only on the reviewed matched implementation.
- Deployment/enablement is a separate human-authorized gate, not authorized by implementation work or by this decision. Default-off must be tested. No customer database operation, harness modification, Docker action, fleet rollout or external message belongs to this packet.

## Exact implementation ownership and acceptance

Backend owner: `backend/models/jobRun.js`, `backend/services/jobRunService.js`, `backend/services/executionTargetHoldService.js`, `backend/workers/jobWorker.js`, `backend/routes/jobR.js`; new bounded reconciliation service/controller/schema modules and corresponding backend tests. Reuse existing `jwt.js`/resource access and approval services without changing their contracts. Do not change Rust, the hold schema/index, saved-run read DTOs, server-bound approval hashes or runNow request shape. The backend owner must report any needed deviation before implementation.

Frontend owner, only after the response types stabilize: reconciliation projection/actions in a scoped new component integrated into JobDetail, corresponding API methods/types and focused interaction tests. Preserve SavedRunEvidence's read-only responsibilities and existing approval recovery logic. Root owns context/tracker updates. This decision document has one architecture writer; other files remain outside this writer's scope.

Required automated acceptance (actual effects AND forbidden-effect assertions):

1. Prospective version gating; legacy UNKNOWN remains ineligible; atomic pre-dispatch UNKNOWN versus dispatch-claim race in both orders; only one wins; witness never minted for DISPATCHING/ACKNOWLEDGED or terminal replay; exact proof/sequence/target/attempt validation.
2. Current tenant/job/resource/role/target-user/target-job/decommission isolation, permission loss between read and mutation, every replay reauthorization, foreign IDs indistinguishable, allowlisted no-store GET, GET zero writes and redacted errors.
3. Intent CAS concurrency, same-key replay, changed payload/actor/key conflicts, pre/post-commit write uncertainty and bounded readback, unavailable evidence retains holds, no hold deletion before verified intent, no mutation of historical outcome/summary/requiresReview/outbox.
4. Both stale-worker hold-before-release and hold-after-release interleavings; no old command emission/enqueue/status rewrite; crash between acquire and cleanup; exact fencing protects another run's new owner; unavailable/unsupported witness or intent keeps the hold; no Redis delete/reset/ownership bypass. Include real isolated Mongo CAS concurrency, not only mocked proof construction.
5. Existing fresh preview/approval generates new execution identities; no launch on resolution success; old pending approval and reconciliation request identities stay independent; queue/acceptance ambiguity preserves each request identity. Existing v1 approval golden vectors and ordinary terminal hold release remain unchanged.
6. Frontend actor/org/job/run/proof switches, immediate protected-state hiding, late success after denial, overlap races, 401 without refresh POST, blocked legacy/dispatched UNKNOWN, exact original target visibility, fresh explicit approval, and truthful absence/availability wording.
7. Default-disabled and matched-release rollout checks; existing backend/frontend regression evidence at final stabilized fingerprints; independent security/final acceptance. Reuse already-valid unchanged evidence; this decision authorizes no duplicate suite solely for review.

Human/live gates after local acceptance: explicitly authorized isolated fault drill for crash after intent/before delete and stale worker after delete; actual connected-agent check that a fresh approved run executes only once after the safe branch and that dispatched UNKNOWN still cannot release. Do not infer these from mocks or the earlier approval harness. Actual multi-host process-crash/quiescence, screen-reader/second-operator walkthrough and general effect reconciliation remain open unless separately evidenced.
