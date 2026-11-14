# Connected-agent r10 runtime evidence — 8 October 2026

Bounded scope: approved isolated Docker Desktop Linux harness, not deployment or whole-product readiness.

## Commands and results

- Frozen ten harness inputs matched `generation-repair-r10.md` immediately before execution; hash check native exit 0.
- `node scripts/codex/approval-connected-agent-orchestrator.mjs`: native exit 0 (session 41390), run `approval-3e20dc2ba2e6066fd6dc6d5989413399`; runtime phase `pass-cleaned`, error null.
- Parent read-only inspection using `inspectDockerResource` on every exact cleanup-ledger entry: native exit 0, all 12/12 resources independently absent. No deletion in this check.

## Observed acceptance results

Real Rust agent connected with numeric connection generation 1. Isolated fixture: one organization, one user, one agent, two jobs.

| Scenario | Preview / approval / replay HTTP | Saved result | Exit | Attempts | Duplicate run/history | Saved GET |
| --- | --- | --- | --- | --- | --- | --- |
| success | 201 / 200 / 200 | SUCCEEDED / COMPLETED | 0 | 1 | false / false | true |
| exit7 | 201 / 200 / 200 | FAILED / COMPLETED | 7 | 1 | false / false | true |

Both scenarios ended with zero waiting, active or delayed queue jobs. The acceptance report is evidence of the verifier's checks, not a claim of extra untested fault cases.

Socket compatibility gate recorded exactly two binds/two mounts, the approved Docker Desktop proxy socket representation and the named journal volume on the same Linux daemon. Nested cleanup was successful with an empty inventory and no failures; owned cleanup deleted the twelve nonce-owned resources with zero outside resources or failures. Parent subsequently verified all twelve absent.

## Source artifacts

In `.codex/evidence/connected-agent-20261004/`:

- `runtime-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`
- `runtime-acceptance-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`
- `fixture-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`
- `cleanup-ledger-approval-3e20dc2ba2e6066fd6dc6d5989413399.json`

## Limits

Independent final bounded runtime acceptance was recorded on 9 October in `runtime-acceptance-r10.md`, at the ten frozen r10 harness fingerprints. This does not establish real-agent UNKNOWN/persistence-fault/crash recovery, machine-safe hold release/retry, clean customer installation, backup/restore, real multi-host operation, actual screen-reader or second-person acceptance, or buyer validation. No customer database, external outreach or deployment was involved.
