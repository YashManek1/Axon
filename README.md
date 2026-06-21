# Axon

Distributed orchestration platform for remote execution, workflow scheduling, and scalable task processing.

Axon is a multi-tenant distributed execution system that enables organizations to schedule, orchestrate, and execute jobs across remote machines with real-time telemetry, fault tolerance, and scalable infrastructure. It solves four specific production problems: duplicate cron execution at scale, SSH/firewall-blocked remote access, missing tamper-evident audit trails, and uncontrolled shell access.

---

# Features

## Distributed Scheduling Engine

* Redis-backed persistent scheduling using BullMQ
* Immediate and recurring job execution with exactly-once semantics via SETNX + content-addressed job IDs
* Retry logic with exponential backoff
* Fault-tolerant queue architecture
* Background worker processing

## Remote Execution via Rust Agents

* Lightweight Rust agents installed on remote systems
* **Outbound-only WebSocket over port 443** — no inbound ports, no VPN, no firewall changes required
* Remote shell and HTTP command execution
* Real-time log streaming over Socket.IO
* Heartbeat & telemetry monitoring (CPU/RAM every 5 seconds)
* Exponential reconnect backoff (1s → 30s) with offline job queuing

## Multi-Tenant Architecture

* Organization-scoped infrastructure
* Shared agent pools across teams
* Data isolation between organizations
* Role-aware workflow execution (admin / user)

## DAG-Based Workflow Orchestration

* Dependency-aware job execution
* Workflow chaining via `dependsOn` job references
* Circular dependency prevention
* Directed execution pipelines

## Real-Time Observability

* Live execution logs streamed over Socket.IO
* CPU/RAM telemetry per agent
* Agent online/offline tracking with 3-heartbeat miss threshold
* Job execution history with full audit records
* System monitoring dashboard

## Data Sink Pipelines

* Per-job MongoDB sink: export stdout/stderr to a configurable MongoDB collection
* CSV, JSON, and Excel export formats
* AES-256-GCM encrypted sink URIs

## Immutable Audit Trail

* AuditLog written **before** execution begins — records who triggered it, from where, and what command
* Immutable fields: `startedAt`, `jobId`, `orgId`, `triggeredBy` — enforced by Mongoose pre-save hook
* Satisfies SOC2 / ISO 27001 / HIPAA audit control requirements at the application layer

---

# Architecture

## Current System

```
Dashboard / UI (React 19 + Vite + TypeScript)
        │
        │  HTTPS REST + Socket.IO (TLS port 443)
        ▼
Node.js Control Plane (Express 5, ESM)
        │                     │
        │                     ▼
        │              Redis / BullMQ
        │              (queue · SETNX lock · telemetry buffer)
        │
        │  WebSocket — port 443, outbound from agent
        ▼
  ┌──────────────────────────────────────────┐
  │  Rust Agents  (Tokio · tungstenite)      │
  │  prod-us-east · prod-eu-west · customer  │
  │  WebSocket client only — no inbound ports│
  └──────────────────────────────────────────┘
```

**Data stores:**
- MongoDB (Mongoose) — jobs, users, orgs, agents, auditLogs, jobHistory
- Redis + BullMQ — `scheduled-jobs` + `immediate-jobs` queues, distributed locks, telemetry buffer

## Planned Architecture (roadmap)

The highest-throughput hot path — agent WebSocket connections + telemetry fan-out — will be extracted to a **Go gateway microservice**. Go's goroutine model handles thousands of concurrent long-lived connections O(1) per goroutine (~2KB stack) vs. Node's event-loop serialization.

```
Rust Agents ──ws──▶  Go Gateway (goroutine/agent)
                          │  Redis pub/sub (log chunks + telemetry)
                          ▼
                    Express / Socket.IO ──ws──▶ Dashboard UI
```

All CRUD, auth, job scheduling, and BullMQ workers remain in Node.js. Go handles only the agent-facing connection layer. See [docs/tech-audit.md](docs/tech-audit.md) for the full migration plan.

---

# Tech Stack

## Backend
* Node.js 22 + Express 5 (ESM modules)
* MongoDB (Mongoose ODM)
* Redis + BullMQ (queues + distributed locking)
* Socket.IO (bidirectional real-time, agent + UI connections)
* Pino (structured logging) + Zod (request validation) + JWT (auth)

## Agent Runtime
* Rust (stable toolchain)
* Tokio (async runtime)
* tokio-tungstenite (WebSocket client)
* serde / serde_json
* sys-info (CPU/RAM telemetry)

