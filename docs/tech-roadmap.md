# Axon — Tech-Audit Remediation Roadmap

> Source: `docs/tech-audit.md` (audit date 2026-06-03)
> Roadmap date: 2026-06-22
> Ordering: **risk-weighted** — severity × effort. Contained, high-value fixes ship first; large architectural changes are fully detailed but sequenced later.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Critical | Security vulnerability or correctness lie in a public claim |
| 🟠 High | Production reliability or deployment blocker |
| 🟡 Medium | Observable gap; no immediate data-loss risk |
| 🟢 Low | Improvement / future-proofing |
| S / M / L / XL | Effort: hours / days / 1–2 weeks / sprint+ |
| ✅ Done | Already resolved — no work needed |

---

## Priority Table

| # | Item | Pain point | Severity | Effort | Tier |
|---|------|-----------|----------|--------|------|
| 1 | Audit hash-chaining + verify-chain + close `findByIdAndUpdate` bypass | PP3 | 🔴 Critical | M | 1 |
| 2 | Fencing tokens → at-least-once + idempotent sink | PP1 | 🔴 Critical | M | 1 |
| 3 | HMAC-signed dispatch + agent verification + optional allowlist | PP4 | 🔴 Critical | M–L | 1 |
| 4 | Dispatch ACK + requeue unacknowledged | PP2 | 🟠 High | M | 1 |
| 5 | CI registry push + deploy workflow; Dockerfile Node 20→22 | Cross-cutting | 🟠 High | M | 2 |
| 6 | Dev Mongo auth + prod secrets via Key Vault | Cross-cutting | 🟡 Medium-High | S–M | 2 |
| 7 | Mongo service container in CI (remove mongodb-memory-server flakiness) | Cross-cutting | 🟡 Medium | S | 2 |
| 8 | OpenTelemetry traces + Prometheus `/metrics` | Cross-cutting | 🟡 Medium | M | 2 |
| 9 | Swagger accuracy | Cross-cutting | ✅ Done | — | — |
| 10 | Short-lived signed agent tokens | PP2 | 🟠 High | L | 3 |
| 11 | Per-job / per-agent RBAC | PP4 | 🟡 Medium | L | 3 |
| 12 | Sandboxed agent execution | PP4 | 🟡 Medium | L | 3 |
| 13 | WORM export + external chain anchoring | PP3 | 🟡 Medium | L | 3 |
| 14 | Go telemetry / log-stream gateway extraction | PP2 | 🟢 Low (scale-gated) | XL | 3 |

---

## Suggested Sequencing

```
Tier 1 (1 → 2 → 3 → 4)  →  Tier 2 (5 → 6 → 7 → 8)  →  Tier 3 (10 → 11 → 12 → 13 → 14)
```

Tier 3 items have no hard deadline; schedule based on customer/scale demand.

---

## Tier 1 — Contained, High-Value Security & Correctness

### Item 1 — Audit Hash-Chaining + `verify-chain` Endpoint

**Severity:** 🔴 Critical — SOC2/HIPAA positioning claim

#### Problem

`backend/models/auditLog.js` has a `pre("save")` hook that guards `[startedAt, jobId, orgId, triggeredBy]` against mutation. However `backend/services/auditService.updateAuditRecord` (line ~51) uses `AuditLog.findByIdAndUpdate`, which **bypasses Mongoose middleware entirely**. Immutability on the write-completion path is enforced only by a JS allowlist in `auditService.js:6–13` — no DB-level protection.

Additionally there is no cryptographic linkage between records. A rogue DBA can `mongosh` any record without leaving a trace. A SOC2 auditor asking "prove this log was not modified after the fact" cannot be satisfied.

#### Approach

1. **Add hash fields** to `backend/models/auditLog.js`:
   ```js
   prevHash:   { type: String, required: true },
   recordHash: { type: String, required: true },
   ```
