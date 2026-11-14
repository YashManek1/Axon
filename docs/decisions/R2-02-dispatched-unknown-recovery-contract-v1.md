# R2-02 Phase 2 Architecture Decision: Process-Crash and Dispatched UNKNOWN Recovery Contract

Decision owner: Astra.
Date: 2026-10-11.
Status: DECIDED — Bounded Specification for Dispatched UNKNOWN Machine-Quiescence & Hold Release.

---

## 1. Context & The Core Problem

Under `docs/decisions/R2-02-operator-resolution-v1.md`, Phase 1 resolved **prospective never-dispatched runs**:
- A run that failed before emission has a server-generated `nonDispatchProof`.
- The operator can submit an immutable release intent.
- Axon verifies zero commands were emitted and cleans up the execution target hold without redispatching.

### The Remaining Gap (Dispatched UNKNOWN)
When a run reaches `DISPATCHING` or `ACKNOWLEDGED`, commands **were emitted** to the agent machine. If:
1. The agent host crashes or loses power;
2. The agent daemon restarts mid-execution;
3. The network socket drops and execution status cannot be collected;

Axon marks the run `UNKNOWN` with `requiresReview: true`. **The machine execution target hold remains locked indefinitely.**

Why? Because deleting the hold blindly could allow a new run to dispatch to that machine while the previous command is still secretly running (or half-finished in the background).

---

## 2. Decision Boundary & Invariants

We **REJECT**:
- Manual operator checkbox claiming "I checked the machine, it's fine" (unverified human assumption).
- Automatic time-based expiration of holds on dispatched runs (timeout does not prove process death).
- Automatic re-dispatch or automatic retry (can double-execute dangerous non-idempotent scripts).
- Modifying historical `JobRun` audit logs (historical outcome remains permanently `UNKNOWN`).

We **APPROVE**:
A machine-verified **Agent Reconnect Quiescence Proof (ARQP)**:
A run that reached `DISPATCHING` or `ACKNOWLEDGED` may only have its hold released if the target agent reconnects and provides cryptographic/journal evidence proving the previous attempt process tree is dead.

---

## 3. The 4-Step Machine Quiescence Protocol (ARQP)

### Step 1: Agent Journal Recovery Verification
When the Rust agent daemon starts up, `AttemptJournal::open()` scans the local journal directory:
- Any attempts in state `Received` or `Running` are transitioned locally to `Terminal` with outcome `Unknown` and reason `AGENT_RESTARTED_DURING_ATTEMPT`.
- The agent computes a SHA-256 digest over its terminal journal inventory.

### Step 2: Connection Generation Monotonicity
- When the agent reconnects to the Axon backend via WebSocket:
  - It presents its authenticated `hardwareUuid` and credentials.
  - The backend atomically increments `connectionGeneration` in MongoDB.
  - Any in-flight execution from prior generations is mathematically orphaned (older socket ID and older generation).

### Step 3: Quiescence Assertion Certificate (QAC)
To resolve a dispatched `UNKNOWN` hold, the backend queries the reconnected agent:
```json
{
  "protocolVersion": 2,
  "query": "VERIFY_PROCESS_QUIESCENCE",
  "targetAgentId": "stable-agent-id",
  "attemptId": "attempt-id-of-unknown-run",
  "connectionGeneration": 2
}
```
The agent checks its local process tree and journal:
1. Is any PID associated with `attemptId` still active in the OS process table? (Verified via `/proc` or `tasklist`).
2. Does the journal record this attempt as `Terminal` (restarted / ended)?

If verified, the agent signs and returns a **Quiescence Certificate**:
```json
{
  "version": 1,
  "attemptId": "attempt-id",
  "targetAgentId": "agent-id",
  "processDeadConfirmed": true,
  "journalTerminalConfirmed": true,
  "generation": 2,
  "verifiedAt": "2026-10-11T14:30:00Z",
  "agentSignature": "sha256-signed-token"
}
```

### Step 4: Operator-Witnessed Hold Release
Once the backend verifies the Quiescence Certificate:
1. The run's reconciliation status becomes `eligible: true` under blockedReason: `null`.
2. The operator submits `POST /jobs/:jobId/runs/:runId/reconciliation` with immutable reason.
3. The backend:
   - Persists `operatorResolution` recording `PURPOSE: RELEASE_DISPATCHED_QUIESCENT` and linking the certificate hash.
   - Deletes the exact `ExecutionTargetHold`.
   - **Never retries the command.**
   - Retains the historical `JobRun` status as `UNKNOWN` forever.

---

## 4. Acceptance Criteria & Failure Guards

1. **Active Process Rejection**: If the agent reports a surviving background process or cannot confirm process death, reconciliation fails closed (`BLOCKED: TARGET_EFFECTS_UNVERIFIABLE`).
2. **Offline Agent Rejection**: If the target agent remains offline, hold release is impossible (`BLOCKED: TARGET_AGENT_OFFLINE`).
3. **No Automatic Retry**: Successfully releasing the hold leaves the target free for fresh manual previews. It never enqueues or replays the old attempt.
4. **Tenant Isolation**: Certificates are verified against current tenant ownership and target allowed policies.
