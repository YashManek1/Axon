# Axon execution contract v2 — next implementation milestone

Status: MANUAL SINGLE-TARGET FOUNDATION IMPLEMENTED LOCALLY; INDEPENDENTLY ACCEPTED WITH EXPLICIT GAPS. Updated 15 September 2026. This document remains the contract and release-gate record; it does not claim unattended production readiness.

## Implementation checkpoint — 15 September 2026

The bounded manual shell path is now implemented across API, queue worker, Socket.IO routing, Rust agent and customer UI. A launch writes a durable run before queueing, binds one stable agent, uses distinct run/target-execution/attempt/operation IDs, signs the fixed v2 envelope, checks current user/job/agent authority again before emission, requires an exact approved command string, and permits no automatic retry. Targetless legacy shell work and unsupported shell scheduling/dependencies fail closed.

Results retain correlated exit code/output and distinguish completed, rejected, timed out, cancelled and unknown outcomes. Lost acknowledgement/result and post-dispatch persistence failures require review and never become a proven pre-execution rejection. Audit history exposes the v2 identities, uses versioned tamper evidence, and stores live output per run rather than per reusable job.

Verification on the stabilized source passed:

- backend: 31 test files, 274 tests, isolated MongoMemoryServer and local Redis DB 15;
- frontend: 4 test files, 17 tests, ESLint and production build;
- Rust agent: 21 tests and `cargo clippy -- -D warnings`;
- independent Astra security review: accepted for this bounded foundation.

The acceptance excludes durable restart recovery, an agent execution journal, reconciliation, safe retries, full Linux descendant/process-group termination, resource-level exclusion, guaranteed audit/output durability during infrastructure outages, real fleet installation and paid-pilot readiness. A terminal database write that persistently fails can leave the JobRun nonterminal while audit/history records persistence uncertainty; the recovery worker remains required.

## The simple explanation

Imagine your company has three servers: `demo-web`, `production-web`, and `database`. You want to check a service on `demo-web`. “Run this in my company” is insufficient information. Axon must record **which machine you chose**, verify that you may use it, and send the operation only to that machine.

Today the shell worker searches for an online agent inside the organization. It does not persist a chosen target on the job. Whichever matching agent the database returns may receive the command. That is useful for some interchangeable worker-pool designs, but it is wrong for operations where the machine matters. We must not present that behavior as exact-server targeting.

Exact targeting means: **if you choose demo-web, the command goes to demo-web or it does not run.** If demo-web is offline, Axon shows a blocked/waiting state and eventually expires the request under the chosen policy. It must not silently send the command to production-web because that server happens to be online.

This is separate from permissions. Permissions answer “are you allowed to do this?” Targeting answers “where will it happen?” We are fixing the first question in round 1; the second is a next-round implementation.

## The identities we need

| Identity | Plain meaning | Example / lifetime |
|---|---|---|
| Organization | The customer who owns the operation and machines | Acme; enforced at every boundary |
| Environment | A deliberate group such as Demo or Production | Stored server membership, not a color or name heuristic |
| Agent ID | The stable registered identity of a particular execution agent | Same across network reconnects; replacement hardware requires controlled enrollment |
| Socket/session ID | The current network connection to that agent | Changes on reconnect; it is not the permanent machine identity |
| Job/action definition ID | The saved instruction or approved operation | “Collect service health”; reused on many days |
| Action version | The exact approved implementation and input rules | Version 3; editing creates a new version |
| Run ID | One accepted request to perform that saved operation | Monday's click and Tuesday's click are different runs |
| Target execution ID | One action/step execution on one target within a run | Useful when a procedure uses several machines |
| Attempt ID | One concrete execution attempt | A permitted retry gets a new attempt ID |
| Operation ID | Stable identity used to recognize the same logical effect across retries | Same for retries of that target execution; a new deliberate run gets a new operation ID |

A fresh random nonce on a signed message prevents certain message replays. It is not a durable record that the underlying business operation already happened. Likewise, the job-definition ID cannot distinguish two separate runs of the same job.

## Example: why run and attempt IDs matter

You run “Create demo account” at 10:00. The server creates the account, but the connection drops before its reply reaches Axon. A timeout does not prove the account was never created.

If Axon blindly retries, it might create another account. If an old reply arrives while a later run is waiting, matching only the job ID might attach that reply to the wrong run. The corrected system keeps each run/attempt distinct and checks whether the logical account-creation operation already happened.