2. **On insert** (`auditService.createAuditRecord`): read the current chain head from Redis (`audit:chainhead:<orgId>`), compute `recordHash = sha256(prevHash + JSON.stringify(canonicalFields))` where `canonicalFields = { startedAt, jobId, orgId, triggeredBy, status }`, store both fields, and update the Redis key to the new hash. Use `NX` + fallback `findOne({ orgId }).sort({ createdAt: -1 })` on cold start.
3. **On status updates** (`auditService.updateAuditRecord`): replace `findByIdAndUpdate` with a `.save()`-based flow — load doc, validate allowlist in JS, set mutable fields, call `.save()`. The `pre("save")` hook then enforces immutability on the protected fields at the DB driver level.
4. **Add `GET /audit/verify-chain`** in `backend/routes/auditR.js` + `backend/controllers/auditC.js`: stream org's records in `createdAt` order, re-derive each `recordHash`, compare against the stored value, and return `{ valid: bool, brokenAt: ObjectId | null, checkedCount: number }`.

**Files touched:** `models/auditLog.js`, `services/auditService.js`, `routes/auditR.js`, `controllers/auditC.js`

**Effort:** M (2–3 days)

**Done-when:**
- Tampering any stored `recordHash` in Mongo causes `verify-chain` to return `{ valid: false, brokenAt: "..." }`.
- `findByIdAndUpdate` no longer appears in `auditService.js`.
- Tests in `backend/tests/` cover chain continuity and break detection.

**Dependencies:** None.

---

### Item 2 — Fencing Tokens → At-Least-Once + Idempotent Sink

**Severity:** 🔴 Critical — "exactly-once" is the headline claim; current code does not deliver it

#### Problem

`backend/services/distributedLock.js` acquires with `SET job:lock:<jobId> "processing" NX EX 30` and releases with unconditional `DEL` — any caller can delete any lock. `dagStateManager.acquireExecutionSlot` writes the **same key** with value=workerId and a 60 s TTL (two writers, one key). If a worker pauses for >TTL (GC, I/O) a second worker acquires the lock concurrently; BullMQ stall-detection can also redeliver a job. The Mongo sink does `insertOne` on every run (`jobWorker.js:257`) — a redelivered job inserts a duplicate record.

#### Approach

1. **Fencing token:** after acquiring the lock in `distributedLock.js`, run `INCR job:fence:<jobId>` (24 h TTL) and return `{ acquired: true, fencingToken }`.
2. **Ownership-checked release:** replace the bare `DEL` with a Lua compare-and-delete script (verifies value === workerId before deleting). Reconcile the dual-writer collision: have `dagStateManager.acquireExecutionSlot` delegate to `distributedLock` so there is one writer per key.
3. **Thread token through worker:** `jobWorker.js` receives `fencingToken` from the lock and passes it to the sink writer.
4. **Idempotent sink:** change `insertOne` → `updateOne({ jobId, fencingToken }, { $setOnInsert: payload }, { upsert: true })`. A redelivered job with the same token is a no-op.
5. **BullMQ stall config:** at worker construction set `stalledInterval: 30_000` and `maxStalledCount: 1`.
6. **Honest claim:** update `README.md` and landing copy to "at-least-once delivery with idempotent execution" — remove "exactly-once."

**Files touched:** `services/distributedLock.js`, `services/dagStateManager.js`, `workers/jobWorker.js`, `README.md`

**Effort:** M (2–3 days)

**Done-when:**
- Replaying a job with an identical `fencingToken` produces one Mongo sink document, not two.
- Lock release with wrong workerId is a no-op (Lua script returns 0).
- Tests cover concurrent acquire contention and stale-token sink behaviour.

**Dependencies:** None.

---

### Item 3 — HMAC-Signed Dispatch + Agent Verification + Optional Allowlist

**Severity:** 🔴 Critical — "jobs replace shell" claim; currently the agent executes any string received over the WebSocket

#### Problem

`backend/services/jobExecutionRouter.js` emits `{ jobId, command }` to the agent socket without signing. `agent/src/execution.rs` calls `Command::new("sh").arg("-c").arg(command)` (Linux) or `cmd /C` (Windows) — no integrity check, no allowlist, no sandbox. A compromised control plane or WebSocket MITM can dispatch arbitrary system commands. `backend/models/agent.js` has no `allowedCommands` field.

#### Approach

**Backend (Node.js):**

