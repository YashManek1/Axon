# Server-bound manual-run approval contract v1

Status: IMPLEMENTED; independent local acceptance is recorded in `.codex/evidence/backend-accepted-response-20260927/independent-review.md`, together with previously accepted frontend r4 and backend integration evidence. Recorded 26 September 2026; implementation alignment updated 27 September. This is not deployment or whole-product acceptance: authenticated browser operation, rollout/live persistence faults and migration validation remain release gates. Owner: Astra contract; Sol backend; Terra frontend; independent Astra security review.

## Decision and boundary

For a manual shell run, the operator reviews an immutable server-created preview and approves that exact preview. One atomic `JobRun` insert records acceptance, the complete approval snapshot, and the existing durable pending-dispatch intent. Preview creation never creates a run, reserves a target hold, queues work or emits a command. This narrows the preview-or-equivalent-fields option in [execution contract v2](axon-execution-contract-v2.md): browser-supplied commands/settings are not an approval substitute.

Scope is the existing single-target, single-attempt shell path. No Rust wire change, automatic execution retry, multi-target workflow, new outreach permission, or production-readiness promise is introduced. T08 terminal confirmation must stabilize before integration in its shared service/worker files. Existing pilot execution containment, exact targeting, agent journal, target hold and honest execution `UNKNOWN` remain required.

## Public API

Both routes use existing human authentication, mutation-role enforcement and tenant-scoped job resource authorization. Organization and actor identity always come from authenticated server context. Responses containing commands or recipients must not be cached (`Cache-Control: no-store`).

`POST /jobs/previewJobRun/:jobId` accepts no execution settings. It validates the current supported manual-shell definition and exact agent policy, requires the selected agent online, and persists an immutable preview. A fresh preview requires a fresh explicit review. Return HTTP 201:

```ts
type ManualRunPreviewResponse = {
  previewId: string;       // server-generated UUID
  previewVersion: 1;
  previewHash: string;     // lower-case SHA-256 hex
  expiresAt: string;       // UTC ISO-8601; issuedAt + 300,000 ms
  preview: {
    jobId: string;
    jobName: string;
    targetAgentId: string;
    targetLabel: string;
    command: string;
    actionVersion: string;
    timeoutMs: number;
    maxOutputBytes: number;
    requiredReleaseId: string;
    notifications: {
      onSuccess: boolean;
      onFailure: boolean;
      recipients: string[];
    };
  };
};
```

All public fields come from the saved record. `targetLabel` is the saved agent name with the stable ID available to the UI; it is not an environment-membership assertion. The preview contains no credential, socket token, private policy list or signing secret.

`POST /jobs/runJobNow/:jobId` for shell jobs requires the `Idempotency-Key` header as a UUID, generated once by the browser for this approval submission, and this strict body:

```ts
type ApproveManualRunRequest = {
  previewId: string;
  previewHash: string;
};

type ManualRunAcceptanceResponse = {
  message: string;
  runId: string;
  status: RunStatus;       // existing JobRun status enum
  queueStateConfirmed?: boolean; // new acceptance only; replay shape unchanged
  idempotentReplay: boolean;
};
```

Do not fall back to a body `requestKey`, accept unknown execution fields, or generate a replacement key on network failure. UUIDs and hashes are validated and canonicalized consistently; command text is never trimmed or normalized. Missing preview fields return 428; present malformed values/extra fields return 400. Missing or malformed header returns `400 INVALID_REQUEST_KEY`.

Preserve HTTP 200 for a queue-confirmed launch or matching previously accepted request. New-acceptance responses include `queueStateConfirmed`; exact replay retains its existing shape without that field and never re-enqueues. If insertion is confirmed but later queue handoff, queued transition/readback, or job-status projection cannot be confirmed, return HTTP 202 with the original `runId` and `queueStateConfirmed: false`. When readback or projection is unavailable, `status: ACCEPTED` reports the last provable acceptance, not rejection or execution success; if readback returns a known run status, preserve that status. The existing durable outbox owns recovery; this response repair adds no enqueue retry, execution retry or replacement identity. If insertion cannot be proved or disproved after bounded readback, return `503 LAUNCH_ACCEPTANCE_UNKNOWN`; the caller retains all three request identifiers. A transport failure without a response has the same client recovery behavior.

Existing explicit legacy HTTP execution behavior is outside this approval contract; pilot containment must continue to reject it. It must not provide a bypass for shell execution.

## Immutable data and hash identity

Add an immutable preview model and service. Store `previewId`, version, tenant, actor, job, issued/expiry times, public preview fields and a private material-policy snapshot. No mutable consumed flag is authoritative. Add an optional embedded `approval` to `JobRun` for historical compatibility; every newly accepted shell run requires it. Copy the complete preview snapshot and hash into the run, plus server acceptance time. Never rebuild accepted content from the current job.

