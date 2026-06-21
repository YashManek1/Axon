# Axon Runbook

This runbook covers the local Docker Compose development stack and points to production steps. MongoDB runs without authentication in the dev stack for convenience; production must enable MongoDB authentication, TLS, and secret management (see [docs/deploy-azure.md](docs/deploy-azure.md)).

---

## Environment Variables

### Backend (`.env` in repo root, loaded by Docker Compose)

| Variable | Dev value | Description |
|----------|-----------|-------------|
| `MONGO_URI` | `mongodb://mongodb:27017/axon` | MongoDB connection string |
| `REDIS_URI` | `redis://redis:6379` | Redis connection string |
| `JWT_SECRET` | any 32+ char string | JWT signing key |
| `ENCRYPTION_KEY` | 64 hex characters | AES-256-GCM key for sink URIs |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `production` | Node environment |
| `LOG_LEVEL` | `info` | Pino log level |

See `backend/.env.development` for a fully annotated template.  
See `backend/.env.production` for the production template (Azure URIs).

### Frontend (Vite environment variables)

| Variable | Dev value | Description |
|----------|-----------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3000` | Backend REST base URL |
| `VITE_SOCKET_URL` | `http://localhost:3000` | Socket.IO server URL |

In dev, Vite's dev proxy forwards all API paths to `localhost:3000` — these env vars are only needed for cross-origin production builds.

```bash
# Production build with custom backend URL
cd frontend
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
```

---

## 1. Start The Full Stack

Create a local environment file:

```bash
cat > .env <<'EOF'
PORT=3000
MONGO_URI=mongodb://mongodb:27017/axon
REDIS_URI=redis://redis:6379
JWT_SECRET=change-this-development-secret-at-least-32-chars
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
LOG_LEVEL=info
NODE_ENV=production
EOF
```

Start the stack:

```bash
docker compose up -d --build
```

Expected output:

```text
Container axon-mongodb-1  Healthy
Container axon-redis-1    Healthy
Container axon-backend-1  Healthy
Container axon-frontend-1 Started
```

Verify health:

```bash
curl -s http://localhost:3000/admin/health
```

Expected output:

```json
{"status":"ok","dbConnected":true}
```

## 2. Register The First Organization And Admin User

Register a user and organization:

```bash
curl -s -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","email":"admin@example.com","password":"correct-password","orgName":"axon-demo","orgDescription":"Axon demo organization"}' \
  http://localhost:3000/user/register | tee register-response.json
```

Expected output:

```json
{"success":true,"message":"User registered successfully","user":{"email":"admin@example.com","role":"user"},"token":"..."}
```

Promote the first user to admin:

```bash
docker compose exec backend node --input-type=module -e "import mongoose from 'mongoose'; import User from './models/user.js'; await mongoose.connect(process.env.MONGO_URI); await User.updateOne({email:'admin@example.com'}, {$set:{role:'admin'}}); await mongoose.disconnect(); console.log('admin promoted');"
```

Expected output:

```text
admin promoted
```

Create an organization API key for agent self-registration:

```bash
export ORG_API_KEY="dev-org-api-key-change-me"
docker compose exec backend node --input-type=module -e "import mongoose from 'mongoose'; import bcrypt from 'bcrypt'; import Organization from './models/organization.js'; await mongoose.connect(process.env.MONGO_URI); await Organization.updateOne({name:'axon-demo'}, {$set:{apiKeyHash: await bcrypt.hash(process.env.ORG_API_KEY || 'dev-org-api-key-change-me', 10)}}); await mongoose.disconnect(); console.log('org api key set');"
```

Expected output:

```text
org api key set
```

Login as admin:

```bash
curl -s -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"correct-password"}' \
  http://localhost:3000/user/login | tee login-response.json
```

Expected output:

```json
{"success":true,"message":"Login successful","user":{"email":"admin@example.com","role":"admin"},"token":"..."}
```

## 3. Register And Connect The First Agent

Register an agent:

```bash
curl -s \
  -H "Content-Type: application/json" \
  -H "X-Axon-API-Key: ${ORG_API_KEY}" \
  -d '{"name":"local-agent-01","hardwareUuid":"local-dev-machine"}' \
  http://localhost:3000/agents/register | tee agent-registration.json
```

