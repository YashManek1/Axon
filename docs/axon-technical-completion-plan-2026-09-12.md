# Axon technical completion plan

Updated 12 September 2026. Owner: Yash. Execution coordinator: Sol. Architecture, security, integration and final acceptance: Astra.

This is the implementation and acceptance plan for Axon’s current product. It preserves the accepted Round 1 evidence and does not claim that Axon, a customer deployment, or the full execution-contract v2 is production ready. The immediate 48-hour outcome is a **supervised, non-production paid-pilot demo** on one synthetic Linux target with one read-only allow-listed action. It is a paid technical assessment/demonstration, not unattended customer infrastructure.

Source of truth: [context](AXON-CONTEXT.md), [live tracker](AXON-LIVE-TODO.md), [technical audit](axon-technical-audit-and-release-plan-2026-09-09.md), [execution contract v2](axon-execution-contract-v2.md), [deployment readiness](axon-deployment-readiness-2026-09-09.md), [current product plan](axon-current-product-plan-2026-09-09.md), and [Codex operating model](codex/OPERATING-MODEL.md). Product source and recorded execution evidence outrank this plan when they conflict.

## Baseline that must not be diluted

- Round 1 T01–T03 is accepted: human/agent identity, organization/resource boundaries, viewer restrictions, revocation, and connection/telemetry race guards. Backend evidence is 29 files / 232 tests, exit 0; see [live tracker](AXON-LIVE-TODO.md). Every later release reruns the affected authorization matrix.
- Accepted frontend evidence is 4 files / 14 tests, lint exit 0, and production build exit 0. The large initial bundle remains; these checks prove local code health, not the operator journey.
- Execution v2 is designed and unimplemented. Current source still selects an online organization agent, correlates results/logs by reusable job ID, checks `agentResponse.error` rather than the complete Rust result, and resolves caught worker failures. See `backend/workers/jobWorker.js`, `backend/services/jobExecutionRouter.js`, `backend/services/logStreamBroker.js`, and `agent/src/execution.rs`.
- There is no accepted production/customer deployment, clean Linux install, live TLS/WSS check, backup/restore drill, compatible release bundle, or fleet integration result.

## Product boundary

The first sellable product remains one customer-owned installation, one environment, three approved procedures, and up to five Linux agents. The 48-hour demo is narrower:

| Included | Excluded or visibly disabled |
|---|---|
| One isolated non-production organization and environment | Production targets and customer data |
| One stable agent identity and one selected target | Target selectors, pools, or silent fallback |
| One versioned, read-only local action with bounded inputs | Arbitrary shell, arbitrary HTTP, webhook, and sink execution |
| Manual preview, approval, run, live status, and receipt | Schedules, DAGs, unattended retry, HA, and SLA claims |
| Success, nonzero exit, timeout, offline target, duplicate submit | General cancellation/recovery or rollback of external effects |
| Founder present, kill switch ready, evidence saved | Public signup, campaign promises, or unsupervised access |

Payment buys a bounded assessment and supervised demonstration. A customer pilot starts only after G1 below; the demo cannot be relabeled as production proof.

## Decisions and Astra gates

Already settled in [execution contract v2](axon-execution-contract-v2.md): explicit stable target or no run; immutable action version and resolved target snapshot; distinct run, target-execution, attempt, and operation IDs; durable acceptance before reporting accepted; canonical signed envelope with deadline; nonzero exit is failure; bounded attempt-scoped logs; late messages cannot settle another attempt; unknown outcome is truthful; retries get a new attempt ID and preserve operation ID; no claim of exactly-once external effects; protocol negotiation; no automatic target backfill; initial action IDs map to local allow-listed scripts.

Sol must ask Astra before changing any of these shared contracts and before each gate below:

| Gate | Decision Astra records before dependent implementation |
|---|---|
| A1 storage | Single-record pending-dispatch state versus transactional run/event/outbox; indexes, retention, migration, crash recovery |
| A2 schema | Final canonical JSON/schema, enum vocabulary, signing vectors, protocol/capability range, old-agent behavior |
| A3 security | Key scope/rotation, secret references, approval binding, target/action authorization revalidation |
| A4 retry | Per-action idempotency/reconciliation class; queue throw/return mapping; duplicate, lost-ack, and unknown policy |
| A5 cancellation | Evidence required for stopped/cancelled; supported Linux process-group behavior and UI wording |
| A6 deployment | Supported Mongo topology, Redis durability, release compatibility, migration and rollback rules |
| A7 acceptance | Independent security review plus integrated G1/G2/G3 go/no-go; no routine implementation re-review |

