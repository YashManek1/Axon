# Axon deployment readiness checklist

Reviewed 9 September 2026 against the available working files. This is a read-only readiness investigation; no deployment, image push, service start, credential change or installation was performed. Files were changing concurrently, so this report is a snapshot and must be rechecked after integration.

### Production Compose follow-up — 23 September 2026

The local `docker-compose.prod.yml` override now uses Compose reset/override semantics for development builds, dependencies, environment and published ports. A configuration-only merge with an explicit empty synthetic `--env-file NUL`, synthetic release inputs, and `--no-env-resolution` passed: the default model contains backend, frontend, Grafana and Prometheus, but no local MongoDB, Redis or agent; backend/frontend use image references without inherited builds; the backend has only the production env file, no inherited explicit MongoDB/Redis URI, no local database dependency, and one loopback `43123:3000` port; frontend has one loopback `18080:80` port. Separate negative renders rejected missing `BACKEND_IMAGE`, `FRONTEND_IMAGE` and `AXON_RELEASE_ID`. `git diff --check` passed. No service was started and no real secret or production env file was read.

This corrects the earlier *local merged-service-model* finding below; that table remains the 9 September snapshot, not current proof of a customer installation. The override still requires a protected `backend/.env.production` with external data endpoints and all base-file interpolation secrets (including `GRAFANA_ADMIN_PASSWORD` while Grafana is enabled). The opt-in `local-data-only` profile still inherits development-style data-service settings. Image provenance/digests, clean-host startup, HTTPS/WSS ingress, monitoring authentication, real multi-host Linux behavior, backup/restore, and upgrade/rollback acceptance remain separate gates. Do not deploy from this render alone.

### Local dependency follow-up — 10 September 2026

At Yash's request, Docker Desktop was started to restore the existing local Redis service for backend verification. Startup initially failed on stale Windows socket reparse points. The socket-only directories `C:\Users\Yash\AppData\Local\Docker\run` and `C:\Users\Yash\AppData\Local\docker-secrets-engine` were preserved under dated `*-stale-*` names so Docker could recreate them. No container, image, volume or credential was removed. The existing `axon-redis-1` container then started automatically; `docker --context desktop-linux exec axon-redis-1 redis-cli ping` returned `PONG`, and its inspected health was `healthy` (both commands exited 0).

This supersedes the earlier local-daemon availability limitation only. It does not verify production Compose startup, the Linux Rust agent, end-to-end execution, backup/restore or a customer deployment. The existing development Redis publishes port 6379 on all host interfaces; the private-network release requirement below remains unchanged.

## Decision and supported scope

The base Compose file is a local development stack. The production override is not ready to use as a customer install until the merge, health, release and reproducibility gates below are repaired and rechecked. The safest initial product shape from the technical release plan is one customer-owned installation, one backend replica, one MongoDB deployment, one Redis deployment, one same-origin HTTPS entry point and a small fixed Linux agent fleet (the plan currently says up to five agents). This is a bounded pilot, not high availability.

Do not claim a second backend replica, automatic failover, a 99.9% SLA, automatic rollback of arbitrary external commands, or unattended workflow automation from the current files. Socket routing and dispatch ownership are process-local, and external effects need reconciliation even when application data is restored.

## Current facts and blockers

