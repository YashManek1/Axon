# Axon — API Audit (Updated)

> Original audit: 2026-06-03
> This revision: 2026-06-21
> Scope: verified backend API surface vs. frontend usage; includes fixes shipped in this session.

---

## Complete Backend API Surface

### Auth — `/user`
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/user/register` | none | Register user + organization |
| POST | `/user/login` | none | Login, returns JWT httpOnly cookie |
| POST | `/user/logout` | cookie | Logout, clears cookie |
| POST | `/user/refresh` | cookie | Refresh session JWT |

### Jobs — `/jobs`
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/jobs/createJob` | user | Create scheduled/immediate job (Zod-validated) |
| GET | `/jobs/getJobs` | user | List org's jobs |
| GET | `/jobs/getJobById/:jobId` | user | Get one job |
| PUT | `/jobs/updateJob/:id` | user | Update job (Zod-validated) |
| DELETE | `/jobs/deleteJob/:jobId` | user | Delete job |
| PATCH | `/jobs/toggleJobStatus/:jobId` | user | Enable/disable job |
| POST | `/jobs/runJobNow/:jobId` | user | Manual trigger |

### Admin — `/admin`
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/health` | none | Health check + DB/queue state |
| GET | `/admin/job-stats` | admin | Aggregate job counts, jobs run in last 24 h |
| GET | `/admin/user-stats` | admin | User/job counts per user |
| GET | `/admin/all-jobs` | admin | All jobs across all orgs |
| GET | `/admin/all-users` | admin | All users across all orgs |
| GET | `/admin/org-analytics` | admin | Per-org agent/job breakdown (current snapshot) |

### Agents — `/agents`
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/agents/register` | org API key header | Agent self-registration |
| POST | `/agents/:agentId/rotate-key` | admin | Rotate agent API key |
| DELETE | `/agents/:agentId` | admin | Decommission agent |
| GET | `/agents/getAgents` | user | List org's agents |
| GET | `/agents/getAgent/:agentId` | user | Get one agent |

