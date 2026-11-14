# R2-02 frontend verification — 2026-10-09

## Bounded behavior

- Adds an explicit, operator-initiated reconciliation read and a separate release-intent submission to Job Detail. Neither action previews, approves, enqueues, retries, repairs, or executes a run.
- Reconciliation requests use the confirmed `GET`/`POST /jobs/:jobId/runs/:runId/reconciliation` API with `Cache-Control: no-store` and `skipAuthRefresh: true`. POST sends only the proof ID, expected transition sequence, reason, and a UUID `Idempotency-Key`.
- The stored idempotency body/key is namespaced independently from execution approval state. It is retained after a 503 ambiguity and replayed only through an explicit operator action. It is not reused after a protected proof/transition change.
- Permission denials (401/403/404) clear protected state. Context switches and overlapping/stale requests are fenced. The panel has no automatic reads, polling, retries, or repair path.
- The confirmation copy states that release intent was recorded, the original hold was absent at the latest check, the run remains `UNKNOWN`, a new run needs a new preview and approval, and target availability has not been established.

## Automated evidence

| Command | Result |
| --- | --- |
| `npm.cmd test -- --run src/pages/dashboard/ReconciliationPanel.test.tsx` | Exit 0 — 1 file, 7 tests passed (9.06s). Covers successful bounded action/no preview-or-run, 503 key/body replay, overlapping late 403, blocked states, actor/job switch + unmount, proof change, and StrictMode no-auto-read. |
| `npm.cmd run lint` | Exit 0 — no lint findings. |
| `npm.cmd run build` | Exit 0 — TypeScript and production build complete. Existing bundle-size advisory only: `index-*.js` 929.16 kB / 269.67 kB gzip. |
| `npm.cmd test` | Exit 0 — 13 files, 197 tests passed (19.10s). |

The first sandboxed focused Vitest attempt could not discover tests because the sandbox denied an AppData temporary-transform-cache rename (`EPERM`); this is infrastructure evidence only (0 tests). The permitted local rerun above supplied the behavioral result.

## Rendered verification limitation

The local Vite server reported ready at `http://127.0.0.1:4173/`, but the available in-app browser could not reach that loopback address (`net::ERR_CONNECTION_TIMED_OUT`). No screenshot was taken and no browser-only claim is made. The accessible rendered interaction journey is covered by the jsdom Testing Library suite above.

## Source fingerprints

- `frontend/src/services/api.ts`: `6E84DF73CA6FA9AD70192CD6A07A7767A7C840913477BB3A9332E8E6BF4EEF05`
- `frontend/src/pages/dashboard/JobDetailPage.tsx`: `3E4BDFA0A300759B9321887C1D75138C033DFB978D2324B9DE3CD4500758F2EC`
- `frontend/src/pages/dashboard/ReconciliationPanel.tsx`: `B14AD086C819993E70D468D2671FFD95B13F3A865AA12842B5C4B85739BBEB97`
- `frontend/src/pages/dashboard/ReconciliationPanel.test.tsx`: `FFF1B0D7329F5778F26CBA33F2145D2F1CD245CDDBD6E9E89141D739B9BA135F`

## API blockers

None for the confirmed frontend contract. Live API/browser integration was not exercised because the local browser could not connect to the local server.
