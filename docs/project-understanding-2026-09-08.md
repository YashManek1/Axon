# Axon project understanding

Reviewed 2026-09-08. This is a source-based assessment of the local checkout, with limited runtime verification. It is not a production certification or an exhaustive security audit. Existing roadmap and audit documents contain claims that conflict with the current implementation; source takes precedence in this assessment.

**Overall assessment**

Axon is a B2B remote automation product: operators define and schedule work centrally, agents execute shell commands on customer infrastructure, and the control plane records what happened. The intended customer outcome is less manual remote access, repeatable operations, and better execution evidence. There is a substantial implementation here, but the safety and reliability guarantees advertised by the product exceed what the inspected paths enforce.

The original Notes.docx describes the evolution from DevifyX task runner to Axon, with shared organization-owned agents, scheduling, telemetry, dependencies, and data sinks. It mixes historical plans and assessments. The current competitive brief narrows toward MSPs; the landing page offers free self-hosting and enterprise support. Those are different stages of product thinking, not evidence of a validated customer segment or operating business.

**Architecture and responsibility map**

| Area | Current implementation | Principal sources |
|---|---|---|
| User experience | React 19, TypeScript, Vite, Tailwind, React Router; TanStack Query for API state, Zustand for session and UI state | frontend/src/App.tsx, services/api.ts, hooks/useDashboardData.ts |
| API and connections | Express 5 and Socket.IO in one Node process; user and agent authentication; REST routes | backend/server.js, routes/, middlewares/jwt.js |
| Persistent entities | MongoDB via Mongoose: users, organizations, jobs, agents, execution history, audit records | backend/models/ |
| Scheduling | BullMQ scheduled-jobs and immediate-jobs queues on Redis | backend/config/queue.js, controllers/jobC.js |
| Processing | Embedded workers, concurrency 5 per queue; HTTP calls execute in the backend, shell commands on agents | backend/workers/jobWorker.js |
| Remote execution | Rust/Tokio, manually handled Engine.IO/Socket.IO frames over WebSockets, reconnect and heartbeat loops | agent/src/connection.rs, execution.rs, telemetry.rs |
| Controls | HMAC dispatch verification, nonce/time checks, command patterns, optional namespace/Docker execution, resource permission middleware | utils/dispatchSigner.js, services/distributedLock.js, agent/src/sandbox.rs |
| Evidence and outputs | Audit records, hash verification, Redis log buffers, Mongo sinks, webhooks and email | services/auditService.js, logStreamBroker.js, notificationService.js, utils/sinkFormat.js |
| Operations | Docker Compose, Dockerfiles, GitHub CI/release/deploy definitions, Prometheus, Grafana, optional OpenTelemetry | .github/workflows/, observability/, instrumentation.js |

Connection direction: the agent opens an outbound connection to the control plane. Commands travel back over that established connection. There is no inbound agent listener. External HTTPS/WSS on port 443 requires the deployment's TLS termination; the Node server itself is HTTP. A truly disconnected environment requires a reachable control plane inside it—an outbound connection does not cross a physical air gap.

**Current user and execution flows**

1. Registration creates a new organization and its first admin user. Existing organization names are rejected. Login/session restoration use an HTTP-only cookie; API auth also accepts bearer tokens. No team invitation or organization switching flow was found in the inspected routes.
2. An admin creates an organization API key in Settings. Agent registration uses that key and returns agent credentials and a short-lived token. The Rust process separately needs server URL, agent ID, agent API key, dispatch signing key, and its local sandbox configuration.
3. Job creation validates a shell or HTTP payload, saves the definition, checks dependency references/cycles, and enqueues a repeat schedule. Manual runs enter a separate queue.
4. The worker attempts an audit insert, acquires a Redis execution lock/token, checks the execution window and dependency states, then executes the payload. HTTP requests originate from the backend. Shell jobs select the first online agent in the organization.
5. Dispatch includes an HMAC, nonce, timestamp, and command patterns. The agent verifies these, acknowledges receipt, runs the command, and returns a result. The backend records history/audit outcome and optionally writes a sink, fires a webhook, or sends email.
6. The dashboard polls jobs, agents, and audit endpoints and subscribes to socket log events. The Rust executor currently buffers stdout/stderr until completion; the backend then publishes lines. This is not continuous agent output streaming during execution.

**Implemented, partial, and planned**

| Capability | Assessment |
|---|---|
| CRUD, cron scheduling, manual triggers | Implemented; scheduling lifecycle still needs integration verification |
| Remote authenticated agent connection and signed dispatch | Implemented; identity binding, key scope, and connection lifecycle need hardening |
| Organization API key creation/revocation | Implemented, including a Settings UI |
| Organization isolation and roles | Partial; global admin access conflicts with self-service organization ownership |
| ACK and configured queue retries | Both exist, but worker failure handling undermines retry behavior |
| Dependency graphs | Dependency checks and cycle detection exist; full run-scoped DAG orchestration is planned |
| Audit chain | Hash creation/verification exist; concurrency, ordering, completeness, and result integrity remain gaps |
| Execution isolation | Opt-in; unset/unknown mode runs without isolation; namespace falls back without isolation on non-Linux platforms |
| Live logs | Socket distribution exists; the agent buffers output until execution ends |
| Data sinks, formats, email/webhooks | Implemented paths; sink/notification failures may be logged without failing the job |
| Runbooks | Explicit v2 placeholder in the UI; the workflow architecture document is a design, not shipped implementation |
| SSO/SAML, billing, enterprise retention | No implementation found in inspected application routes; advertised enterprise claims require separate verification |
| WORM export and external audit anchors | Roadmap |
| Go gateway | Roadmap; no measured reason established in this review to prioritize it |

