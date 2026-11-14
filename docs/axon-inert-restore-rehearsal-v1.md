# Inert restore rehearsal packet

4 October 2026. **Draft for Astra decision. Not implemented or performed.** This follows independent connected-agent acceptance, not a production restore procedure.

## Why recovery must stay offline

`backend/server.js` starts job workers and `startQueueRuntime()`. `backend/config/queue.js` invokes recovery immediately and every 30 seconds. `backend/services/jobRunService.js:963` may enqueue a persisted ACCEPTED intent if its queue item is absent. Later states without queue evidence become UNKNOWN instead. Starting the ordinary backend against restored records is therefore not an inert verification operation.

The accepted `docs/decisions/R2-04-durability-contract.md` makes JobRun the dispatch outbox and binds queue identity to attempt identity. `agent/src/journal.rs` turns interrupted Received/Running entries into UNKNOWN on open. Redis and the agent journal are not interchangeable with a Mongo-only export; discarding either cannot be called a complete operational restore. No recovery or journal-opening code should run during the first comparison.

## Proposed bounded outcome

Demonstrate that an entirely disposable, quiescent synthetic persistence set can be backed up and restored into a second, separately owned set without execution, identity replacement or removal of uncertainty/holds. This establishes a local offline data-preservation slice only. It does not authorize resumption of dispatch.

Use reviewed same-version local MongoDB/Redis images and recorded digests. Start **only** owned database containers, not backend, workers, frontend or agents. Do not mount the host Docker socket into a service. The exercise has no customer endpoints, real user credentials or execution target. Generate synthetic tenants, original run/attempt/approval identities, a terminal success and an UNKNOWN run with its original hold. Include a pending ACCEPTED intent explicitly to prove that it remains data, not queued execution. Synthetic fixtures must be labelled as such; they are not real fault evidence.

Capture all application Mongo collections and indexes in the selected disposable database (including previews, holds, histories, audit, users, organizations, jobs and agents). Generate private synthetic Redis queue/fence records with known identities; they do not represent a running BullMQ worker. Capture Redis persistence and a private synthetic journal file as separate backup components, with a manifest identifying release, formats, image digests, checksums and fixture provenance. No component is silently omitted and no dump content/secrets are printed in evidence. Expiry-sensitive fixtures must remain valid during comparison; time must not be changed to hide TTL losses.

Because all writers are absent throughout, this exercise can claim a quiescent fixture snapshot, not a live cross-store consistency algorithm. Restore into fresh owned resources, refusing an existing or nonempty destination. Restore raw journal files without opening them through the agent. Validate exact original IDs, relationships, tenant separation, UNKNOWN reason/requiresReview, unchanged holds, queue/fence values, journal bytes and necessary unique indexes. Explicitly assert no backend/worker/agent exists, no dispatch is attempted, and the pending ACCEPTED record has not advanced.

## Safety and acceptance

Reuse independently accepted harness safety utilities only at recorded fingerprints and after reviewer confirmation of their suitability. Exact owner labels, random names, immutable IDs, loopback ports, effective configuration validation, local daemon identity, bounded native calls, child-only secrets, private paths, redacted logs and cleanup-after-partial-failure are required. Never use drop/flush/prune, shared names or existing host volumes. Runtime PASS requires verified cleanup of all owned resources; cleanup uncertainty fails the exercise.

Offline negative guards must cover wrong/external endpoints, occupied/nonempty destination, malformed manifest, checksum/version mismatch, missing Mongo/Redis/journal component, duplicate identity/invalid tenant relationship, path escape, unknown resource replacement and cleanup failure. A failed restore must not start runtime services or discard uncertainty.

Record command, exit status, source fingerprints, actual image IDs, fixture counts, exact preservation assertions, forbidden-effect assertions and cleanup. Independent review is required before runtime and for final acceptance. No full backend suite needs repeating unless product source changes.

## Separate installation gate

The acceptance harness is not the shipped installation experience. A distinct clean-install packet must exercise the actual documented entry point with disposable generated secrets and a matched release. `docker-compose.prod.yml` synthetic model validation passed separately but uses `--no-env-resolution`; real settings, image compatibility, monitoring exposure, fresh-host prerequisites and installed health remain unverified. Do not reuse an old README's example secrets or advertise a nonexistent installer.

## Still outside scope

Live backup consistency; recovery from partial cross-store backups; dispatch reactivation; key rotation; migrations/rollback across versions; safe retry; clearing holds; agent reconnection; real clean-host/multi-host operation; production deployment; human or customer validation. Each requires its own reviewed evidence/authority. This draft cannot close those tracker rows.