Expected output:

```json
{"agentId":"...","apiKey":"...","instructions":"Set AGENT_ID and AGENT_API_KEY in your .env file"}
```

Run the agent locally:

```bash
export SERVER_URL=http://localhost:3000
export AGENT_ID="$(node -pe "require('./agent-registration.json').agentId")"
export AGENT_API_KEY="$(node -pe "require('./agent-registration.json').apiKey")"
cd agent
cargo run
```

Expected output:

```text
connected to Axon control plane
heartbeat sent
```

Run the agent with Docker Compose instead:

```bash
cat > .env.agent <<EOF
SERVER_URL=http://backend:3000
AGENT_ID=$(node -pe "require('./agent-registration.json').agentId")
AGENT_API_KEY=$(node -pe "require('./agent-registration.json').apiKey")
EOF
docker compose --profile agent up -d agent
```

Expected output:

```text
Container axon-agent-1 Started
```

## 4. Create And Run A Test Job

Create a shell job:

```bash
export TOKEN="$(node -pe "require('./login-response.json').token")"
curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"hello-shell","type":"shell","schedule":"* * * * *","payload":{"command":"echo hello from axon"},"enabled":true}' \
  http://localhost:3000/jobs/createJob | tee job-response.json
```

Expected output:

```json
{"message":"Job created successfully","job":{"name":"hello-shell","type":"shell"}}
```

Run the job now:

```bash
export JOB_ID="$(node -pe "require('./job-response.json').job._id")"
curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/jobs/runJobNow/${JOB_ID}
```

Expected output:

```json
{"message":"Job triggered manually"}
```

## 5. View The Audit Log

```bash
curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/audit/job/${JOB_ID}
```

Expected output:

```json
[{"jobId":"...","status":"COMPLETED","command":"echo hello from axon"}]
```

## 6. Rotate An Agent API Key

```bash
export AGENT_ID="$(node -pe "require('./agent-registration.json').agentId")"
curl -s -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/agents/${AGENT_ID}/rotate-key | tee rotated-agent-key.json
```

Expected output:

```json
{"agentId":"...","apiKey":"..."}
```

Update the running agent with the new key:

```bash
export AGENT_API_KEY="$(node -pe "require('./rotated-agent-key.json').apiKey")"
```

Expected output: no output; the environment variable is updated for the next agent start.

## 7. Read Logs Of A Running Job

Get the latest audit run:

```bash
export AUDIT_ID="$(curl -s -H "Authorization: Bearer ${TOKEN}" http://localhost:3000/audit/job/${JOB_ID} | node -e "let d=''; process.stdin.on('data', c => d += c); process.stdin.on('end', () => console.log(JSON.parse(d)[0]._id));")"
```

Fetch buffered logs:

```bash
curl -s \
  -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/audit/run/${AUDIT_ID}/logs
```

Expected output:

```json
[{"stream":"stdout","line":"hello from axon","timestampMs":1710000000000}]
```

The frontend also streams live logs on:

```text
http://localhost/dashboard/jobs/${JOB_ID}
```

---

## 8. Production Deployment (Azure)

See [docs/deploy-azure.md](docs/deploy-azure.md) for the full guide. Quick reference:

```bash
# Build and push backend image to Azure Container Registry
az acr login --name axonregistry
docker build -t axonregistry.azurecr.io/axon-backend:latest ./backend
docker push axonregistry.azurecr.io/axon-backend:latest

# Update the Container App to the new image
az containerapp update \
  --name axon-backend \
  --resource-group axon-prod \
  --image axonregistry.azurecr.io/axon-backend:latest

# Build frontend for production
cd frontend
VITE_API_BASE_URL=https://api.yourdomain.com npm run build
# Then deploy dist/ to Azure Static Web Apps (wired via GitHub Actions)
```

Rust agents on remote machines: see [docs/deploy-azure.md — Rust Agent Distribution](docs/deploy-azure.md#rust-agent-distribution).

---

## 9. Running Tests

```bash
# Backend tests
cd backend && npm test -- --coverage

# Frontend tests + type check
cd frontend && npm test -- --run && npx tsc -b

# Agent tests
cd agent && cargo test
```

CI runs all three automatically on push to main. See `.github/workflows/ci.yml`.