**Priority findings confirmed in source**

1. **Organization admins can reach global data endpoints.** Signup assigns role admin in backend/controllers/userC.js:95. backend/routes/adminR.js protects global listing endpoints with authAdmin, which only checks that role. backend/controllers/adminC.js:170 and :183 query all jobs/users without an organization filter. The all-users response also lacks password exclusion, and the user schema does not exclude password hashes by default. Separate platform administration from organization administration, scope every tenant endpoint, and explicitly project safe fields. This is the first issue to resolve before shared hosting.

2. **Execution failures do not reliably trigger BullMQ retries.** backend/workers/jobWorker.js catches execution/ACK errors, records status failure, then returns an object at line 381. The installed BullMQ worker routes a resolved processor to completion and a thrown error to failure. Returning failure as data therefore bypasses ordinary retry handling for these paths. Preserve audit reporting while propagating the correct retriable error.

3. **Nonzero shell exit codes can be reported as success.** The worker checks agentResponse.error at line 275; the Rust CommandResult carries exitCode and stderr, not an error field. A command returning exit 1 can proceed to COMPLETED and success notifications. Define one shared outcome contract covering nonzero exit, timeout, cancellation, and dispatch rejection.

4. **Fencing does not provide the claimed end-to-end stale-write protection.** distributedLock.js creates a lock, then increments a token in a separate operation; the token key expires after 24 hours. The worker uses the token in a Mongo sink upsert key, but does not reject lower tokens before command effects, result acceptance, or history/state updates. The execution lock defaults to 60 seconds without renewal in the inspected path. A sink row per token is not downstream fencing or general command idempotency. Retries can still repeat arbitrary external effects.

5. **Dispatch lacks a distinct execution-attempt identity.** ACK/results are correlated by jobId. Signing receives the transient socket ID as agentId, and the agent verifies the signed payload without comparing its target ID with its persistent identity. Different attempts need distinct IDs for result matching, log grouping, and deduplication. A shared symmetric dispatch key also needs an explicit cross-tenant threat model.

6. **Target choice and permissions are incomplete.** The shell branch uses Agent.findOne({ orgId, status: 'online' }) at worker line 228. It does not use a user-selected target, allowedUsers, or allowedJobs. Job resource authorization is applied to manual run, while create/update/delete/toggle have broader authUser guards. Viewer/operator labels alone do not establish a consistent permission boundary. The operational meaning of 'run this on the correct customer machine' must be explicit.

7. **Audit creation can fail while execution continues.** createAuditRecord catches errors and returns null; jobProcessor does not require a non-null record. Concurrent inserts can read the same Redis head and fork the chain because read/append/head-update is not serialized. Verification and head recovery sort on createdAt, but AuditLog defines startedAt and no createdAt/timestamps option. Agent provisioning writes directly to AuditLog without required hashes and catches the resulting failure. These undermine the evidence promise.

8. **The chain protects selected initial fields, not the whole execution outcome.** The canonical hash includes time, job, organization, triggering identity, and command. Status, exit code, output, and completion time remain mutable and unhashed. Rewriting those fields is not detected by current verification. Complete-chain replacement or tail deletion also requires an independently trusted anchor to detect reliably. Append-only execution events with durable ordering would support a stronger claim.

9. **Timeouts and isolation differ across layers.** The router uses the configured timeout locally but omits timeoutMs from its emitted payload (jobExecutionRouter.js:148), leaving Rust on its 30-second default. HTTP execution and outbound webhooks omit explicit request timeouts. Namespace creation does not itself establish a read-only filesystem, and unknown sandbox modes silently choose none. Command patterns are supplied by the control plane; they are not an independently configured local policy. Shell wildcard matching is not structured command approval.

10. **Agent onboarding loses the returned secret.** AgentsPage.tsx:74 awaits registration but discards the response. The one-time API key and short token are not presented as a usable bootstrap configuration. Settings does reveal organization keys, so these two onboarding steps currently have different completeness. RUNBOOK.md also retains obsolete manual admin-promotion and apiKeyHash instructions.

11. **Several visible settings do not drive the corresponding execution behavior.** scheduleType, timezone, and priority are stored, while schedule queue options use only repeat.pattern. Execution windows use timezone, but cron scheduling does not pass it as a repeat option. Dependency readiness uses a global job state with a 24-hour expiry, not completion within the same workflow run. The worker emits SKIPPED for windows, but AuditLog's status enum lacks it.