Every decision record includes old shape, new shape, backfill/default, compatibility window, rollback behavior, and affected tests.

## Dependency graph and critical path

```text
Round 1 accepted T01–T03
        |
        v
A1–A4 contract gates -> WP1 identity/target -> WP2 result/retry -> WP3 logs/evidence
                                                   |                    |
                                                   +-------> WP4 UI ----+
                                                                    |
                                                48-hour supervised demo
                                                                    |
                    WP5 isolation/process safety + WP6 install/release
                                      \             /
                                       +---- G1 ----+
                                             |
                              WP7 schedules -> WP8 workflows -> G2/G3
```

The critical path is A1–A4 → T04 → T05–T08 → attempt receipt/observability → integrated failure demo → security/integration acceptance. UI polish, scheduling, deployment automation, and performance cannot shorten it. Release work may proceed in parallel after the schema freezes.

## Work packages and ownership

One writer owns each file. Maximum three concurrent workers: Sol coordinator/backend/Rust, Terra frontend, Luna read-only QA/release investigation. Astra temporarily replaces one slot for a decision or independent review. Shared schema changes stop dependent writers until Astra records the gate.

| WP / audit | Outcome and principal source ownership | Acceptance |
|---|---|---|
| WP0 / T01–T03 | Sol preserves accepted auth behavior in `backend/middlewares/`, `backend/routes/`, and auth/resource tests | Two-org/role matrix, token purpose, revocation, and socket restrictions stay green |
| WP1 / T04, T07 | Sol owns run/attempt/target models, job API, queue payload, router, dispatch schema, and Rust connection validation | With three agents only the chosen one receives work; offline never substitutes; late A cannot settle B; duplicate after restart does not re-execute |
| WP2 / T05–T08 | Sol owns worker classification, Rust execution, deadline/output limits, journal, retry/reconcile policy | Exit 1 fails everywhere; timeout agrees; noisy/child process stays bounded; lost ack becomes reconciled or unknown; unsafe retry never fires |
| WP3 / T13–T16 | Sol owns durable transitions, attempt log broker, cursor/sequence, evidence-write policy, and connection ownership | Concurrent evidence reconciles; live output arrives during execution; reconnect shows gap/expiry; stale disconnect cannot mark new session offline |
| WP4 / T17–T18 | Terra owns agreed API client, guided setup, target preview, approval, attempt detail/receipt, truthful empty/error/stale/unknown states | New operator completes the supported journey; API outage never renders green zero; keyboard/focus/labels/long logs pass |
| WP5 / T09–T12 | Sol owns server-side disabling/policy for HTTP/sinks, resource exclusion, schedule translation, and run-scoped coordinator | Forbidden endpoints fail via API; lease-loss cannot overlap effects; timezone/DST/reconciliation pass before schedules; concurrent workflows cannot share dependency state |
| WP6 / T19–T22 | Sol owns standalone manifest, readiness, release workflow/manifest; Luna verifies clean-host evidence | Private ports, correct env, outage readiness, digest-pinned matched bundle, clean Linux install, restore, upgrade and rollback drills |
| WP7 / T23 | Terra owns route/graph splitting, bundled fonts and telemetry choice after behavior gates | Measured representative load; private/offline network behavior documented; no journey regression |

T09, T11, and T12 are disabled at the server boundary in the demo. T10 is constrained to one active read-only operation. T19–T22 do not block a developer-hosted isolated demo, but all block installation in a customer environment.

## The 48-hour pilot-demo slice

This is a timebox, not an estimate for all T04–T23. If the vertical slice misses a hard gate, the outcome is a recorded engineering demonstration or paid assessment; it does not become a customer-connected pilot.

### Hour 0–4: freeze the slice

- Astra records A1–A4 for one read-only action and the minimal schema fields: protocol, org/environment, target, run/target-execution/attempt/operation, action/version, normalized-input checksum, timeout/start deadline, actor/approval, idempotency key, issue time, nonce, signature.
- Sol records current source behavior and contract tests before editing. Terra receives exact API/status fixtures. Luna prepares the evidence manifest and failure matrix.
- Acceptance: reviewed schema and test vectors exist; exclusive file ownership is recorded; arbitrary actions and schedules are server-disabled for this slice.

### Hour 4–16: backend/Rust vertical path

- Persist one exact target and immutable snapshot. Create run and attempt before dispatch. Resolve only that stable agent’s current authenticated socket.
- Agent validates its identity, protocol, deadline, action/version, bounded inputs, and signature; local catalog maps the action to a fixed read-only script.
- Result records exit, timeout/policy state, target snapshot, timestamps, truncation, and attempt IDs. Duplicate browser requests reuse the accepted run; duplicate dispatch consults the bounded journal.
- Acceptance: focused tests prove correct target, offline refusal, duplicate-submit identity, mismatch rejection, exit 1 failure, and timeout classification.

