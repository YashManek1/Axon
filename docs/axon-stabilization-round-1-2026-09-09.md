# Axon stabilization round 1

Updated 12 September 2026. Status: DONE for the authorized first stabilization round. The [live TODO](AXON-LIVE-TODO.md) is the current tracker. This acceptance covers Tasks 1 and 2 below, not customer production readiness or execution contract v2.

## What we are doing

Task 1 establishes how implementation work is assigned and checked. Astra owns architecture, integration, acceptance and documentation. Sol handles backend changes, Terra handles scoped frontend work, and Luna investigates deployment prerequisites. Each worker has an explicit model, bounded file ownership and acceptance checks. Role briefs in `docs/agents/` are instructions supplied to workers, not automatically registered agents. Security changes receive an independent review after the implementation stabilizes.

Task 2 fixes the first set of existing access-control and frontend problems, and documents deployment prerequisites. It does not implement the future execution protocol or deploy Axon to a customer.

The earlier worker sessions ended during a context refresh. Saved files were inspected and unfinished work was reassigned. Previous passing checks are not treated as evidence for subsequent unverified edits.

## What each change means

- Organization isolation: an administrator of company A should only see and administer company A. The existing admin role remains a customer administrator; it does not become a global platform administrator.
- Human versus machine identity: a browser session identifies a current human member and role. An agent credential identifies a registered machine. Possessing one must not grant the privileges of the other.
- Job permissions: viewers may read permitted resources; operators may change or run permitted jobs; administrators manage permissions inside their own organization. Permission lists cannot turn a viewer into an operator.
- Frontend reliability: opening a different job, reopening an editor, or receiving a new saved revision must initialize the correct command and settings. Relative timestamps must not become negative when data arrives between clock updates.
- Deployment readiness: a checked installation plan is a document. It is not a deployed, tested or production-ready installation.

## Acceptance record

Frontend accepted after source review and fresh checks:

| Command in `frontend/` | Result |
|---|---|
| `npm.cmd test -- --run` | Exit 0; 4 test files, 14 tests passed |
| `npm.cmd run lint` | Exit 0; no errors or warnings |
| `npm.cmd run build` | Exit 0; 2,444 modules transformed. Main JavaScript 947.07 kB / 272.61 kB gzip; existing chunk-size warning remains |

Changed frontend files: `src/components/dashboard/JobFormSlide.tsx`, `src/pages/dashboard/AuditPage.tsx`, `src/pages/dashboard/OverviewPage.tsx`, `src/hooks/useAgentSocket.ts`, `src/tests/ActiveJobQueue.test.tsx`, `src/tests/JobFormSlide.test.tsx`, and `src/tests/OverviewPage.test.tsx`. Tests preserve interaction checks and cover editor initialization, job switching, close/reopen, a newer saved revision and a newly arriving timestamp. This is local component/build evidence, not a browser-to-Rust integration test. CI lint enforcement and runtime-version alignment remain T22 deployment work.

Independent security review accepted the final production source and test additions on 10 September with no confirmed blocker in the authorized scope. Complete-suite evidence below closes final backend acceptance. The review covered current human identity, tenant/resource boundaries, machine credential versioning, legacy credential races, connection registration/cleanup and stale telemetry.

The independent review found a revocation/connection race: a connection authenticated before credential rotation could finish registering afterward using a stale database snapshot. It also identified stale telemetry and legacy model defaults as paths that could restore outdated state. Credential stamping, connection registration and telemetry now use guarded updates. The server delegates registration/cleanup to `services/agentConnectionLifecycle.js`, which catches database errors instead of leaving rejected event callbacks unhandled.

On 10 September, `npm.cmd test -- tests/agentConnectionLifecycle.test.js --maxWorkers=1 --hookTimeout=10000` exited 0 with 8 tests passed. Coverage includes current and legacy agents, revoked pending handshakes, disconnect during registration, replacement connections, database errors and stale telemetry after rotation/decommission. An initial duplicate test-fixture API key caused one failure; the fixture now generates unique keys. Tests use isolated MongoMemoryServer and mocked Redis, not a real deployed agent fleet. The final independent review subsequently accepted this source; complete backend-suite acceptance remained the last verification gate.

Additional accepted checks on 10 September:

| Command in `backend/` (inherited `MONGO_URI` removed first) | Result |
|---|---|
| `npm.cmd test -- tests/logStreamBroker.test.js --maxWorkers=1 --hookTimeout=10000` | Exit 0; 13 tests passed. Covers permitted delivery, Redis bounds/order/catch-up, machine rejection and current role/permission/membership/organization/expiry checks |
| Independent reviewer: `node node_modules/vitest/vitest.mjs run tests/agentConnectionLifecycle.test.js tests/agentProvisioning.test.js tests/auth.test.js tests/authCookies.test.js --maxWorkers=1` | Exit 0; 4 files, 29 tests passed |

Counts from overlapping commands are not additive. These checks force isolated MongoMemoryServer; they must never run against a customer's database because the test setup clears collections. The reviewed revocation behavior is limited to the current single-backend process, not a distributed Socket.IO deployment.

### Final backend acceptance — recorded 12 September