The service owns one versioned serializer shared by preview, acceptance and worker checks. Hash UTF-8 JSON of a fixed-order array, with nested values serialized in their documented fixed order; do not hash a spread Mongoose document. The implementation must freeze this order in golden-vector tests:

1. Version, preview ID, organization ID, actor ID, job ID, issued-at epoch milliseconds, expiry epoch milliseconds.
2. Public fields in the order in `ManualRunPreviewResponse.preview`, with notification fields in their declared order.
3. Effective execution profile, protocol version `2`, trigger `MANUAL_API`, and fixed automatic-retry count `0`.
4. Actor effective role; job owner ID; job permission user and role arrays.
5. Job type, exact target ID and command; timeout/output limits; enabled/status; schedule, schedule type, timezone and execution-window policy; retryLimit, dependencies, webhook and sink settings as relevant to execution-surface validation.
6. Agent `tokenVersion`, decommission state, allowed user/job/command arrays, and declared `sandboxMode`.

Normalize IDs to their string representation and optional values to explicit service-defined defaults/null; include those defaults in serializer tests. Preserve array order conservatively (a reorder may require a new preview); do not change command bytes. Sink/execution-window subobjects need explicit fixed field order, not incidental database key order. The existing `actionVersion` remains SHA-256 of the exact command only. `previewHash` is the richer approval identity, not a replacement action/wire version or a credential.

`AXON_RELEASE_ID` must be nonempty in the accepting backend and dispatching worker; bind its trimmed effective value as `requiredReleaseId`. Equality identifies the configured release; it does not prove artifact provenance. The socket router's existing agent-release equality check remains required. `sandboxMode` binds declared policy, not a claim that all runtime containment guarantees have been proved.

Do not bind `updatedAt`, `__v`, telemetry, last-seen time, queue state, socket ID or connection generation into material identity. Agent `tokenVersion` is credential authorization generation; `connectionGeneration` is session ownership and remains checked by the existing connection path. Resolve the exact live socket at acceptance/dispatch according to existing rules, without silently changing stable target identity.

For freshness comparison, rebuild only the material section with the original preview identity/timestamps. Compare normalized content, not database edit history. Restoring identical content is equivalent. This design does not promise permanent revocation after every intervening edit. Cosmetic description/category/tags/priority changes need not invalidate; changed displayed names/target label or any bound field do.

## Atomic acceptance and replay

Keep the existing unique partial index on `{orgId, "triggeredBy.userId", requestKey}`. Add a unique partial index on `{"approval.previewId": 1}` for records whose approval preview ID is a string. Preview UUIDs are globally unique. Build and verify these indexes before accepting traffic; application-level lookups alone do not enforce single consumption.

The acceptance order is mandatory:

1. Authenticate and authorize the current actor against the requested tenant/job. Validate request syntax.
2. Look up the scoped request key. A run with exactly matching actor, tenant, job, preview ID and hash is returned immediately, before preview expiry, cleanup, current agent availability or material-content checks. Do not queue again in this response path. A different identity returns `REQUEST_KEY_CONFLICT` without exposing another tenant's data.
3. Load preview by ID plus actor/tenant/job; wrong ownership is indistinguishable from absence. Validate stored hash integrity and supplied hash, expiry (`now >= expiresAt` is expired), current authorization, current material content and release. A preview consumed with a different key returns `PREVIEW_ALREADY_CONSUMED`.
4. Require the same target currently available. If offline before acceptance, reject without a new run/queue/hold. If it goes offline after insertion, preserve accepted identity and apply the existing outbox/deadline/fail-closed behavior, with no replacement target.
5. Atomically insert the run containing approval, immutable action, identities, first attempt, request key/fingerprint and durable `ACCEPTED` intent. Derive `startBefore` from acceptance time plus the existing 60-second dispatch window, not from preview issue time. Preview lifetime governs acceptance, not subsequent execution/recovery.
6. On unique collision, read the winning scoped key and/or consumed preview record and return the same run or the appropriate conflict. Do not infer which unique index collided without checking. An unreadable/unprovable winner is acceptance uncertainty, not permission to insert with new identifiers.
7. After confirmed insertion, queue using the existing deterministic attempt ID/outbox protocol. Never use a separate preview-consumption update, multi-document transaction or browser timestamp as the authority for acceptance.

The request fingerprint must represent approval identity, not be recomputed from mutable job content before recovering an accepted request. Known accepted recovery still requires current human/resource access, but it does not authorize new dispatch. Worker authorization may subsequently reject the saved run. Do not disclose a run after actor access is revoked.