1. Add `DISPATCH_SIGNING_KEY` (min 32 hex chars) to `backend/config/environment.js` Zod schema.
2. In `jobExecutionRouter.js`, before emitting `execute_command`, sign the payload:
   ```js
   const nonce = crypto.randomUUID();
   const ts    = Date.now();
   const msg   = JSON.stringify({ jobId, command, agentId, nonce, ts });
   const sig   = crypto.createHmac("sha256", DISPATCH_SIGNING_KEY).update(msg).digest("hex");
   socket.emit("execute_command", { jobId, command, agentId, nonce, ts, sig });
   ```
3. Add optional `allowedCommands: [String]` to `backend/models/agent.js`.
4. Include `allowedCommands` in the dispatch payload so the agent can check locally.

**Rust agent:**

1. Add `hmac` + `sha2` crates to `agent/Cargo.toml`. Read `DISPATCH_SIGNING_KEY` from env.
2. In `agent/src/connection.rs`, before passing command to `execution.rs`, verify the HMAC. Reject with a structured error if invalid.
3. If `allowedCommands` is non-empty, check the command against each pattern (exact or glob). Reject if no pattern matches.

**Files touched:** `config/environment.js`, `services/jobExecutionRouter.js`, `models/agent.js`, `controllers/agentProvisioningC.js`, `agent/src/connection.rs`, `agent/src/execution.rs`, `agent/Cargo.toml`, `.env.example`

**Effort:** M–L (3–5 days — spans Node + Rust)

**Done-when:**
- Tampered `sig` in dispatch payload → agent rejects with structured error, no execution.
- Command not in allowlist (when configured) → rejected before `execution.rs` is called.
- Tests: Node unit (HMAC sign/verify), Rust unit for sig verification + allowlist.

**Dependencies:** None (can run in parallel with Item 4).

---

### Item 4 — Dispatch Acknowledgement + Requeue Unacknowledged

**Severity:** 🟠 High — silent job loss on post-dispatch agent crash

#### Problem

`jobExecutionRouter.js` emits `execute_command` and resolves only when `command_result` arrives. If the agent receives the command but crashes before producing a result (OOM, process kill), the socket disconnects, the Promise rejects, and BullMQ marks the job failed. There is no way to distinguish "never received by agent" from "received and crashed mid-execution." The current `command_result` is the only response; there is no intermediate acknowledgement.

#### Approach

1. **Rust agent (`connection.rs`):** immediately after parsing `execute_command`, emit `job_ack { jobId }` before spawning the execution task.
2. **Backend dispatch (`jobExecutionRouter.js`):** await `job_ack` first (5 s timeout). On receipt, mark the audit record `DISPATCHED_ACKED`. Then await `command_result` with the full execution timeout.
3. **Audit model:** add `DISPATCHED_ACKED` to the status enum in `models/auditLog.js` + `auditService`.
4. **Requeue on unacked:** if `job_ack` is not received within 5 s, throw a retriable BullMQ error so the job is requeued (respects `retryLimit`). Log the unacked dispatch.
5. **Separate failure modes in logs:** "never acknowledged" vs "acknowledged but execution failed" are distinct states for operators.

**Files touched:** `agent/src/connection.rs`, `services/jobExecutionRouter.js`, `models/auditLog.js`, `services/auditService.js`, `workers/jobWorker.js`

**Effort:** M (2–3 days)

**Done-when:**
- Simulating agent crash after socket receives but before `job_ack` causes BullMQ to requeue.
- Audit record transitions `DISPATCHED_ACKED` → `COMPLETED` / `FAILED` visibly.
- Tests cover the 5 s unacked timeout path.

**Dependencies:** None.

---

## Tier 2 — Infra / DevOps Hardening

### Item 5 — CI Registry Push + Deploy Workflow; Dockerfile Node 20→22

**Severity:** 🟠 High — images never leave the CI runner; no automated deploy path

#### Problem

`.github/workflows/ci.yml` build job runs `docker build -t axon-backend:${sha}` and re-tags to `:latest` on `main`. No `docker/login-action`, no `docker push`, no registry reference. Images are discarded when the runner exits. There is no `deploy.yml`. Additionally `backend/Dockerfile` uses `node:20-alpine` while CI tests on Node 22.