## Frontend
* React 19 + TypeScript
* Vite (rolldown-vite)
* Tailwind CSS v4 (CSS-first)
* Zustand (state management)
* TanStack React Query
* Recharts + Framer Motion

---

# Current Status

Implemented:
* Redis-backed BullMQ scheduling (immediate + recurring)
* Remote Rust agent execution via outbound WebSocket
* Socket.IO real-time log streaming
* Multi-tenant organization model with JWT auth
* Retry & failure handling with exponential backoff
* Agent heartbeat system + online/offline tracking
* Job history tracking + immutable audit log
* DAG-based job dependency management
* Data sink pipelines (MongoDB export)
* Admin dashboard (job stats, user stats, health check)

In Progress:
* Frontend responsiveness hardening (see [docs/tech-audit.md](docs/tech-audit.md))
* Cryptographic hash-chaining for audit trail tamper-evidence
* HTTP job form fields in UI (URL/method/headers for HTTP-type jobs)
* Webhook URL configuration in UI
* Go telemetry gateway extraction (planned)

---

# Local Development Setup

## Quick Start (Docker Compose — recommended)

```bash
# Clone and set up environment
git clone https://github.com/YashManek1/Axon.git
cd Axon

# Copy and fill environment files
cp backend/.env.development backend/.env
# Edit backend/.env with your secrets (see backend/.env.development for all vars)

# Start the full stack (MongoDB + Redis + backend + frontend)
docker compose up -d

# Frontend: http://localhost:80
# Backend API: http://localhost:3000
# See RUNBOOK.md for the full setup walkthrough
```

## Manual Setup (without Docker)

### Prerequisites
* Node.js 22+
* MongoDB 7 (local or Atlas)
* Redis 7
* Rust stable toolchain

### Backend
```bash
cd backend
cp .env.development .env      # edit with your local values
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Dev server at http://localhost:5173
# Proxies /user /jobs /admin /agents /audit /socket.io to localhost:3000
```

### Rust Agent
```bash
cd agent
cp .env.example .env.agent    # edit with AGENT_ID, AGENT_API_KEY, CONTROL_PLANE_URL
cargo run
```

---

# Environment Configuration

## Frontend

| Variable | Development | Production |
|----------|-------------|------------|
| `VITE_API_BASE_URL` | `http://localhost:3000` | `https://api.yourdomain.com` |
| `VITE_SOCKET_URL` | `http://localhost:3000` | `https://api.yourdomain.com` |

In development, Vite proxies all API paths to `localhost:3000` automatically — `VITE_API_BASE_URL` is used only for cross-origin production deployments.

For production builds:
```bash
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
```

## Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB connection string |
| `REDIS_URI` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Min 32 characters |
| `ENCRYPTION_KEY` | Yes | Exactly 64 hex characters |
| `PORT` | No | Default: 3000 |
| `NODE_ENV` | No | `development` / `production` |
| `LOG_LEVEL` | No | `debug` / `info` / `warn` |

See `backend/.env.development` (local) and `backend/.env.production` (template) for full examples.

---

# Deployment

**Production target: Microsoft Azure**

See [docs/deploy-azure.md](docs/deploy-azure.md) for the full guide including:
* Azure Container Apps (backend, auto-scale to zero)
* Azure Static Web Apps (frontend, free tier)
* Azure Cache for Redis + Cosmos DB for MongoDB
* Key Vault secret management
* CI/CD pipeline (`deploy.yml`)
* Cost table (minimal ~$80–$95/month, HA ~$255–$325/month)
* Cost-reduction tricks

---

# Documentation

| Document | Description |
|----------|-------------|
| [RUNBOOK.md](RUNBOOK.md) | Step-by-step operational guide: local setup, registration, running jobs |
| [docs/api-audit.md](docs/api-audit.md) | API coverage audit: what backend exposes vs. what frontend uses |
| [docs/tech-audit.md](docs/tech-audit.md) | Tech-level audit framed by the 4 pain points + Go roadmap |
| [docs/deploy-azure.md](docs/deploy-azure.md) | Azure deployment guide with costing |
| [backend/swagger.yaml](backend/swagger.yaml) | OpenAPI spec (partial — needs update, see api-audit.md) |

---

# Author

Yash Manek — Backend & Distributed Systems Engineer

Focused on: distributed systems · autonomous workflows · AI infrastructure · developer tooling