Preview TTL deletion may reclaim unaccepted/expired preview records, but must not erase replay protection: accepted-run approval and request identity remain durable. Do not add run-retention cleanup that removes deduplication records in this milestone. If future retention requires it, decide durable tombstones and retry lifetime first. Replay recovery must work even after the preview record is gone.

## Worker and recovery invariants

Before command emission, validate persisted approval hash/version, equality between approved fields and the durable action/target, current actor/job access, current material job/agent policy, agent credential generation, and the worker's configured release. Reject missing, corrupt or stale approval before any command emission. Existing exact socket identity/protocol/release enforcement remains the final dispatch gate.

The production service must use the same snapshot validator in launch and pre-emission checks; deny-path tests must cover the real worker entry point. Accepted historical runs without approval cannot acquire synthetic approval during recovery. Missing approval fails closed, preserving any existing execution uncertainty/target hold according to established recovery semantics.

For initial queueing and durable recovery, `jobName` and notifications come only from the persisted approval snapshot. Workers must not trust mutable queue notification settings; rebuild/verify them against the durable run. If current notification recipients or settings change before emission, the material check rejects stale approval. Existing notification outcome policy remains unchanged; no exactly-once email promise is introduced.

Checks occur at acceptance and immediately before emission; edits after the final check cannot retract an already emitted command. This is not a cross-document linearizable revocation guarantee. Once emitted, execute only the immutable approved command; classify uncertain remote outcomes with existing execution `UNKNOWN`. Never convert acceptance uncertainty into execution `UNKNOWN`, or retry execution to repair a database/HTTP response.

## Errors and client behavior

| HTTP / code | Meaning and required behavior |
|---|---|
| 428 `PREVIEW_REQUIRED` | Shell launch lacks preview identity; obtain and explicitly review a preview. |
| 400 `INVALID_PREVIEW` | Malformed identity/hash/body or unknown execution fields; no effects. |
| 400 `INVALID_REQUEST_KEY` | Missing/malformed idempotency header; no effects. |
| 404 `PREVIEW_NOT_FOUND` | No preview owned by this actor/tenant/job. |
| 409 `PREVIEW_MISMATCH` | Supplied hash differs from the owned saved preview. |
| 409 `PREVIEW_STALE` | A bound material value changed; explicitly review a new preview. |
| 410 `PREVIEW_EXPIRED` | Unaccepted preview expired; explicitly review a new preview. |
| 409 `REQUEST_KEY_CONFLICT` | Scoped key already identifies another approval/job. |
| 409 `PREVIEW_ALREADY_CONSUMED` | Preview belongs to an accepted run under a different key. |
| 503 `RELEASE_ID_REQUIRED` | Accepting/previewing service lacks configured release identity. |
| 503 `LAUNCH_ACCEPTANCE_UNKNOWN` | Run insertion/readback result uncertain; retain identity and check the same request. |

Corrupt persisted snapshot/hash fails closed with a generic server-integrity error and internal diagnostic; do not treat it as user-approved content. Existing authenticated 401/403/resource-404 and target/policy/containment errors retain their meanings. Worker rejection reasons must distinguish stale/missing/corrupt approval and release mismatch without returning private policy data to unauthorized callers.

Client states: loading preview, reviewable, submitting, accepted, expired/stale, ordinary error, and acceptance unknown. Show server command, exact target, limits, release and notification recipients/settings. Disable confirmation while loading, submitting or expired. Preserve the existing dialog labeling, keyboard focus trap, Escape/cancel behavior and focus restoration.

For acceptance unknown, retain `Idempotency-Key`, `previewId`, `previewHash` and job identity; offer an explicit check using that identical POST. An HTTP response lost after successful acceptance must converge on the same run. Do not automatically regenerate a preview/key or expose an ordinary new-run action while an unresolved submission is being checked. Persist pending submission identity per authenticated account/tenant in session storage so a same-tab refresh preserves recovery; clear or segregate it on account switch, and do not store command/recipient content there. Execution `UNKNOWN` keeps its separate reconciliation warning.

## Migration and ownership

1. Stabilize and accept T08 in shared service/worker files. Add preview schema/service and optional historical run approval field; build and verify unique indexes before enabling approval-required traffic.
2. Quiesce shell admission and dispatch during rollout. Inventory and reconcile nonterminal pre-upgrade runs and retained target holds using existing procedures. Never invent approval or replay uncertain historical work. Old queue records cannot bypass the new worker check.
3. Roll out matched API/worker enforcement and the preview-aware frontend. Old shell clients fail closed with `PREVIEW_REQUIRED`; no grace bypass. New runs require approved snapshots even while historical records remain readable.
4. Verify migration, recovery and independent security acceptance before resuming shell admission. Rollback may only use a compatible version retaining approval enforcement, or keep shell execution disabled; rollback must not reopen approval-less launch.