For an action whose result can be checked, Axon can reconcile: query for the account using the operation ID or a known unique identifier, then record the evidence. For a safely repeatable action, a retry may be appropriate. If neither is possible, Axon says **Needs review — outcome unknown** and does not automatically repeat it.

This is why we will not promise “every external action happens exactly once.” A local journal reduces duplicates, but it cannot atomically commit arbitrary effects in an unrelated database, API and filesystem. The action's own design and the external system's guarantees matter.

## Launch and target selection

1. The operator chooses an allowed action version, inputs and one explicit target for the first release.
2. The API loads the target using both stable agent ID and organization ID. It checks environment membership, decommission state, action capability, protocol version and the user's authority. User-supplied organization identity never overrides the authenticated one.
3. Preview returns the exact action version, target identity, material inputs, expected effects and validation freshness. The UI displays meaningful machine/environment names plus stable identity in detail.
4. Launch references that preview or submits equivalent fields with server-side revalidation. A changed target, action version or material input invalidates any old approval/preview binding.
5. Axon durably records the accepted run, resolved target and pending dispatch intent before reporting it accepted. Browser double-clicks share a scoped request key and resolve to the same accepted run.
6. The dispatcher resolves the current authenticated socket for that stable agent. If that session belongs to another identity, is revoked or is unavailable, it refuses dispatch. Authorization is checked again where freshness matters.
7. The agent validates the signed target/action contract against its own identity and locally allowed action policy. A valid signature does not mean every action is locally permitted.

Explicit multi-target operations later freeze the resolved set at launch. A label selector such as `role=web` must be previewed as a list of actual identities. A new server joining that label after launch is not silently added to an already approved operation. Removing/changing a required target requires a new authorized decision.

## Proposed wire envelope

These are conceptual fields to finalize against the shared schema; no endpoint currently accepts this complete v2 envelope.

```json
{
  "protocolVersion": 2,
  "orgId": "customer-id",
  "environmentId": "demo-environment-id",
  "targetAgentId": "stable-agent-id",
  "runId": "run-id",
  "targetExecutionId": "execution-id",
  "attemptId": "attempt-id",
  "operationId": "stable-logical-operation-id",
  "actionId": "collect-service-health",
  "actionVersion": "3",
  "inputs": { "service": "demo-api" },
  "timeoutMs": 30000,
  "startBefore": "UTC-deadline",
  "nonce": "message-nonce",
  "issuedAt": "UTC-time",
  "signature": "signature-of-canonical-envelope"
}
```

Use bounded, schema-validated inputs. Secrets should be scoped references resolved at the permitted boundary, not plain values copied into previews/logs. Define one canonical signing format and test shared backend/Rust vectors. Include identity, action/version, inputs, deadlines and any execution-affecting policy in the signed data. The signature field itself is excluded from its canonical input. Do not rely on JavaScript/Rust object serialization order accidentally matching.

Retain the existing signing transport only with a defined key scope and rotation policy. A fleet-wide secret shared with every machine must not let one compromised machine impersonate dispatch authority for all others. Per-agent keys or an asymmetric verification design require their own migration decision and tests.

For the first action product, map an action ID to an approved local script and explicit argument schema. Do not let an operator replace it with arbitrary shell text. Existing arbitrary-shell jobs need a deliberate migration or remain outside the customer-facing approved-action package.

## Acknowledgment, result and logs

An acknowledgment means the agent accepted the identified dispatch according to its protocol; it does **not** mean the operation succeeded. Define whether durable journal acceptance is required before acknowledgment. If it is, write that acceptance before replying.

Every acknowledgment, result and log chunk identifies the run, target execution, attempt and stable target. The router rejects mismatches. A late result is recorded against its original attempt and considered by the reconciler; it cannot silently complete a different current attempt.

The result schema distinguishes at least: process completed with exit code; start/policy rejection; timeout; cancellation state; and an unresolved outcome. A nonzero exit code is a failed command. An exit code of zero is only process-level success: a customer procedure may also require an application check, such as finding the expected exported file or deployed version.

Logs include stream, monotonically scoped sequence, timestamp and truncation/gap information. They are bounded in memory and storage, scoped by attempt, and can resume from a cursor after reconnect. “No more logs arrived” is not a completion event. A completed run must still show that its logs expired if retention has elapsed.

## Timeouts and cancellation

Separate waiting-for-a-server deadline, dispatch acknowledgment timeout, command execution timeout and an overall procedure deadline. The current backend timeout option is not propagated in the dispatch envelope, while Rust has its own default. The v2 contract must make both sides agree.