The last worker session ended before reporting its completed run. The coordinator recovered the actual command result (not only the test-count summary): on 10 September at 16:03:49 local time, `npm.cmd test -- --maxWorkers=1 --hookTimeout=10000` completed with **exit 0, 29 test files passed, 232 tests passed, 0 failed**, in 54.82 seconds. No unhandled-error report appears. The saved [test log](../backend/round1-backend-test.log) agrees with the recovered execution record. No later edits were found in the reviewed backend source/test files when acceptance was recorded; an unchanged suite was not rerun merely to reproduce the same result.

Exact command in `backend/`, in a PowerShell process without profile loading:

```powershell
Remove-Item Env:MONGO_URI -ErrorAction SilentlyContinue
npm.cmd test -- --maxWorkers=1 --hookTimeout=10000 2>&1 | Tee-Object -FilePath round1-backend-test.log
exit $LASTEXITCODE
```

The first complete run in this continuation exited 1 with 229 passed / 3 failed across 29 files. The failures were a missing required organization description in a metrics fixture, an offline-telemetry fixture missing its socket/token identity, and an audit test expecting the former `200 []` response instead of the intended cross-organization `404`. These were corrected without changing production code. Their focused rerun exited 0 with 3 files / 22 tests passed before the complete rerun above.

Additional test-only work asserted both rejected promises for a missing agent, password omission from admin user serialization, blocked edits by a restricted operator with no queue side effects, and rejection of an actual human-session token at the agent refresh endpoint. Metrics tests now exercise the real router with a synthetic service credential and deterministic 403/401/200 expectations. Test setup prevents local `.env` values from restoring SMTP or tracing destinations. The focused router command passed 1 file / 7 tests; the admin-isolation/resource-auth/agent-token command passed 3 files / 38 tests, both exit 0. These counts overlap the final suite.

Files changed during this final verification continuation: `backend/tests/jobExecutionRouter.test.js`, `adminIsolation.test.js`, `resourceAuth.test.js`, `agentShortToken.test.js`, `metrics.test.js`, `telemetryBuffer.test.js`, `setup.js`, and `e2e/auditCompliance.test.js` (all under `backend/tests/` except the first explicitly qualified path). A separate read-only reviewer accepted the stabilized assertions and environment setup; Astra reviewed integration and recovered the prior independent security acceptance directly.

This is backend test-suite acceptance on Windows using isolated MongoMemoryServer, local Redis where the suite uses it, and mocked Redis/queue/socket paths elsewhere. It is not a full browser-to-Linux-agent execution test, real retry/fault-injection certification or production deployment. Frontend evidence above remains the previously accepted, unchanged result.

Compatibility policy: legacy human JWTs require a fresh login. Legacy agent JWTs without a token-version field are valid only while their stored agent credential version is zero; rotation invalidates the old generation. The Rust client's recovery after a rejected token is not redesigned in this round, so rotation requires operator-assisted credential replacement and restart/re-enrollment. Dashboard log-session expiry currently requires reload or fresh login. Agent inventory remains organization-visible; enforcing agent `allowedUsers`/`allowedJobs` during execution belongs to the targeting milestone.

Deployment assessment accepted: [readiness checklist](axon-deployment-readiness-2026-09-09.md). Synthetic Compose parsing/rendering succeeded and exposed inherited local dependencies plus different port behavior at default and nondefault `PORT` values. Source review confirmed incomplete readiness checks, release-bundle gaps and the README's agent URL variable mismatch. The executable agent expects `SERVER_URL`. A long-lived `AGENT_API_KEY` is different from its short-lived JWT. The initial assessment performed no deployment, service startup, secret change or restore drill, and Docker was unavailable then. On 10 September, Yash authorized local dependency startup: Docker's stale socket directories were preserved and recreated, and the existing `axon-redis-1` started with health `healthy` and Redis `PONG`. Actual Linux agent integration and production installation remain outstanding; see the readiness report's local follow-up for details.

## Exact-server targeting: the next implementation round

Suppose three agents connect to Axon: `demo-web`, `production-web` and `database`. Today the shell worker finds an online agent in the organization. It does not persist and enforce the specific machine selected for an operation.

The required behavior is simple: choose `demo-web`, and Axon runs there or reports that it cannot run. It never substitutes `production-web` because that machine is available. Permissions answer **who may do this**; targeting answers **where it will happen**. Round 1 fixes permissions. Exact targeting is still pending.

The stable agent ID identifies the registered machine. A socket ID identifies its current network connection and changes on reconnect. A job is a saved instruction; a run is one request to execute it; an attempt is one concrete try. Keeping these identities separate prevents an old reply from being mistaken for the result of a new run.

If a command creates an account and the reply is lost, Axon does not know that the command failed. Automatically repeating it could create another account. The next contract therefore includes an explicit unknown outcome, reconciliation and restricted retries—not a promise that arbitrary remote effects happen exactly once.

The complete design and acceptance cases are in [execution contract v2](axon-execution-contract-v2.md). This is a design, not implemented runtime behavior.

## What still prevents a customer release

Even after this round passes, exact targeting, truthful exit-code handling, run/attempt identity, safe retry, timeout/output limits and deployment/restore verification remain required. Arbitrary outbound HTTP and secret handling also need their own policy before those features are exposed to customers. A successful frontend build and authorization test suite cannot establish distributed execution reliability.

Automation should reuse the corrected execution path. Building a large workflow editor before that path is reliable would make the same failure modes available through more buttons.