| Priority | Evidence | Readiness consequence | Required gate |
|---|---|---|---|
| P1 / T19 | `docker-compose.prod.yml:13-20` sets `deploy.replicas: 0`; `:33` uses `depends_on: {}`. A fresh merged render still contains backend dependencies on `mongodb` and `redis`, and the disabled `mongodb`/`redis` services remain in the model. Base `backend.environment` at `docker-compose.yml:40-47` is explicit, so it can override values supplied by the production `env_file`. The two textual backend port entries do not always produce two runtime mappings: synthetic `PORT=3000` renders one `3000:3000`, while synthetic `PORT=43123` renders both `43123:43123` and `43123:3000`. | Production can retain local service dependencies and, for a non-default port, publish an additional backend target despite the override comment. The effective merged configuration still differs from the documented production intent. | Use a standalone reviewed pilot manifest, or explicit Compose reset/replace semantics. Render the merged configuration with an explicit synthetic `--env-file` and `--no-env-resolution`; verify only intended services, private ports and production DB/Redis endpoints remain. |
| P1 / T20 | Fresh source confirms `backend/controllers/adminC.js:11-24` always returns HTTP 200 on the normal path and reports only Mongo `readyState`; it does not check Redis. `backend/healthcheck.js:5-15` marks any 2xx response healthy, and Compose/Dockerfile use that script. No dependency-outage run was performed. | A platform can route traffic to a service that cannot persist or queue work. | Implement and test separate liveness and bounded readiness checks for MongoDB and Redis. Verify outage behavior and that liveness does not cause a restart loop. |
| P1 / T21 | CI builds backend, agent and frontend images (`.github/workflows/ci.yml:96-101`) but pushes only the backend (`:102-108`). Deploy updates only backend and uses mutable `latest` (`.github/workflows/deploy.yml:28-33`). Agent releases are a separate tag workflow (`.github/workflows/release.yml:3-6`) and are not gated by the CI test jobs. | There is no guaranteed matched frontend/backend/agent bundle and no reliable rollback identity. | Publish a versioned manifest with immutable image digests, agent protocol compatibility, checksums and smoke-test evidence. Gate publication and deployment on the tested revision. |
| P1 / T22 | Frontend Docker builder is `node:20-alpine` (`frontend/Dockerfile:1`), while CI uses Node 22 (`.github/workflows/ci.yml:73-77`). CI runs frontend tests and `tsc -b` (`:66-84`) but has no lint step. The prior audit recorded frontend test/lint failures; the round-1 acceptance report now records fresh `npm.cmd test -- --run` (4 files/14 tests), lint and production build exits 0, with only the existing bundle-size warning. | Build and quality environments differ; the release gate can publish code that is not cleanly verified by lint, and the Docker/CI Node versions differ. | Keep the repaired frontend checks green, add lint to CI, and align the supported Node version and lockfile install before publication. |
| P1 | Frontend nginx listens on HTTP only (`frontend/nginx.conf:1-3`), proxies WebSockets with upgrade headers (`:8-17`) and routes selected API paths (`:19-25`). | TLS is not terminated by this container. A reverse proxy or managed ingress must provide HTTPS/WSS, preserve Upgrade headers and route the same backend path. | Verify an HTTPS browser login, API call and Socket.IO connection through the actual ingress. Build the frontend with the production API/socket origin; `docker-compose.prod.yml` does not define a frontend build argument and uses pre-built images. |
| P1 | Base Compose publishes MongoDB and Redis on all host interfaces (`docker-compose.yml:5-6`, `:23-24`) and supplies development credentials (`:9-11`). | Base Compose is unsuitable as a public production boundary. | Keep DB/Redis on a private network, require authenticated/TLS endpoints, and expose only the intended HTTPS ingress. |
| P1 | Backend and agent examples require `DISPATCH_SIGNING_KEY` to match. Fresh source shows the Rust agent reads `SERVER_URL`, `AGENT_ID`, `AGENT_API_KEY` and optional `AGENT_SHORT_TOKEN` (`agent/src/main.rs:21-69`); `agent/src/connection.rs:163-168` uses a non-empty short token for Socket.IO auth and falls back to the long-lived API key only when the short token is empty. An auth rejection does not clear or automatically re-enroll a non-empty token. The README manual setup/table says `CONTROL_PLANE_URL` (`README.md:372-373, 409-415`), which does not match the executable configuration variable. | An agent cannot be reliably installed from the documented variable names, and a long-lived bootstrap credential must not be confused with the short-lived JWT. | Align the installer/docs to `SERVER_URL`, register each agent, store the long-lived key and refreshed short token outside source and command history, test rotation/revocation and expired-token recovery, set an explicit sandbox mode and allow only outbound DNS/TLS to the authorized endpoint (normally WSS on 443). |
| P1 before automation | The release plan notes that MongoDB transactions require a replica set or transaction-capable deployment; the local Mongo service is a standalone `mongo:7` container (`docker-compose.yml:2-17`). | Automation using transactions/outbox behavior cannot assume the current local topology. | Select and document the supported Mongo topology, persistence, backup and restore procedure before enabling that automation. |

## Clean-host installation checklist

Before a customer pilot, save a sanitized preflight record containing:

