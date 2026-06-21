# Axon — Tech-Level Audit

> Generated: 2026-06-03  
> Framing: Axon's landing page makes **four concrete production-grade correctness claims**. This audit evaluates the gap between what each claim requires at the optimal production level and where the current implementation actually sits.

---

## Pain Point 1 — Duplicate Cron Execution at Scale (Exactly-Once)

### The claim
> "Even if 100 servers enqueue the same job simultaneously, an atomic Redis SETNX guarantees exactly one executes."

### What optimal actually requires
True "exactly-once" is unattainable over an asynchronous network — the provably correct model is **at-least-once delivery + idempotent execution with fencing tokens**.

The gap in plain SETNX/distributed-lock approaches:
- **Lock expiry race (Kleppmann's critique of Redlock):** If a worker holds a Redis lock and GC/IO pauses it for >TTL milliseconds, the lock expires. A second worker acquires it. Now both workers execute the same job concurrently. Neither knows the other exists.
- **BullMQ stalled-job redelivery:** BullMQ marks a job "stalled" if a worker dies mid-execution, then redelivers it. A correctly-behaved execution can be re-run after a transient worker crash.

The optimal defense is **fencing tokens**: a monotonically incrementing counter attached to each lock acquisition, passed through to the execution sink. The execution sink rejects any request carrying a token ≤ the last-seen token for that job — making re-execution a cheap no-op rather than a double-charge.

### Current implementation
`backend/services/distributedLock.js` — Redis SETNX + TTL lock. BullMQ `jobId` dedup drops duplicate enqueues while the job exists in the queue. Both provide good protection for the enqueue race.

**Vulnerable to:** worker GC pause > lock TTL; BullMQ stalled-job redelivery; Mongo sink re-execution.

### Gap and steps to close
1. Add a fencing token (Redis `INCR` on a per-job counter, returned with the lock) to `distributedLock.js`.
2. Pass the token through `jobWorker.js` to the Mongo sink writer (`jobWorker.js:224-239`) — the sink upserts on `(jobId, fencingToken)` using MongoDB's `$setOnInsert`, making re-execution idempotent.
3. Configure BullMQ's `stalledInterval` and `maxStalledCount` to bound re-delivery.
4. **Document honestly** that Axon provides at-least-once with idempotent sink, not exactly-once — any distributed system that makes exactly-once a hard guarantee is lying.

---

## Pain Point 2 — SSH/Firewall Blocked (Outbound-Only Agent)

### The claim
> "The agent dials out on port 443. IT cannot object to HTTPS."

### What optimal actually requires
The outbound-only model is architecturally correct and matches the approach used by production-grade systems (GitHub Actions runner, Tailscale, Cloudflare Tunnel). It is **best-in-class** at the architecture level.

The gap is at **scale and security hardening**:
- **Scale ceiling:** Node.js runs on a single event loop. Each Rust agent holds an open WebSocket. At hundreds to thousands of concurrent agents, Node's event loop becomes the bottleneck for the telemetry fan-out path (log chunks arriving from many agents simultaneously, being fanned out to UI clients via Socket.IO). Go's goroutine-per-connection model handles this O(N) concurrency natively.
- **Auth model:** agent authenticates with a static `apiKey` (rotatable, but long-lived). Optimal: short-lived signed tokens (HMAC or JWT with 15-minute expiry) so a leaked key auto-expires.
- **Dispatch reliability:** no acknowledgement from agent back to control plane that a dispatched job was received. If the WebSocket delivers but the agent crashes before ACKing, the job is marked dispatched but never executed — silently lost.

### Current implementation
`agent/src/connection.rs` — Tokio + tungstenite WebSocket client, exponential reconnect backoff 1s→30s. Auth via `agentId + apiKey` header on upgrade. Reconnect queues Redis-held jobs on reconnect.

**Correct and solid.** The scale ceiling is not a problem today at small agent counts but becomes one beyond ~500 concurrent agents.

### Gap and steps to close
1. **Go telemetry/log-stream gateway** (see "Planned Architecture" section): extract the agent WebSocket termination + telemetry batch + log fan-out to a Go microservice. Express/Socket.IO stays for CRUD/auth; it subscribes to log events via Redis pub/sub.
2. Add dispatch acknowledgement: agent emits `job_ack { jobId }` on receiving dispatch; control plane marks job `DISPATCHED_ACKED`. Unacknowledged dispatches after N seconds → requeue.
3. Move agent auth toward short-lived signed tokens: control plane issues a HMAC-signed token at registration, agent exchanges it for a new token before expiry (like AWS STS `AssumeRole`).

---

## Pain Point 3 — Immutable Audit Trail (SOC2/HIPAA)

### The claim
> "Before every execution, Axon writes an AuditLog. The fields startedAt, jobId, orgId, triggeredBy are immutable — a Mongoose pre-save hook rejects any update."

### What optimal actually requires
**A Mongoose pre-save hook is application-level immutability only.** An auditor with direct MongoDB write access (a rogue DBA, a compromised DB account, a `mongosh` session) can `db.auditlogs.updateOne(...)` and modify the record with no trace. This does **not** satisfy a strict SOC2 or HIPAA tamper-evidence requirement where the auditor asks "prove this log was not modified after the fact."

Optimal tamper-evidence requires:
1. **Cryptographic hash-chaining:** each AuditLog record stores `hash: sha256(prevHash + serialized_record)`. A verifier can replay the chain and detect any gap or modification. The chain cannot be silently forged without recomputing all subsequent hashes.
2. **WORM storage or append-only layer:** export records to a write-once object bucket (AWS S3 Object Lock, Azure Blob immutability policy) or a ledger DB (QLDB, immudb).
3. **Periodic external anchoring:** periodically hash the chain head and publish it to an externally-observable location (a public blockchain timestamp, a signed email to the auditor's inbox) so the anchor cannot be retroactively faked.

### Current implementation
`backend/models/auditC.js` + AuditLog Mongoose model — pre-save hook immutability, write-before-execution. The approach is **correct and well-intentioned** but the immutability guarantee is only as strong as MongoDB access control.

### Gap and steps to close
1. **Add hash-chaining to AuditLog model:** `prevHash: String`, `recordHash: String`. On each insert, compute `sha256(prevHash || JSON.stringify(immutableFields))` and store it. Expose a `GET /audit/verify-chain` endpoint that replays and validates the chain.
2. **WORM export:** add a cron job that archives AuditLog records older than 24h to Azure Blob Storage with an immutability policy.
3. This is the **highest-value correctness upgrade** for the enterprise / SOC2 positioning. The Mongoose hook is a good first step; hash-chaining makes it defensible to a real auditor.

---

## Pain Point 4 — Jobs Replace Shell Access (Pre-Approved Commands)

### The claim
> "Engineers don't get a shell — they get Jobs: named, pre-approved command payloads... A junior engineer can trigger 'Restart API Service.' They cannot run anything else."

### What optimal actually requires
The control plane defines and dispatches job payloads. But **the agent executes whatever command string it receives over the WebSocket** — it does not verify that the command was defined by an authorized admin, only that the connection is authenticated. A compromised control plane or a MITM on the WebSocket can dispatch arbitrary commands.

Optimal "jobs replace shell" requires:
1. **Signed job definitions:** the control plane signs job payloads with a private key. The agent verifies the signature before execution — a tampered payload is rejected at the execution boundary.
2. **Agent-side allowlist:** each agent has a local `allowed_commands.json` defining regex patterns or exact command strings it will execute. An out-of-policy command is rejected even if the signature is valid.
3. **Sandboxed execution:** run commands in a container/namespace with restricted filesystem access rather than as a direct child process of the agent. The current `backend/agent/src/execution.rs` spawns a bare `sh -c <command>` — full access to whatever the agent process can touch.
4. **Finer-grained RBAC:** current system has `admin` and `user` roles. Production needs per-job and per-agent authorization: user A can trigger Job X on Agent Y but not Job Z.

### Current implementation
`agent/src/execution.rs` — `Command::new("sh").arg("-c").arg(command)`. No allowlist, no signature verification, no sandboxing. RBAC in `backend/middlewares/jwt.js` — binary admin/user split.

`backend/services/dagStateManager.js` — correct DAG dependency enforcement.

### Gap and steps to close
1. Add **HMAC-signed job dispatch**: control plane signs `{ jobId, command, agentId, nonce }` with `DISPATCH_SIGNING_KEY`; agent verifies before execution.
2. Add an optional **allowlist** field to agent registration: `allowedCommands: ["systemctl restart *", "pg_dump *"]`. The agent checks each dispatched command against its allowlist.
3. Expand RBAC: add per-job and per-agent authorization in a `permissions` sub-document on the Job model.
4. Document as roadmap: container sandboxing (Docker exec / Linux namespaces) for the highest-security environments.

---

## Cross-Cutting Platform Gaps

These apply across all four pain points.

| Gap | Severity | Fix |
|-----|----------|-----|
| **Stale swagger.yaml** — wrong path prefix (`/users` vs `/user`), missing 10+ endpoints | Medium | Regenerate from routes using `swagger-jsdoc` or write an OpenAPI generator script |
| **No registry push in CI** — `build` job tags images locally only, no deploy step | High | Add `az acr login` + `docker push` + `az containerapp update` to a `deploy.yml` workflow |
| **Dev Mongo has no auth** — `docker-compose.yml` runs MongoDB without credentials | Medium | Add `MONGO_INITDB_ROOT_USERNAME/PASSWORD` in dev compose and `mongodb://user:pass@...` in MONGO_URI |
| **No observability** — no OpenTelemetry traces, no Prometheus metrics, no log correlation beyond `requestId` | Medium | Add `@opentelemetry/sdk-node` to backend; expose `/metrics` for Prometheus scrape; trace job dispatch→execute path |
| **Secrets only in `.env`** — no secret rotation, no Key Vault | Medium-High | Use Azure Key Vault in prod; reference secrets by name in Container Apps env |
| **CI flakiness** — `mongodb-memory-server` downloads a binary at CI runtime (slow, firewall-sensitive) | Low-Medium | Add a `mongo:7` service container to `backend-test` job (same pattern as the Redis service already there) |
| **Node 20 → 22 upgrade** | Low | Updated in CI fix (Task 5). Backend Dockerfile still uses `node:20-alpine` — update to `node:22-alpine` |

---

## Planned Architecture — Partial Go Extraction

The highest-impact "higher tech level" upgrade targets **Pain Point 2's scale ceiling**:

**Extract the agent connection + telemetry/log-stream gateway to a Go microservice.**

```
                     ┌─────────────────────┐
  Rust Agents ──ws──▶│  Go Gateway         │──Redis pub/sub──▶ Express/Socket.IO ──ws──▶ UI
                     │  (goroutine/agent)  │
                     │  batches telemetry  │──Redis pub/sub──▶ telemetryFlushWorker
                     └─────────────────────┘
```

**Why Go for this path:**
- Go goroutines are 2KB stack vs. Node's ~1MB per connection overhead. 10,000 concurrent agents = ~20MB Go vs. ~10GB Node for connection state alone.
- Native `gorilla/websocket` handles read/write pump per-connection with no event-loop serialization.
- `sync/atomic` and channels replace the Node-level `agentTelemetryBuffer` and `logStreamBroker` — no shared-mutable-state issues.
- Go compiles to a static binary — easy to containerize and distribute alongside the Rust agent.

**Migration path (zero-downtime, feature-flagged):**
1. Define the Redis pub/sub message contract: `{ agentId, jobId, stream, line, timestampMs }`.
2. Build the Go gateway as an independent binary in `gateway/` — it accepts agent WebSocket connections, validates the `agentId + apiKey`, and publishes events to Redis.
3. Deploy behind a feature flag: control plane routes agent handshake to Go gateway vs. Node based on an env var `AGENT_GATEWAY_URL`.
4. Dual-run for one sprint — compare telemetry parity between old and new paths.
5. Retire the Node path: remove `services/logStreamBroker.js`, `services/agentTelemetryBuffer.js`, `workers/telemetryFlushWorker.js`. Express/Socket.IO subscribes to Redis pub/sub exclusively.

**What stays in Node:** all CRUD (jobs, agents, audit, users, org), auth, job scheduling, BullMQ workers, Socket.IO fan-out to UI clients. Go handles only the agent-facing connection layer.
