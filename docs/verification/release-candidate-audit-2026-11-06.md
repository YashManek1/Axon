# Release candidate audit — 6 November 2026

Decision: **NO-GO for customer deployment or paid pilot execution**. Local implementation and verification may continue. This decision does not invalidate the narrower, source-frozen acceptance recorded for the 8 October connected-agent run or the disposable restore drill.

## What source and evidence support

- Connected-agent r10 locally exercised one approved success (exit 0), deliberate failure (exit 7), approval replay, saved results and owned-resource cleanup. See `docs/verification/connected-agent-20261008/runtime-acceptance-r10.md`. It did not establish process-crash safety, installation or buyer acceptance.
- Earlier matched-release R2-04 drilling established Redis-loss fencing, Docker containment and retained UNKNOWN holds at a specific committed source fingerprint. The rollback used identical image bytes with distinct release IDs; see the R2-04 tracker row.
- A prior disposable MongoDB/Redis backup and restore drill recorded nine verified phases. It did not install the product on a clean customer-like Linux host or restore a separately built prior release.
- Automated frontend accessibility component checks passed. A human screen-reader and second-operator walkthrough have not occurred.
- The existing manifest lists Linux as a platform but hashes only a Windows agent binary. Its `isCleanTree` is false, and no backend/frontend image digests are bound to it. It cannot validate a Linux candidate.
- The previous Linux guide claimed a verified host-process deployment. Source uses `AGENT_SANDBOX_MODE` and Docker containment, `AXON_AGENT_JOURNAL_DIR`, and `AXON_RELEASE_ID`. The guide has been replaced with an explicit validation checklist.
- `scripts/codex/clean-install-check.ps1` performs static/configuration assertions; its 18 passing assertions do not prove a cold-boot installation.
- An independent source review found an unsigned operator-supplied certificate could clear a dispatched UNKNOWN hold when enabled. A terminal journal record is not proof that descendants are dead. The dispatched release path must remain closed. Astra's decision is to fence both service and low-level release helper before independent security acceptance.

## Checks in this audit

| Check | Result | Limit |
| --- | --- | --- |
| Incremental code-review graph refresh and change detection against HEAD | 52 tracked changed files; 192 changed functions/classes; risk signal 0.615 | Graph does not cover untracked files; risk score is triage, not a failure count. |
| `docker version --format '{{.Server.Version}}'` | Exit 1; Docker Desktop Linux engine pipe missing | No fresh container, clean-install or restore drill was attempted. |
| Start Docker Desktop, then repeat `docker version` | Exit 1; Linux engine pipe still missing and no Desktop process remained | Live drills remain unavailable in this Windows session. |
| `git diff --check` before audit edits | Exit 1; `frontend/index.html:103` had a blank line at EOF | The trailing blank line was removed. |
| `git diff --check` after the whitespace repair | Exit 0 | Git still prints line-ending conversion warnings; no whitespace error remains. |
| `npm test -- --run` in `frontend` | Exit 0; 14 files, 213 tests passed | Current local frontend checkout, not a human walkthrough. |
| `npm run lint` and `npm run build` in `frontend` | Both exit 0 | Build is local; no deployed/browser acceptance. |
| `scripts/codex/axon-check.ps1 -Check Frontend` | Exit 1 before tests; access denied writing under `.codex/evidence` | Direct commands above were used. |

## Gates to a supervised pilot

1. Independently accept the dispatched-hold fence. Forged certificate attempts with the feature flag on and off must retain the run and hold, produce no queue/output/emission effect, and return the designed rejection. Never-dispatched resolution must keep its existing authorized behavior.
2. Freeze and review source. Produce immutable backend/frontend/sandbox image digests and a Linux amd64 agent hash tied to the same explicit release identity. The manifest must reject incomplete or dirty input; a manifest alone does not prove artifact provenance.
3. On one explicitly authorized, disposable non-production Linux host, verify clean installation, cold boot, restart, release mismatch rejection, credential rotation/revocation, approved bounded read-only success and deliberate failure, replay and saved results.
4. Exercise process crash with a descendant, persistence interruption, UNKNOWN hold retention, no redispatch, isolated restore and rollback to a separately built prior artifact. Record commands, exit statuses, hashes and absence of forbidden effects.
5. Have the intended operator perform the workflow and accessibility walkthrough. Stop if the operator cannot safely interpret or recover an uncertain result.
6. Obtain first-hand buyer validation: a recent sanitized recurring workflow, frequency and cost, why current tools fail, an accountable operator, permission to discuss, and genuine willingness to pay. Public research alone cannot satisfy this gate.

Do not send outreach, install on a customer system, use customer credentials or represent this as a verified fleet deployment without separate authorization and evidence.

## 14 November source candidate acceptance

Astra accepted the source for publication following an independent review of the dispatched-hold fence and manifest v2. A dispatched UNKNOWN run rejects reconciliation before creating an intent, and the hold service retains the target owner even for a legacy intent. Leave dispatched recovery disabled until there is an authenticated process-tree-death proof and live fault evidence. Manifest v2 binds a clean commit, immutable image digests, and an ELF Linux amd64 agent hash to an explicit release ID. This acceptance covers the source and its inventory checks. Installation approval requires a built and verified release.

| Verification | Result |
| --- | --- |
| Backend `npm.cmd test -- --run --maxWorkers=1 --hookTimeout=10000` with isolated MongoDB and local test Redis | Exit 0. 40 files passed, two skipped, 391 tests passed, seven skipped. Includes the dispatched rejection and legacy hold fence checks. |
| Frontend Vitest, lint, and build | Exit 0 for each. 14 test files, 213 tests passed. |
| Agent `cargo test` on Windows | Exit 0, 32 tests passed. |
| Manifest v2 and offline restore guards | Exit 0, 25 manifest tests and 10 restore tests passed. |
| Outreach and assessment worksheet | Exit 0, 61 Python tests and 10 Node tests passed. |
| Docker Linux `node scripts/codex/approval-connected-agent-orchestrator.mjs` | Exit 0, `pass-cleaned`. Approved exit 0 and exit 7 were saved with the correct statuses, one attempt each, and no duplicate runs or history on approval replay. Queues were empty. All 12 owned Docker resources were cleaned up. Local record: `.codex/evidence/connected-agent-20261004/runtime-approval-a9823a9c39bb4aa998d3915bbcf0a13c.json`. |

Docker Desktop recovered. The Linux rehearsal exercised a synthetic workflow. Automatic approval review blocked the legacy live crash drill because its shared Compose cleanup could delete unrelated containers or volumes. The current source still requires clean installation, persistence interruption, process crash and recovery, and separate-artifact rollback on disposable Linux infrastructure. The Windows-only generated manifest is excluded from the candidate.

The next buyer evidence is an operator's account of one recent recurring Linux task, what they do today, how often they do it, the cost, and whether they would pay for a supervised pilot. At this checkpoint 37 organizations have been researched, zero contacts qualify and zero operator conversations have occurred. Use the [NEXOYA conversation brief](../outreach/nexoya-conversation-brief-2026-10-08.md) and [assessment worksheet](../../tools/axon-assessment/index.html) after securing an introduction or permission to contact an operator.