1. A supported Linux distribution and architecture, Docker Engine and Compose plugin versions, synchronized time, DNS and outbound HTTPS access, available storage, service account ownership and the host's allowed ingress/egress ports.
2. A release manifest identifying exact backend/frontend/agent image digests or binary checksums, schema version and compatible agent protocol range. Do not use `latest` as the install or rollback identifier.
3. A private MongoDB deployment with authentication, tested persistence and backups; a private authenticated Redis deployment with the durability level agreed for BullMQ. Decide whether Mongo transactions are required and test the selected topology.
4. Instance-specific secrets: `MONGO_URI`, `REDIS_URI`, `JWT_SECRET` (at least 32 characters), `ENCRYPTION_KEY` (exactly 64 hex characters), `DISPATCH_SIGNING_KEY` (at least 32 hex characters), `PROMETHEUS_BEARER_TOKEN` and, if Grafana is retained, `GRAFANA_ADMIN_PASSWORD`. Keep production values in a secret manager or protected runtime injection; do not create `backend/.env.production` from committed examples with placeholders.
5. A same-origin HTTPS endpoint with a valid certificate, HTTP-to-HTTPS policy, WebSocket Upgrade forwarding and a documented public API/socket origin. Confirm the compiled frontend points to that origin.
6. Agent enrollment records (`AGENT_ID`, long-lived `AGENT_API_KEY` held only for bootstrap, refreshed `AGENT_SHORT_TOKEN` JWT, `SERVER_URL`, matching signing key), a local action allow-list and explicit sandbox choice. Confirm the customer permits outbound WSS/TLS and has no requirement for inbound agent ports. The current README uses `CONTROL_PLANE_URL`, but the executable reads `SERVER_URL`.
7. Operational ownership: named responder, certificate and secret rotation owners, external uptime/queue/agent monitoring, backup freshness alerts, disk monitoring and a tested notification route.

The current product plan supports a staffed bounded pilot. It requires a synthetic successful action, nonzero-exit action, timeout, offline target and revocation test through the real UI/API/agent path before customer work. A failed or unresolved attempt must remain visibly unresolved until reconciled; restore must not blindly replay an unsafe external effect.

## Safe checks and operator commands

These commands inspect local prerequisites or render configuration; they do not start services:

Run the synthetic render in a shell with the listed interpolation variables unset, or set them to the same synthetic values in the command environment. Exported shell variables take precedence over `--env-file`; that flag alone does not isolate inherited environment values. The temporary render is inspection output, not a production manifest.

```bash
docker version
docker compose version
docker compose config --help | grep -E -- '--no-env-resolution|--no-interpolate'

# Create this outside the repository with synthetic values only. Include every
# variable used for Compose interpolation; never copy a real .env file here.
cat > /tmp/axon-compose-synthetic.env <<'EOF'
PORT=43123
BACKEND_IMAGE=synthetic/backend:review
FRONTEND_IMAGE=synthetic/frontend:review
MONGO_URI=mongodb://synthetic.invalid:27017/axon
REDIS_URI=redis://synthetic.invalid:6379
PROMETHEUS_BEARER_TOKEN=synthetic-prometheus-token
GRAFANA_ADMIN_PASSWORD=synthetic-grafana-password
EOF

docker compose --env-file /tmp/axon-compose-synthetic.env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  config --quiet --no-env-resolution
docker compose --env-file /tmp/axon-compose-synthetic.env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  config --no-env-resolution --format json > /tmp/axon-compose-render.json
```

The help output in this review confirmed that both `--no-env-resolution` and `--no-interpolate` are supported by Compose v5.1.4. `--no-interpolate` by itself only disables interpolation; when used without an explicit `--env-file` and `--no-env-resolution`, it does not prove that a real project `.env` or service `env_file` was not considered. Use the explicit synthetic file and `--no-env-resolution` for a safe merged render. Review only redacted service names, dependencies, ports and image references. The current render still has inherited backend `depends_on`; with synthetic `PORT=43123` it has both `43123:43123` and `43123:3000`, while synthetic `PORT=3000` collapses to one `3000:3000`. A required production env file and live connectivity still need a separate clean-host check after the manifest is corrected.

After an approved release is installed on an isolated test host, the operator can use commands of this form (substitute the real HTTPS host and release identifier, and save sanitized output):

```bash
curl --fail --silent --show-error https://<host>/admin/health
docker compose ps
docker compose logs --tail=100 backend frontend
```

The health response alone is not acceptance evidence until readiness semantics are fixed. Verify WebSockets in the browser or with an approved WebSocket client through the TLS ingress; a plain HTTP curl does not test the Upgrade path. Use `openssl rand -hex 32` only to generate new values into a protected secret store, never to print or commit production secrets.

## Backup, restore, upgrade and rollback gates

