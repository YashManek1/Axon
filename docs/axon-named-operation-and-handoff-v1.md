# Named-operation example and sanitized saved-run handoff v1

Status: approved bounded implementation contract, 2 October 2026; **not implementation acceptance**. Authority: Astra's `.codex/evidence/frontend-clarity-20261001/acceptance-final.md`, existing read-only `axon-operator-reconciliation-v1.md`. No backend/DTO/authentication/execution/retry changes.

## Manual operation example

Present **Check staging application version** as **Example — manual setup, not validated for your server**. Explain the purpose, responsible environment owner's permission and path validation, supported Linux assumptions, exact-server review, illustrative `/srv/example/VERSION`, expected nonsensitive version text, and exit-code meaning. Exit zero does not prove application health. UNKNOWN requires investigation, not blind repetition.

No installed catalog, invented owner, approved input schema, automatic creation, seeding, autofill, dispatch or approval bypass. Real script/environment and second-operator validation remain required; this is partial progress on named-operation packaging.

## Handoff boundary

Explicit preparation uses a fresh authorized exact-run GET with `skipAuthRefresh: true`. Construct new fixed-label plaintext headed `Saved-run handoff - snapshot, not live`; never serialize or spread the received DTO.

- Require original job/run IDs to match the requested resource after normalization. Mongo IDs: exactly 24 hexadecimal characters. UUIDs: canonical hyphenated version 1–8 and RFC variant, case-insensitive; normalize both types to lowercase. No trimming/coercion/ASCII fallback. Invalid required IDs reject export; invalid optional IDs become fixed unavailable text.
- Include only original job/run/target IDs, saved status, review flag, validated UTC ISO timestamps, and at most 20 attempts in received order. Attempts may include validated correlation IDs, nonnegative integer sequence, recognized status/outcome, timestamps and integer exit code. Include optional terminal summary with the same normalization. State omitted-attempt count; do not infer authority from array order.
- Run/terminal statuses: ACCEPTED, QUEUED, DISPATCHING, ACKNOWLEDGED, SUCCEEDED, FAILED, TIMED_OUT, REJECTED, CANCELLED, UNKNOWN. Attempt statuses add PENDING and omit ACCEPTED/QUEUED. Outcomes: COMPLETED, REJECTED, TIMED_OUT, CANCELLED, UNKNOWN. Unknown values get fixed fallback text, never echoed. Missing/invalid dates and malformed optional fields are unavailable.
- Exclude current job name/target, requester, command, logs/output, raw reason codes, transitions, approval material, arbitrary properties and links. Do not call the job ID an immutable operation version.
- Explain acceptance/queue/acknowledgement versus completion; UNKNOWN/review/unrecognized evidence cannot confirm effects. Failure does not establish safe repetition; success does not establish application health. Always disclaim retry/hold-release authorization and deployment readiness.

## Authorization and races

Bind preview to actor, organization, job, selected run and request generation. Copy is explicit and performs a new exact-run GET; compare canonical sanitized evidence excluding local retrieval time. Changed evidence replaces preview and requires renewed review/click, not silent copying.

Any list/detail/handoff 401/403 invalidates all in-flight lanes, clears protected list/detail/handoff and feedback, resets evidence presence, and enters the permission state. Old successes cannot repopulate it. Recovery requires an explicitly initiated fresh read. No refresh POST/replay.

Other failures, missing/mismatched identity, malformed responses and stale refresh clear exportable preview and disable copy; no cached/latest-run fallback or raw server error interpolation. Context switches and unmount invalidate preparation/copy. Check context/generation immediately before clipboard invocation; report Copied only after successful completion in the current context. Clipboard rejection is a failure. Already-invoked clipboard writes cannot reliably be recalled; later switches suppress feedback, not claim reversal. Authority is verified at GET time, not forever afterward.

No automatic clipboard, storage/export/upload, external sending or clearing unrelated clipboard contents. Existing read-only evidence may retain its established stale display, never as an export fallback.

## Acceptance

Pure formatter tests cover valid/invalid/mismatched IDs, normalization, every enum, missing/malformed fields and dates, zero exit code, truncation, excluded-field secret sentinels and input immutability. Interaction tests cover authorized viewers, fresh GETs, changed-evidence review, 401/403 across all racing lanes, other failures, actor/org/job/run switches, unmount, delayed successes, clipboard rejection and GET-only behavior. Verify keyboard operation and narrow light/dark preview layout. Use valid contract identifiers in export fixtures.

Stabilized independent security review plus parent integration evidence are required. This contract does not establish a validated customer procedure, live agent acceptance, screen-reader acceptance, pilot readiness or commercial qualification.