#### Approach

1. **`backend/Dockerfile`:** bump both `builder` and `runtime` stages to `node:22-alpine`.
2. **`ci.yml` build job:** add `docker/login-action` + `docker push axon-backend:${sha}` and `:latest` after successful build. Credentials via `REGISTRY_USER` / `REGISTRY_TOKEN` repo secrets.
3. **New `.github/workflows/deploy.yml`:** triggers on `main` push or `workflow_dispatch`. Pulls `:latest`; runs `az containerapp update --image <registry>/axon-backend:latest`. Requires `AZURE_CREDENTIALS` secret.
4. **`.env.example`:** add `REGISTRY_USER`, `REGISTRY_TOKEN`, `AZURE_CREDENTIALS` placeholders.

**Files touched:** `backend/Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` (new)

**Effort:** M (1–2 days)

**Done-when:** Merge to `main` produces a pushed image in the registry and a deployed Container App revision. CI and prod both run Node 22.

**Dependencies:** Registry and Azure credentials set as repo secrets.

---

### Item 6 — Dev Mongo Auth + Prod Secrets via Key Vault

**Severity:** 🟡 Medium-High

#### Problem

`docker-compose.yml` runs `mongo:7` without credentials (intentional dev shortcut, documented in a comment). `docker-compose.prod.yml` reads secrets from `backend/.env.production` — plaintext on disk. No Key Vault integration.

#### Approach

**Dev:**
- Add `MONGO_INITDB_ROOT_USERNAME: axon_dev` / `MONGO_INITDB_ROOT_PASSWORD: axon_dev_secret` to `docker-compose.yml` mongo service.
- Update `backend/.env.development` `MONGO_URI` to `mongodb://axon_dev:axon_dev_secret@localhost:27017/axon?authSource=admin`.

**Prod:**
- Store `MONGO_URI`, `JWT_SECRET`, `ENCRYPTION_KEY`, `REDIS_URI` as Azure Key Vault secrets.
- Reference by name in the Container App environment (`secretRef`). Azure injects them into `process.env` — `backend/config/environment.js` requires no code change.
- Document in `docs/deploy-azure.md`.

**Files touched:** `docker-compose.yml`, `backend/.env.example`, `backend/.env.development`, `docs/deploy-azure.md`

**Effort:** S–M (half-day dev, 1 day Key Vault wiring + docs)

**Done-when:** `docker-compose up` connects to Mongo only with valid credentials. Prod container starts without any plaintext secret on disk.

**Dependencies:** Azure Key Vault and Container App provisioned.

---

### Item 7 — Mongo Service Container in CI

**Severity:** 🟡 Medium — `mongodb-memory-server` downloads a binary at runtime

#### Problem

`backend/tests/setup.js` calls `MongoMemoryServer.create()` in `beforeAll` — downloads a MongoDB binary each CI run. Slow, firewall-sensitive, version-skew-prone. Redis already uses a service container (ci.yml lines ~14–23) which is reliable.

#### Approach

1. Add `mongo:7` service to the `backend-test` job (same pattern as Redis):
   ```yaml
   mongo:
     image: mongo:7
     ports:
       - 27017:27017
   ```
2. Add `MONGO_URI: mongodb://localhost:27017/axon_test` to the job's `env` block.
3. Update `backend/tests/setup.js`: if `process.env.MONGO_URI` is set, skip `MongoMemoryServer.create()` and use it directly; keep memory-server as the local-dev fallback.

**Files touched:** `.github/workflows/ci.yml`, `backend/tests/setup.js`

**Effort:** S (half-day)

**Done-when:** CI `backend-test` no longer downloads a Mongo binary. Local `vitest` still works without `MONGO_URI` set.

**Dependencies:** None.

---

### Item 8 — OpenTelemetry Traces + Prometheus `/metrics`

**Severity:** 🟡 Medium — no distributed traces, no metrics beyond pino logs + `requestId`

#### Problem

No `@opentelemetry/*` dependency exists. No `prom-client`, no `/metrics` endpoint. The async dispatch → agent → result path in `jobExecutionRouter.js` has no trace span. `requestId` from `backend/middleware/requestId.js` is the only correlation mechanism.