Expected implementation files (future writes, not changed by this decision):

- Backend: new `backend/models/jobRunPreview.js`, `backend/services/jobRunPreviewService.js`; existing `backend/models/jobRun.js`, `backend/services/jobRunService.js`, `backend/controllers/jobC.js`, `backend/routes/jobR.js`, `backend/schemas/jobSchemas.js`, `backend/workers/jobWorker.js`; focused preview/API/service/worker/recovery tests.
- Frontend: `frontend/src/services/api.ts`, shared preview/request types where this project keeps API types, `frontend/src/pages/dashboard/JobDetailPage.tsx`, `frontend/src/tests/JobDetailPilotPolicy.test.tsx` and focused service tests as needed.
- No Rust schema change. Confirm recovery callers of `buildQueueData` use persisted snapshots; only expand file ownership if their implementation needs modification.

## Required acceptance evidence

Tests must assert both the intended result and absence of unauthorized runs, queue entries, target holds, notifications and command emissions as appropriate to each stage.

1. Successful preview has no execution side effects; successful approval emits the exact shown command on the exact target with a single accepted run/attempt. Direct API bypass, extra settings, malformed/missing identifiers and unsupported execution surfaces fail closed.
2. Wrong tenant/actor/job, viewer access, revoked user/resource/agent authorization, credential generation change and decommissioned agent fail through real API/worker paths without information leakage or dispatch.
3. Every bound field has a mutation case (command, target, labels, permissions/policy, timeout/output, execution profile/release, declared sandbox, notification recipients/settings and execution-surface fields). Unrelated metadata/telemetry edits remain valid; restored identical content follows the documented equivalence. Golden serializer vectors preserve command bytes and explicit defaults.
4. Boundary expiry, preview cleanup after acceptance, missing release, worker release mismatch and agent release mismatch behave as specified. Preview creation offline has no run; offline after preview/acceptance never retargets.
5. Concurrent identical submissions converge on one run. Same key/different approval or job conflicts; same preview/different keys consumes once. Test both unique-index collision paths with actual isolated MongoDB indexes, not only mocks.
6. Lost HTTP response after insertion; database write committed then threw; precommit failure; uncertain readback; duplicate-key winner read failure; and preview expiry during retry preserve request identity and never cause a second effect. Known acceptance plus queue failure returns accepted pending state and recovers through the existing outbox.
7. Restart/recovery after job or notification edits uses the saved snapshot and rejects stale policy before emission. Tampered queue/action/approval data and missing approval cannot emit or send altered recipients. Target hold and T08 terminal uncertainty behavior do not regress.
8. UI obtains server preview, displays its values, handles stale/expired/403, prevents double submit, retains pending identity on refresh, and checks an uncertain submission with the same key/body. Keyboard/focus accessibility remains intact; acceptance uncertainty and execution uncertainty are visibly distinct.
9. Historical readable runs, pre-upgrade queue records, verified indexes, matched rollout and fail-closed rollback are covered. Record isolated topology, commands, exits, counts and limitations; independent review follows stabilized implementation. Existing local checks alone do not prove clean-host installation or multi-host Linux operation.

## Evidence, alternatives and residual risks

Current source evidence: `jobRun.js` already has scoped request-key uniqueness and embedded durable transition/attempt state; `createManualShellRun` currently fingerprints mutable job/action content before replay resolution; `buildQueueData` currently takes notification settings/name from the job; the controller accepts an optional request key; the worker rechecks human/job and agent policies; the router enforces exact socket identity/protocol and configured release; agent credential generation is `tokenVersion`. These are integration points, not claims that preview enforcement already exists. No test suite was rerun for this documentation-only decision.

Rejected: browser-only confirmation (not server bound); hash supplied content without server-owned record (no authoritative review identity); separate consume write/transaction (unnecessary atomicity gap/topology requirement); globally shared request keys (tenant/actor coupling); `updatedAt` freshness (telemetry/cosmetic invalidations); automatic resubmission with a fresh key (duplicate effects); rebuilding notification recipients during recovery (unapproved external destination).

Residual risks: narrow authorization/check-to-emission race; release-label equality without provenance; notification delivery ambiguity; deduplication retention requirements; historical work requiring reconciliation; declared sandbox policy versus verified runtime enforcement. None is permission to advertise exactly-once effects, arbitrary revocation after emission, or completed commercial readiness.