### Hour 16–28: honest operator journey

- Terra integrates choose target → immutable preview → explicit approval → launch → attempt status/log cursor → receipt. Unsupported controls are removed or disabled with precise copy.
- Sol streams bounded attempt-scoped output with ordered sequence/cursor and records an explicit gap/expiry. Unknown and stale states remain visible.
- Acceptance: a new-user walkthrough on fixtures and then the real slice; no job-scoped “live” claim, silent retry, substitute target, or optimistic success.

### Hour 28–38: failure injection and containment

- Run success, nonzero exit, target offline before dispatch, execution timeout, double submit, invalid signature/target mismatch, stream disconnect/reconnect, backend restart around accepted dispatch, and Redis/Mongo unavailable before durable acceptance.
- For every case reconcile run, target snapshot, attempt, logs, queue status, result, and audit/evidence. Assert the intended effect and absence of execution on every forbidden target.
- Acceptance: all hard cases have command, exit, observed state, and sanitized evidence; any unresolved side effect remains `needs_review`, never retried.

### Hour 38–48: independent review and demo rehearsal

- Astra reviews stabilized schema/security and accepts or rejects the integrated slice. Luna runs focused gates through `scripts/codex/axon-check.ps1` where suitable and verifies evidence fingerprints.
- Rehearse on one isolated Linux VM/container target with synthetic data, founder present, outbound connectivity scoped, one stop/revoke control, and no customer credentials.
- Acceptance: 20-minute demonstration shows exact preview, success, exit 1, timeout/offline behavior, duplicate protection, receipt, and revocation. Limitations and non-production banner remain visible. Save a one-page result with revision, environment, inputs, outputs, failures, and restrictions.

## QA model

| Layer | Required coverage | Release signal |
|---|---|---|
| Schema/unit | Canonical signing vectors JS/Rust, enums, state transitions, redaction, bounds, clock/deadline rules | Fast on every change; cross-language fixtures identical |
| Service/contract | Authorization + target lookup, durable acceptance, router correlation, queue classification, journal duplicates, log cursors | Real Mongo/Redis where behavior depends on them; mocks cannot prove queue semantics |
| Agent integration | Supported Linux execution, exit code, timeout, process tree, noisy output, restart/reconnect, revocation | Actual Rust binary and process behavior |
| Journey | Setup, exact preview, approval, success, failure, unknown, stale/error/empty, recovery choice | UI/API/agent path; accessible keyboard/focus/labels |
| Operations | TLS/WSS, readiness outage, clean install, backup/restore, upgrade/rollback, alert delivery | Isolated clean host and immutable release artifacts |

### Failure-injection matrix

| Fault | Expected state | Forbidden effect/evidence |
|---|---|---|
| Selected target offline | blocked then expired/failed per deadline | no alternate agent receives dispatch |
| Nonzero process exit | failed | no success-dependent step or green receipt |
| Ack/result lost | unknown or reconciled | no blind repeat |
| Duplicate submit/dispatch | same run / journaled operation | no second effect |
| Timeout or descendant process | timed-out; stopped only with proof | no “cancelled” claim while child runs |
| Log disconnect/gap/expiry | cursor catch-up or explicit gap/expired | no cross-attempt mixing |
| Redis/Mongo unavailable | reject before durable acceptance or follow recorded outage policy | no accepted-but-unrecorded run |
| Old socket disconnect | newer session remains authoritative | no false offline transition |
| Permission/revocation/target drift | denied; preview invalidated | no stale approval use |
| Restart/restore with in-progress attempt | reconcile to known or needs-review | no queue-only replay |

Backend tests use isolated MongoDB because they delete collections. Check Redis first to prevent endless retries. Record full output in `.codex/evidence/`; summaries include command, exit, counts, fingerprint, and limits. Appropriate gates are `scripts/codex/axon-check.ps1` focused mode during work, full backend `npm.cmd test -- --maxWorkers=1 --hookTimeout=10000`, frontend test/lint/build, Rust `cargo test --offline`, then targeted real-Redis/BullMQ and Linux agent scenarios. No green gate may contain an unhandled error. Reuse unchanged accepted evidence; rerun affected behavior after source, dependency, or runtime changes.

## Installation, security, observability, and recovery