### Audit — `/audit`
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/audit/job/:jobId` | user | Execution history for a job |
| GET | `/audit/recent` | user | Recent activity across org |
| GET | `/audit/logs` | user | Log lines |
| GET | `/audit/export` | user | Export history (date range) |
| GET | `/audit/run/:auditId/logs` | user | Logs for a specific run |
| GET | `/audit/run/:auditId` | user | One run detail |

### Socket.IO (real-time)
- Connection: JWT cookie auth for `ui` clients; `agentId + apiKey` for `agent` clients.
- Frontend emits: `subscribe_job_logs`, `unsubscribe_job_logs`
- Frontend receives: `log_chunk`, `log_catchup`, `log_subscription_error`

---

## Frontend API Coverage

All `*API` calls in `frontend/src/services/api.ts` have confirmed matching backend routes.
No frontend call produces a 404.

### Active job form — `JobFormSlide.tsx`
The slide-over panel is the **sole active job form**. It exposes and submits all implemented job fields:

| Field group | Fields |
|-------------|--------|
| Core | name, type (shell/http), schedule (cron), payload (command / url+method+headers+body) |
| Scheduling | scheduleType, timezone, executionWindow (enable toggle, startTime, endTime, activeDays) |
| Reliability | retryLimit, timeout, enabled |
| Integrations | webhookUrl, notifications (onSuccess/onFailure + recipients) |
| Data sink | type (mongo/none), uri, databaseName, collectionName, exportFormat (CSV/JSON/Excel) |
| DAG | dependsOn (backend only — no UI input; see deferred items) |

`CreateJobModal.tsx` was a stale duplicate with several unbound inputs. It has been deleted.

---

## Items Fixed in This Audit Cycle

### 1. Mongo sink export — field-name mismatch (was dead code)
**Root cause:** `models/job.js` and `JobFormSlide.tsx` persisted `sink.collectionName`, but `workers/jobWorker.js` guarded on and wrote to `sink.collection` — always undefined. The sink never fired.

**Fix:**
- `workers/jobWorker.js`: reads `sink.collectionName`; passes `{ dbName: sink.databaseName }` to `mongoose.createConnection`.
- `schemas/jobSchemas.js`: removed the band-aid `collection` field from `sinkSchema`.
- `controllers/jobC.js`: fixed the default sink fallback (`collection: null` to `collectionName: null`).

### 2. Sink `exportFormat` (CSV/JSON/Excel) now honoured
**Root cause:** Worker did a raw `insertOne({ data })` regardless of `exportFormat`.

**Fix:** `backend/utils/sinkFormat.js` — `buildSinkPayload(data, exportFormats)` serialises output into a `formats` sub-document `{ json?, csv?, xlsxBase64? }`. Called from the worker before the insertOne. `exceljs` added as a dependency for the Excel path.

### 3. `executionWindow` now enforced at runtime
**Root cause:** `executionWindow` (startTime/endTime/activeDays) was stored in MongoDB but never checked by the worker.

**Fix:**
- `backend/utils/executionWindow.js` — `isWithinExecutionWindow(window, timezone, now)` checks day-of-week and time bounds using `Intl.DateTimeFormat` in the job's configured timezone.
- `workers/jobWorker.js`: window checked before dispatch; out-of-window runs record a `SKIPPED` audit row with reason `outside-execution-window` and return early (lock is still released via `finally`).

### 4. `retryLimit` and `timeout` now applied
**Root cause:** Both fields were stored but never forwarded to BullMQ or the agent dispatcher.

**Fix:**
- `controllers/jobC.js`: all queue.add calls now include `attempts: (retryLimit ?? 0) + 1` and `backoff: { type: "exponential", delay: 2000 }`.
- `workers/jobWorker.js`: agent dispatch timeout is now `(timeout ?? 30) * 1000` ms (was hardcoded 10 000 ms).

### 5. Missing queue payload fields
**Root cause:** `notifications`, `jobName`, `executionWindow`, `timezone`, and `timeout` were destructured from `job.data` by the worker but were never included in the queue payload by the controller. Notifications were silently skipped on every run.

**Fix:** All four `queue.add` call sites in `controllers/jobC.js` now include all five fields.

### 6. Pre-existing environment test assertion
`tests/environment.test.js` used `toEqual` on the validated environment object but `environment.js` adds an `EMAIL_SMTP_PORT: "587"` Zod default not present in the test fixture. Changed to `toMatchObject`.

### 7. Dead code removed
`frontend/src/components/jobs/CreateJobModal.tsx` — stale 6-step wizard, imported nowhere, with unbound export-format checkboxes and no recipients input — deleted.

---

## Original Audit Items — Resolved Status

| Original gap | Status |
|---|---|
| HTTP job form fields (URL/method/headers) | Already implemented in `JobFormSlide.tsx` |
| Webhook URL field in job form | Already implemented in `JobFormSlide.tsx` |
| Notifications sending (email/webhook) | Already implemented in `notificationService.js` |
| Data sink config in UI | Already implemented in `JobFormSlide.tsx` |
| Execution window scheduling UI | Already implemented in `JobFormSlide.tsx` |
| Execution window enforced by worker | Fixed this session |
| Mongo sink field-name mismatch | Fixed this session |
| Sink exportFormat ignored | Fixed this session |
| retryLimit/timeout not applied | Fixed this session |
| Queue payload missing 5 fields | Fixed this session |
| Time-series analytics endpoint | Deferred — see below |
| Swagger path correction | Was never wrong — swagger.yaml already uses singular `/user/` |

---

## Deferred / Out of Scope

### DAG `dependsOn` UI
The backend fully implements DAG workflow dependencies (`dependsOn: [ObjectId]`), including circular-dependency detection and `dagStateManager`. The field is not exposed in the job form. Deferred for a dedicated workflow UX.

### Time-series analytics
`/admin/org-analytics` and `/admin/job-stats` return current-state snapshots and a single 24 h count. There is no bucketed time-series endpoint. `AdminAnalyticsPage.tsx` renders Bar/Pie charts of present-state counts only. To implement: aggregate `jobHistory` by time bucket in a new endpoint, plus a line/area chart on the frontend. Deferred.

### Active alerts / push notifications
`notifications.recipients` is persisted and email dispatch is implemented via `notificationService.js`. There is no in-app alert system or `/alerts` endpoint. Deferred.