Before starting, the agent rejects an expired start deadline. After starting, measure execution duration with a monotonic clock; wall-clock timestamps support audit/cross-machine comparisons with a documented clock-skew tolerance. Server and agent timeout races must not produce contradictory success states.

A timeout tells us a deadline was exceeded. “Cancel requested” tells us someone asked the process to stop. “Cancelled” requires the agreed evidence that supported local work was stopped. Test descendants/process groups on supported Linux. Killing a shell process is not proof that every child or external API operation stopped, and cancellation never promises to undo earlier effects.

## Retry and recovery rules

| Situation | Required default behavior |
|---|---|
| Exact target unavailable before dispatch | Wait visibly only within the accepted deadline, or fail before execution; no substitute server |
| Proven rejection before execution, such as missing action | Fail with actionable explanation; automatic repeated retries do not fix configuration |
| Lost acknowledgment after dispatch | Treat as potentially executed unless protocol/journal evidence proves otherwise |
| Result lost after side effect | Reconcile or request review; do not blindly repeat |
| Known failure of a declared safely repeatable action | Permit bounded retry with a new attempt ID and the same logical operation ID |
| Known failure of a non-repeatable action | Require procedure-specific recovery policy or review |
| Duplicate message for a known operation | Use journal/external idempotency evidence; do not start a second effect merely because the message has a new nonce |
| Database unavailable before durable acceptance | Reject new acceptance rather than promising work that was never recorded |
| Coordinator restarts with an in-progress run | Reconcile durable state and actual attempt evidence before deciding whether to dispatch |
| Restore from backup | Reconcile effects since the backup; queue restoration alone must not replay uncertain work |

Classify an outcome before telling BullMQ to retry. A caught error followed by a normal return is not a failed queue attempt; conversely, throwing on every lost reply can cause unsafe retries. The queue mechanics and product policy must agree.

Use a durable pending-dispatch intent. For a single-action run, this could live atomically inside the run record with a bounded reconciler; if run/event/outbox records need a multi-document transaction, use a supported MongoDB topology. Finalize the storage design before implementing it. Redis queue persistence alone is not the durable business record.

Resource locks protect the actual thing changed, such as a service on a server, rather than only a job-definition ID. Lock expiry, lease renewal, stale holders and external fencing require explicit behavior. A number stored in a log is not enforcement at the resource. Initially constrain concurrency to the tested supported scope and avoid advertising generalized mutual exclusion until verified.

## Compatibility and rollout

- Add protocol/capability negotiation before dispatching v2 work. Reject unsupported agents with an upgrade instruction instead of sending a partially understood message.
- Existing jobs with no target are **unassigned**. Do not backfill “the first online server.” Ask an authorized owner to bind and verify a target before enabling them in the new operational package.
- Pause/reconcile affected queued work during migration. Never reinterpret an old queue item as a newly targeted operation without recorded authorization.
- Coordinate backend, UI and Rust changes against the same schema and compatibility tests. Installation artifacts need a matched release manifest.
- Rollback is permitted only when data and protocol remain compatible. Reverting application code does not reverse effects already made on a server.

## Acceptance tests for the implementation milestone

1. Three online servers; an operation addressed to one is received only by that one.
2. Chosen server offline; a different online server receives nothing.
3. Cross-organization target, revoked agent or unauthorized action is rejected through direct API and socket paths.
4. Agent reconnect changes socket ID; stable targeting remains correct, and an old socket cannot take ownership.
5. Two launches of the same job have distinct run IDs; browser resubmission of one accepted request does not create another run.
6. A delayed result from attempt A cannot satisfy attempt B or another run.
7. Real Rust `exit 1` becomes failure in queue, run, history, notifications and dependent-step decisions.
8. Backend/Rust agree on timeout and reject a modified signed target/deadline/input.
9. Noisy and child-spawning Linux test commands obey declared resource/output/cancellation limits.
10. Lost acknowledgment, duplicate dispatch, agent restart, control-plane restart and persistence interruption follow the recovery table.
11. A postcondition failure is visible even when the script exits zero.
12. Unassigned legacy jobs cannot accidentally execute on an arbitrary machine after upgrade.

Run these against actual Redis, MongoDB and the supported Linux agent as well as unit/contract tests. Save version, topology, command results and remaining limitations. The [live TODO](AXON-LIVE-TODO.md) will mark this implementation complete only after that evidence exists.