Before installation, back up MongoDB, required Redis/BullMQ state or its declared recovery equivalent, and the separately protected encryption/signing material according to the customer's retention policy. Restore to a clean isolated host and verify users, jobs, audit history, configuration and agent identity handling. Record the backup point and observed restore time; the release plan's provisional target is recovery within four staffed hours with no more than 24 hours of durable history loss, subject to customer agreement.

For an upgrade, pause new dispatch, drain or reconcile active work, take a backup, apply schema changes with a documented compatibility window, verify agent versions and run synthetic smoke tests before resuming. Roll back images only when data and protocol versions are compatible. Otherwise restore into isolation and reconcile external effects manually. Do not promise that an application rollback reverses a command already executed on a customer server.

## Recommended fix order

1. Replace or repair the production Compose manifest and prove the merged configuration with synthetic values (T19); remove public DB/Redis/backend exposure and make production secret injection unambiguous.
2. Add distinct liveness/readiness behavior and test dependency outages (T20).
3. Produce one versioned, digest-pinned release bundle containing the tested backend, frontend and compatible agent artifacts; gate CI publication and deployment on the same revision (T21).
4. Keep the accepted frontend test/lint/build fixes green, add lint to CI, and align Node versions (T22).
5. Exercise the real TLS/WSS ingress, agent enrollment/revocation, sandbox policy and bounded synthetic actions on a clean Linux host.
6. Restore a backup and perform an upgrade/rollback drill before accepting customer data. Document unresolved external effects and operator ownership.

## Evidence collected and limitations

Checked: `docker-compose.yml`, `docker-compose.prod.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `agent/Dockerfile`, `agent/src/main.rs`, `agent/src/connection.rs`, `backend/healthcheck.js`, `backend/controllers/adminC.js`, `frontend/nginx.conf`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/release.yml`, `.env.example`, `backend/.env.example`, README installation/configuration sections, `docs/agents/deployment-luna.md`, `AGENTS.md`, T19–T22 in `docs/axon-technical-audit-and-release-plan-2026-09-09.md`, and the current round-1 acceptance/live TODO reports. The required installer search matched only `backend/backend-install.log`; no installer-like file was found. The local existence checks found `.env` and `backend/.env.production`, but neither file was read; `.env.agent` was absent.

Observed checks:

- `docker version --format '{{.Client.Version}}'` returned client `29.6.1`; the daemon check failed because the Docker Engine named pipe was unavailable. No container started.
- `docker compose version` returned `v5.1.4` and reported a permissions warning while reading the user's Docker config.
- `docker compose config --help` confirmed that this Compose version supports both `--no-env-resolution` and `--no-interpolate`.
- `docker compose -f docker-compose.yml config --quiet --no-interpolate` and the corresponding base-plus-production command each exited 0. These were structural parse checks only. Because they did not use an explicit synthetic `--env-file` and `--no-env-resolution`, they do not prove that project or service env files were not considered.
- With an explicit temporary synthetic env file and `--no-env-resolution`, base-plus-production `config --quiet` exited 0 and JSON render exited 0. The render contained services `backend, frontend, grafana, mongodb, prometheus, redis`; backend retained `depends_on: mongodb, redis`; Mongo/Redis had `deploy.replicas: 0`; backend had both `.env` and `backend/.env.production` env-file entries; and synthetic Mongo/Redis URIs were present in the explicit environment. No real env value was printed or read. A synthetic `PORT=3000` rendered one backend mapping (`3000:3000`); synthetic `PORT=43123` rendered two (`43123:43123`, `43123:3000`).
- `rg --files --hidden -g '*install*' -g '!node_modules/**' -g '!**/target/**' -g '!.git/**'` exited 0 and returned only `backend/backend-install.log`; the matching file is a log, not an installer.
- The round-1 acceptance report records fresh frontend checks: `npm.cmd test -- --run` exited 0 with 4 files/14 tests passed; `npm.cmd run lint` exited 0 with no errors or warnings; and `npm.cmd run build` exited 0 with 2,444 modules transformed. The build emitted the existing main-bundle size warning (947.07 kB / 272.61 kB gzip). These are separate accepted verification results; this deployment review did not rerun frontend commands.
- No image build, pull, start, deployment, cloud inventory, backup/restore, TLS handshake, WebSocket session, vulnerability scan, load test or GitHub CI run was performed.

The audit reference is planning evidence, not production proof. Re-run this checklist against the integrated release files and retain the clean-host, smoke, restore and rollback records before moving from demonstration to a paid pilot.
