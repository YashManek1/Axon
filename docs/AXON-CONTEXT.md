# Axon context — read first

Updated 12 September 2026. Navigation/checkpoint, not another roadmap.

## Direction and current request
Yash prioritizes income, then a standout engineering project. Sol is the default execution model; Astra owns product, architecture, security, and acceptance gates. Current Axon and automation share one runtime, agent, identity, catalog and customer relationship. The entry hypothesis is supported remote jobs for infrastructure agencies; multi-server procedures are the expansion. Demand and prices remain unvalidated.

The September 12 setup, technical completion plan, and first-client/funnel plan are complete as documentation. Product implementation, campaign execution, deployment, and customer connection remain separately authorized work. No email was sent and no campaign daemon ran.

## Accepted baseline
- Round 1: human identity, organization/resource boundaries, viewer restrictions, credential revocation and connection/telemetry race guards accepted by independent security review.
- Backend on 10 September: `npm.cmd test -- --maxWorkers=1 --hookTimeout=10000`, exit 0, 29 files / 232 passed. Recovered/accepted September 12; log `backend/round1-backend-test.log`.
- Frontend previously accepted: 4 files / 14 passed, lint and build exit 0; large bundle warning remains.
- Docker's stale socket-only directories were preserved/recreated; existing `axon-redis-1` was healthy/PONG September 10. Recheck availability when needed.
- No production/customer deployment, Linux fleet or restore acceptance exists.

## Critical unfinished behavior
`backend/workers/jobWorker.js` selects an online org agent, checks `agentResponse.error` rather than Rust exit-code classification, and resolves caught failures. Results/logs correlate by reusable job ID. v2 requires stable exact targets, run/attempt identity, honest unknown outcomes and policy-based retries. Existing signing/audit/fencing code does not prove those guarantees.

## Navigation
| Question | Start here |
|---|---|
| Accepted/pending work | `docs/AXON-LIVE-TODO.md` |
| Evidence/compatibility | `docs/axon-stabilization-round-1-2026-09-09.md` |
| Wire/execution contract | `docs/axon-execution-contract-v2.md` |
| Ranked defects | `docs/axon-technical-audit-and-release-plan-2026-09-09.md` |
| Current product and UX | `docs/axon-current-product-plan-2026-09-09.md`, `docs/axon-ui-ux-product-spec-2026-09-09.md` |
| Sol execution and Astra gates | `docs/codex/BRAIN-PLAN.md`, `docs/codex/OPERATING-MODEL.md` |
| Technical completion and QA | `docs/axon-technical-completion-plan-2026-09-12.md` |
| First client and funnel | `docs/axon-first-client-and-funnel-plan-2026-09-12.md` |
| Automation | `docs/axon-automation-product-plan-2026-09-09.md` |
| Deployment | `docs/axon-deployment-readiness-2026-09-09.md` |
| Auth | `backend/middlewares/jwt.js`, `backend/routes/`, `controllers/` |
| Remote lifecycle | `backend/services/jobExecutionRouter.js`, `agentConnectionLifecycle.js`, `agentTelemetryBuffer.js` |
| Rust | `agent/src/connection.rs`, `execution.rs`, `sandbox.rs` |
| UI | `frontend/src/pages/dashboard/`, `components/dashboard/`, `services/api.ts` |
| Outreach (separate quarantined job-mail project) | `C:\Users\Yash\OneDrive\Desktop\Outreach`; do not run for Axon until the staged B2B safety gates pass |

Status belongs in the tracker, evidence in milestone reports, shared interfaces in contracts. Keep this checkpoint small. September 8 research and the large workflow architecture document explain alternatives; they do not override later decisions.