- Install from a standalone reviewed manifest: one backend replica, private authenticated Mongo/Redis, same-origin HTTPS/WSS, fixed supported Linux/architecture, explicit sandbox and local action allow-list. No inbound agent port.
- Release one manifest containing commit, schema, backend/frontend image digests, agent checksum, protocol range, migration, smoke evidence, and rollback compatibility. Never deploy `latest`.
- Secrets are instance-specific, injected from protected storage, absent from repository, logs, previews, commands, and screenshots. Bootstrap credentials are short-lived/scoped; rotation and revocation are demonstrated.
- Separate liveness from bounded Mongo/Redis readiness. Externally monitor availability, queue age, failed/unknown attempts, stale agents, disk, backup freshness, certificate expiry, and evidence-write failure. Trigger a real test notification to the named responder.
- Before customer installation, restore Mongo plus required queue/config/key material to isolation. Reconcile attempts/effects after restore. Upgrade pauses dispatch, drains/reconciles, backs up, migrates, verifies agent compatibility, smokes, then resumes.
- Roll back images only across documented data/protocol compatibility. Application rollback never claims to reverse an external action. Provisional recovery targets remain four staffed hours and at most 24 hours of durable-history loss until measured and contracted.

## Full-product path and daily acceptance outcomes

| Day | Outcome, assuming prior gate passed |
|---|---|
| 1–2 | 48-hour isolated slice above; demo only |
| 3 | Astra accepts migration/storage/retry records for the full T04–T08 implementation |
| 4 | Multi-agent exact-target and offline/target-drift tests pass |
| 5 | Durable attempt journal, bounded logs, restart/late-result reconciliation pass |
| 6 | Linux process-group timeout/cancel and noisy-output limits pass; A5 recorded |
| 7 | T09 server policy and T10 resource-level exclusion/lease-loss tests pass for offered actions |
| 8 | Guided setup and all truthful UI states pass a new-operator accessibility walkthrough |
| 9 | Standalone manifest renders with only intended services/env/ports; liveness/readiness outage tests pass |
| 10 | Digest-pinned matched bundle installs on a clean host; TLS/WSS, enrollment, expiry, rotation and revocation pass |
| 11 | Backup restore and in-progress reconciliation pass within measured limits |
| 12 | Upgrade and compatible rollback drill pass; external alerts reach the named responder |
| 13 | Full regression, real Redis/BullMQ, actual Linux agent, failure matrix and independent security review complete |
| 14 | Astra G1 acceptance; founder may schedule one staffed customer pilot with explicit scope and rollback/exit plan |

Dates slip when evidence fails; gates do not shrink. After G1, add T12 scheduling only after timezone/DST/missed-run/overlap/reconciliation tests (G2). Add T11 multi-step procedures only with a durable run-scoped coordinator, approval/version/target binding, effect reconciliation and resource exclusion (G3). Address T23 from measurements after the core journey. Multi-target selectors, HA/failover, broad arbitrary execution, public signup, generalized workflows, 99.9% SLA, and automatic reversal remain deferred until separately designed and accepted.

## Go/no-go rules

- **Demo GO:** isolated non-production target; allow-listed read-only action; exact target and attempt identity; success/exit-1/offline/timeout/duplicate evidence; founder supervision; visible limitations; stop/revoke control.
- **Demo NO-GO:** any wrong-target dispatch, cross-attempt settlement, false success, unbounded output, hidden unknown outcome, authorization regression, or automatic retry without proven policy.
- **Paid customer pilot GO (G1):** T01–T09 resolved or server-disabled; relevant T10/T13–T22 checks pass; clean-host install, TLS/WSS, restore, upgrade/rollback, alerts, named operator, approved actions/targets, and Astra security/integration acceptance.
- **Unattended GO (G2):** scheduling, outage/reconnect, lease loss, backup recovery, load observation and support limits pass on the supported environment.
- **Production-changing workflow GO (G3):** run-scoped coordinator, effect-bound idempotence or reconciliation, resource exclusion, approval binding, and complete relevant failure matrix pass.

Yash owns scope, buyer promises, environment authorization, pricing, and the final decision to accept payment or connect a customer. Astra owns architecture/security/integration acceptance. Sol owns execution and evidence coordination. A deadline or revenue need never overrides a NO-GO condition.

## Principal unresolved risks

Storage/outbox topology and key-scope migration still need Astra decisions; Linux process-tree behavior is unproved; real queue retry/restart behavior is not covered by the accepted mock-heavy baseline; deployment artifacts are not a compatible immutable bundle; no clean install or restore exists; external-effect reconciliation is action-specific; schedule/workflow semantics remain unimplemented; demand, price, support burden, and customer permission are unvalidated. These risks determine scope and timing rather than being converted into optimistic percentages.