12. **Observability can mislead.** Live log buffers are keyed by job rather than run, capped at 1,000 lines and retained for an hour. Overview computes 24-hour execution/failure counts from only the latest 20 audit entries. Agent output is accumulated in memory. These are practical limits for support and incident investigation, not just display details.

13. **Security metadata and marketing drift.** crypto.js uses AES-256-CBC while model/docs describe GCM; sink URIs are decrypted before entering Redis queues. Pricing advertises SOC2 documentation, SSO/SAML, and a 99.9% SLA without supporting implementation/operational evidence in this review. Book a call links to #. The installer URL is shown in copy but was not verified here. Treat these as unverified promises.

These are source-path findings, not claims that every failure has been reproduced under production conditions. Additional review should cover HTTP/sink destination restrictions, session and token revocation, socket authentication type separation, process-tree termination, resource limits, secrets in outputs, and permission revocation between enqueue and dispatch.

**Business interpretation and hypotheses**

The clearest positioning candidate is: 'Run approved operational tasks on customer infrastructure and retain evidence of each execution.' A plausible initial segment is a small Linux-focused managed service or software operations team that repeatedly operates software inside customer networks. Linux focus better matches the implemented sandbox path than an immediate promise to manage every kind of MSP endpoint. This is a hypothesis to validate with buyers, not a market conclusion.

The technician is the daily user; an operations leader or MSP owner would approve budget; a customer's infrastructure/security owner can veto installation. The displaced workflow may be scheduled scripts, manual remote access, and manually assembled execution evidence. Start with one repeatable, relatively safe workflow such as diagnostic collection or backup verification, then establish the required privileges and connectivity before promising support.

Time savings should be measured. As an illustration only, 100 tasks per month with 5–15 minutes of operator work removed at an assumed loaded cost of $40/hour imply roughly $333–$1,000 monthly labor capacity returned. This is neither proven savings nor a pricing recommendation; include onboarding/support overhead and measure actual workflow use.

The present pricing page and strategy brief disagree: free self-hosting plus contact-sales enterprise versus a suggested paid SaaS tier. No billing/metering implementation was found. Decide packaging after discovering whether buyers count customer environments, active machines, or operational workflows as value. Avoid giving a numeric price the authority of market evidence before willingness-to-pay interviews.

Two competitor premises in competitive-strategy.md are contradicted by primary documentation checked during this review. Rundeck Enterprise Runner uses outbound port 443 connections: https://docs.rundeck.com/docs/administration/runner/runner-installation/creating-runners.html . AWX includes activity streams and automation logs: https://docs.ansible.com/projects/awx/en/24.6.1/administration/security_best_practices.html . These do not establish identical products, but they invalidate blanket claims that incumbents lack outbound execution or auditing. Competitive value must be demonstrated in the actual customer workflow, setup burden, usability, support, and evidence quality.

No customer interviews, paid usage, retention data, or compliance certification were established by this review. Compliance assertions in historical docs need separate authoritative assessment; a hash chain alone does not establish compliance. Broad fleet management, fully disconnected SaaS execution, and regulated production guarantees are premature positioning for this implementation.

**Recommended sequence**

First, resolve tenant administration and sensitive response exposure. Then establish a coherent execution contract: run/attempt IDs, target selection, permission checks, truthful outcomes, timeout propagation, and explicit retry/idempotency semantics. Fixing retries should not silently increase duplicate side effects.

Next, make audit insertion and ordering dependable, preserve result evidence as append-only events, and make failed evidence capture an explicit policy decision. Complete agent bootstrap, then prove one supported operator journey from installation through a scheduled run and evidence retrieval. Align landing copy and runbooks with those verified behaviors.

Validate that journey with a few design partners and measure time to first successful run, recurring usage, operator time saved, and willingness to pay. Build larger runbooks, integrations, enterprise features, and a separate gateway when customer evidence or measured load justifies them. No load test in this review supports the historical '~500 agents' rewrite threshold. The current socket map is process-local, so horizontal control-plane scaling first needs connection ownership/routing design regardless of language.

**Verification performed**

| Check | Result |
|---|---|
| Frontend production build | Passed TypeScript build and Vite bundling; emitted a large-chunk warning |
| Frontend existing tests | 7 passed, 2 failed; tests query title attributes for Run now/Delete while the UI uses aria-labels |
| Rust cargo test --offline on Windows | 18 passed; Linux namespace/seccomp behavior not exercised |
| Backend existing suite | Attempted with inherited MONGO_URI cleared to avoid using an external database; repeated Redis localhost:6379 connection refusals, interrupted without a trustworthy completion result |
| Backend test design inspected | Several e2e-labelled tests mock Redis, queues, and agent sockets; these do not prove a real Node-to-Rust lifecycle |
| Deployment | Definitions inspected; no deployment, registry push, cloud state verification, or production load test performed |

Application source was not changed. This brief and the backend test log are review artifacts; frontend/Rust checks also generated ordinary build outputs. Future work should verify the relevant source paths again rather than treating this dated assessment as permanent truth.