#### Approach

1. **Install:** `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `prom-client`.
2. **`backend/instrumentation.js`** (new, loaded before `server.js` via `--import`): initialise OTEL SDK with HTTP, MongoDB, and ioredis auto-instrumentations.
3. **Custom span** in `jobExecutionRouter.js`: `job.dispatch` span with `{ jobId, agentId, orgId }` attributes; child `job.execute` span covering the wait for `command_result`.
4. **`GET /metrics`** in `routes/adminR.js` (admin-auth or IP-restricted): `prom-client` default registry.
5. **Key metrics:** `axon_job_dispatch_duration_seconds` (histogram), `axon_job_status_total` (counter by status), `axon_agent_connected` (gauge).
6. **Correlation:** propagate `requestId` as OTEL baggage; emit `traceId` in pino log lines.

**Files touched:** `backend/package.json`, `backend/instrumentation.js` (new), `server.js`, `routes/adminR.js`, `services/jobExecutionRouter.js`, `backend/Dockerfile`

**Effort:** M (2–3 days)

**Done-when:** `GET /metrics` returns Prometheus text. A job dispatch produces a multi-span trace in an OTLP-compatible backend. `traceId` appears in pino output.

**Dependencies:** OTLP endpoint configurable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var (no-op if unset).

---

### Item 9 — Swagger Accuracy ✅ Already Resolved

`backend/swagger.yaml` already uses the correct singular `/user` path prefix and documents all 28 live routes — verified against `backend/routes/*.js` and `server.js` mounts. The audit's "stale swagger / wrong prefix" finding was incorrect. No work required.

---

## Tier 3 — Large Architecture (Full Detail)

### Item 10 — Short-Lived Signed Agent Tokens

**Severity:** 🟠 High — leaked static `apiKey` provides indefinite access

#### Problem

Agent auth is a long-lived `apiKey` (32 random bytes, bcrypt-stored). Manual rotation only via `POST /agents/:agentId/rotate-key` (admin). A leaked key grants indefinite access until rotated by a human. `agent/src/connection.rs` carries the static key in every Socket.IO handshake.

#### Approach (STS-style)

1. **Registration response** (`agentProvisioningC.js`) returns both the long-lived `apiKey` (break-glass) and a short-lived HMAC-signed JWT (`{ agentId, orgId, iat, exp: now+15min }`).
2. **Agent (`connection.rs`):** stores the short-lived token; refreshes at ~12 min via `POST /agents/refresh-token`.
3. **New `POST /agents/refresh-token`** endpoint: verifies current token (accepting tokens up to 1 min past expiry for clock-skew grace), issues a fresh 15-min token.
4. **Socket.IO auth middleware (`server.js`):** verify the short-lived JWT for agent connections. Long-lived `apiKey` becomes the bootstrap credential only.
5. **`models/agent.js`:** add `tokenIssuedAt`, `tokenExpiry` fields.

**Files touched:** `agentProvisioningC.js`, `models/agent.js`, `routes/agentProvisioningR.js`, `server.js`, `agent/src/connection.rs`, `agent/src/main.rs`

**Effort:** L (1–2 weeks)

**Dependencies:** Item 3 (shared HMAC infrastructure should land first).

---

### Item 11 — Per-Job / Per-Agent RBAC

**Severity:** 🟡 Medium — binary admin/user role is too coarse for multi-team orgs

#### Problem

`middlewares/jwt.js` provides only `authUser` (any valid JWT) and `authAdmin` (role === "admin"). Within an org, any user can trigger any job on any agent. `models/job.js` has no `permissions` sub-document.

#### Approach

1. **`models/job.js`:** add `permissions: { allowedUsers: [ObjectId], allowedRoles: [String] }`. Empty = unrestricted (backward-compatible).
2. **`models/agent.js`:** add `allowedUsers` and `allowedJobs` arrays.
3. **New `authResource` middleware** in `middlewares/jwt.js`: after `authUser`, loads the resource and checks `req.user._id` against `permissions.allowedUsers` / `allowedRoles`. Attach to `POST /jobs/runJobNow/:jobId` and agent dispatch routes.
4. **`models/user.js`:** add `role` enum (admin / operator / viewer) to replace the current binary admin field.
5. **New endpoints:** `PATCH /jobs/:id/permissions` and `PATCH /agents/:agentId/permissions` for managing access lists.

**Files touched:** `models/job.js`, `models/agent.js`, `models/user.js`, `middlewares/jwt.js`, `controllers/jobC.js`, `controllers/agentProvisioningC.js`, new route handlers

**Effort:** L (1–2 weeks)

**Dependencies:** None.

---

### Item 12 — Sandboxed Agent Execution

**Severity:** 🟡 Medium — agent runs commands with full OS privileges of the agent process

#### Problem

`agent/src/execution.rs` spawns `sh -c <command>` (or `cmd /C`) as a direct child process with no filesystem, network, or syscall restrictions. Even a whitelisted command runs with the agent's full process credentials.

#### Approach (research + phased rollout)

1. **Linux (primary):** wrap `Command::new("sh")` with a `unshare` call to create a new user/mount/PID/network namespace. Apply a `seccomp` filter for syscall restriction. Restrict filesystem via read-only bind-mounts.
2. **Docker-based option:** agent optionally spawns commands inside `docker run --rm --network none --read-only <image> sh -c <command>`. Opt-in per agent (requires Docker socket access).
3. **Agent registration flag:** `sandboxMode: "none" | "namespace" | "docker"` stored in `models/agent.js`.

**Files touched:** `agent/src/execution.rs`, `models/agent.js`, `controllers/agentProvisioningC.js`

**Effort:** L (1–2 weeks per sandbox mode; platform testing required)

**Dependencies:** Item 3 (allowlist) should land first — sandboxing is a hardening layer on top.

---

### Item 13 — WORM Export + External Chain Anchoring

**Severity:** 🟡 Medium — completes the SOC2/HIPAA audit trail story

#### Problem

Hash-chaining (Item 1) makes in-MongoDB tampering detectable. However an attacker who can also modify the Redis chain head can forge the chain forward. A SOC2 auditor needs an externally-observable anchor that cannot be retroactively modified.

#### Approach

1. **WORM export cron** (BullMQ repeatable, every 6 h):
   - Query `AuditLog` where `createdAt < now - 24h` and `exportedToWorm: false`.
   - Serialise as newline-delimited JSON; upload to Azure Blob Storage with an immutability retention policy (7-year minimum).
   - Set `exportedToWorm: true` on archived records.
2. **External anchoring** (daily cron): publish the current chain head hash to a verifiable external location — options: signed email to `audit-anchor@<domain>`, public GitHub Gist commit (immutable SHA), or OpenTimestamps proof.
3. **`models/auditLog.js`:** add `exportedToWorm: Boolean` (mutable field, not part of the hash).
4. **`.env.example`:** add `AZURE_BLOB_WORM_CONNECTION_STRING`, `AZURE_BLOB_WORM_CONTAINER`.

**Files touched:** `models/auditLog.js`, `workers/auditWormWorker.js` (new), `server.js`, `backend/.env.example`

**Effort:** L (1 week + Azure provisioning)

**Dependencies:** Item 1 (hash-chaining) must land first. Azure Blob Storage with immutability policy must be provisioned.

---

### Item 14 — Go Telemetry / Log-Stream Gateway Extraction

**Severity:** 🟢 Low — scale-gated; current Node architecture is sufficient below ~500 concurrent agents

#### Problem

Each Rust agent holds an open WebSocket on the Node.js single-threaded event loop. Log chunks from many simultaneous agents must fan out to UI clients via Socket.IO on the same loop. Go's goroutine-per-connection model handles this O(N) concurrency with ~2 KB stack each vs. Node's event-loop serialisation.

**Trigger:** schedule this work when concurrent agent count approaches ~500.

#### Target Architecture

```
Rust Agents ──ws──▶  Go Gateway (goroutine/agent)  ──Redis pub/sub──▶  Express/Socket.IO ──ws──▶ UI
                     ├ validates agentId+apiKey
                     ├ batches telemetry heartbeats
                     └ publishes log chunks to Redis
```

Express/Socket.IO stays for all CRUD, auth, job scheduling, BullMQ, and UI fan-out. Go handles only the agent-facing connection layer.

#### Phased Migration (zero-downtime, feature-flagged)

**Phase A — Contract definition** (1 day, no code)
Define the Redis pub/sub message schema:
```json
{ "agentId": "...", "orgId": "...", "jobId": "...", "stream": "stdout|stderr|heartbeat", "line": "...", "timestampMs": 0 }
```
Channel naming: `agent:logs:<orgId>`, `agent:telemetry:<agentId>`.

**Phase B — Build Go gateway** (2–3 weeks)
- Create `gateway/`: `main.go`, `handler/websocket.go`, `handler/auth.go`, `redis/publisher.go`.
- Accepts agent WebSocket connections; validates `agentId+apiKey` against Mongo (via Redis cache or lightweight gRPC to Node).
- On `execute_command` result receipt, publishes to Redis and returns result over the socket (so Node dispatcher can resolve its Promise during dual-run).
- Publishes heartbeats and log chunks to Redis pub/sub.
- Containerised: `gateway/Dockerfile` (`FROM golang:1.22-alpine`); entry in `docker-compose.prod.yml`.

**Phase C — Feature-flagged routing** (3 days)
- Add `AGENT_GATEWAY_URL` to `backend/config/environment.js` Zod schema.
- When set, reject agent Socket.IO connections at Node (agents connect to Go instead). UI clients always connect to Node Socket.IO.
- Node subscribes to `agent:logs:*` and `agent:telemetry:*` Redis channels and fans out `log_chunk` to UI clients — replacing direct socket fan-out in `services/logStreamBroker.js`.

**Phase D — Dual-run** (1 sprint)
- Deploy Go gateway alongside Node with `AGENT_GATEWAY_URL` set.
- Compare telemetry parity: Redis pub/sub messages vs previous in-memory buffer outputs.
- Monitor `command_result` delivery latency and log chunk ordering.

**Phase E — Retire Node agent path** (2 days, once parity confirmed)
- Remove `services/logStreamBroker.js`, `services/agentTelemetryBuffer.js`, `workers/telemetryFlushWorker.js`.
- Remove agent auth branch from `server.js` Socket.IO connection handler (keep UI client auth only).
- Update `server.js` to subscribe to Redis pub/sub for telemetry flush.

**Files created:** `gateway/main.go`, `gateway/handler/websocket.go`, `gateway/handler/auth.go`, `gateway/redis/publisher.go`, `gateway/Dockerfile`
**Files removed (Phase E):** `services/logStreamBroker.js`, `services/agentTelemetryBuffer.js`, `workers/telemetryFlushWorker.js`
**Files modified:** `server.js`, `config/environment.js`, `docker-compose.prod.yml`, `.github/workflows/ci.yml`

**Effort:** XL (6–8 weeks across all phases)

**Dependencies:** Items 4 (dispatch ACK) and 10 (short-lived tokens) should land first to reduce the auth surface migrated into the Go layer.

---

## Dependency Map

```
Item 1  (hash-chain)     ◀── Item 13 (WORM export)
Item 3  (HMAC dispatch)  ◀── Item 10 (short-lived tokens, shared HMAC plumbing)
Item 4  (dispatch ACK)   ◀── Item 14 (Go gateway, cleaner protocol surface)
Item 10 (tokens)         ◀── Item 14 (Go gateway, auth migration)
Item 3  (allowlist)      ◀── Item 12 (sandboxing, layered on top)

Items 2, 5, 6, 7, 8, 11  — independent, no blocking dependencies
```

---

## Honest Claims Update

After Tier 1 ships, update landing page copy and `README.md`:

| Current (inaccurate) | Accurate replacement |
|---|---|
| "atomic Redis SETNX guarantees exactly one executes" | "at-least-once delivery with idempotent execution — a fencing token makes duplicate execution a no-op" |
| "fields startedAt, jobId, orgId, triggeredBy are immutable" | "immutable fields are hash-chained — any post-write modification breaks the verifiable chain" |
| "Engineers don't get a shell — they get Jobs" | "dispatched payloads are HMAC-signed; agents optionally enforce a local command allowlist" |
