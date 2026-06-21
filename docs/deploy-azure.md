# Axon — Azure Deployment Guide

> This guide replaces the previous Render-based deployment. Azure is now the canonical production target.  
> Last updated: 2026-06-03

---

## Architecture Overview

```
Internet
   │
   ▼
Azure Static Web Apps (frontend, free tier)
   │  HTTPS  VITE_API_BASE_URL
   ▼
Azure Container Apps — backend (Node.js, auto-scale 0→N)
   │
   ├── Azure Cache for Redis (BullMQ queues, distributed lock)
   └── Azure Cosmos DB for MongoDB (vCore) or MongoDB Atlas on Azure
         │
         └── Azure Key Vault (JWT_SECRET, ENCRYPTION_KEY, connection strings)
```

Rust agents run on **remote machines** (customer servers, your own VMs) — they dial outbound to the Container App backend on port 443. No inbound ports required on agent machines.

---

## Prerequisites

- Azure CLI: `az login`
- Docker + `az acr login`
- A resource group: `az group create -n axon-prod -l eastus`

---

## Step 1 — Azure Container Registry (ACR)

```bash
az acr create \
  --resource-group axon-prod \
  --name axonregistry \
  --sku Basic

az acr login --name axonregistry
```

**Cost:** Basic tier ~$5/month. Includes 10 GB storage.

Tag and push images after every successful CI build (see CI/CD section below):

```bash
docker tag axon-backend:latest axonregistry.azurecr.io/axon-backend:latest
docker push axonregistry.azurecr.io/axon-backend:latest
```

---

## Step 2 — Azure Key Vault (secrets)

```bash
az keyvault create \
  --name axon-vault \
  --resource-group axon-prod \
  --location eastus

# Store secrets — replace with real values
az keyvault secret set --vault-name axon-vault --name JWT-SECRET \
  --value "$(openssl rand -hex 32)"

az keyvault secret set --vault-name axon-vault --name ENCRYPTION-KEY \
  --value "$(openssl rand -hex 32)"

az keyvault secret set --vault-name axon-vault --name MONGO-URI \
  --value "mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/axon"

az keyvault secret set --vault-name axon-vault --name REDIS-URI \
  --value "rediss://<user>:<pass>@<host>:6380"
```

> **Trick:** Use Key Vault references in Container Apps (`@Microsoft.KeyVault(...)`) so secrets are fetched at runtime — never baked into images or env files.

---

## Step 3 — Data Layer

### Option A: Azure Cosmos DB for MongoDB (vCore) — Recommended for Azure-native
```bash
az cosmosdb create \
  --name axon-cosmos \
  --resource-group axon-prod \
  --kind MongoDB \
  --server-version 7.0 \
  --capabilities EnableMongoDBVectorSearch

# Get connection string
az cosmosdb keys list --name axon-cosmos --resource-group axon-prod --type connection-strings
```

**Cost (Burstable tier, M10):** ~$57/month for low-traffic workloads. Scale up to M20/M30 as needed.

**Trick:** Use the **Burstable M10** tier for staging/low-traffic — it provides 2 vCores with burst capability. Only upgrade when p99 latency grows.

### Option B: MongoDB Atlas on Azure (Easier migration path)
- Sign up at cloud.mongodb.com → create an M0 (free) or M10 cluster in Azure East US
- Whitelist the Container Apps egress IP range (or use VNet integration)
- Use the Atlas connection string as `MONGO_URI`

**Cost:** M10 ~$57/month, same ballpark. Atlas has better operational tooling (profiler, Atlas Search).

### Azure Cache for Redis
```bash
az redis create \
  --name axon-redis \
  --resource-group axon-prod \
  --location eastus \
  --sku Basic \
  --vm-size c0

# Get the connection string
az redis list-keys --name axon-redis --resource-group axon-prod
```

**Cost:** Basic C0 ~$16/month. Supports up to 250 MB data.

**Trick:** For Axon's BullMQ use case (job queues + distributed lock + telemetry buffer), C0 is sufficient unless you have thousands of concurrent jobs. The queues are transient — data loss on Redis restart is acceptable if BullMQ retries are configured (they are, via exponential backoff in `backend/config/queue.js`).

> **When to upgrade to Standard C1 ($30/month):** when you need Redis replication (HA) + persistence guarantees. BullMQ's `opts.removeOnComplete` keeps Redis memory bounded regardless of tier.

---

## Step 4 — Backend Container App

### Create Container Apps environment
```bash
az containerapp env create \
  --name axon-env \
  --resource-group axon-prod \
  --location eastus
```

### Deploy the backend
```bash
az containerapp create \
  --name axon-backend \
  --resource-group axon-prod \
  --environment axon-env \
  --image axonregistry.azurecr.io/axon-backend:latest \
  --registry-server axonregistry.azurecr.io \
  --ingress external --target-port 3000 \
  --min-replicas 0 --max-replicas 5 \
  --cpu 0.5 --memory 1Gi \
  --env-vars \
    NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    MONGO_URI=secretref:mongo-uri \
    REDIS_URI=secretref:redis-uri \
    JWT_SECRET=secretref:jwt-secret \
    ENCRYPTION_KEY=secretref:encryption-key \
  --secrets \
    mongo-uri="$(az keyvault secret show --vault-name axon-vault --name MONGO-URI --query value -o tsv)" \
    redis-uri="$(az keyvault secret show --vault-name axon-vault --name REDIS-URI --query value -o tsv)" \
    jwt-secret="$(az keyvault secret show --vault-name axon-vault --name JWT-SECRET --query value -o tsv)" \
    encryption-key="$(az keyvault secret show --vault-name axon-vault --name ENCRYPTION-KEY --query value -o tsv)"
```

### Custom domain + managed TLS
```bash
az containerapp hostname add \
  --name axon-backend \
  --resource-group axon-prod \
  --hostname api.yourdomain.com

az containerapp hostname bind \
  --name axon-backend \
  --resource-group axon-prod \
  --hostname api.yourdomain.com \
  --validation-method CNAME
```

Azure Container Apps provisions a free managed TLS cert (via Let's Encrypt) automatically.

---

## Step 5 — Frontend (Azure Static Web Apps)

```bash
az staticwebapp create \
  --name axon-frontend \
  --resource-group axon-prod \
  --location eastus2 \
  --sku Free \
  --source https://github.com/YashManek1/Axon \
  --branch main \
  --app-location frontend \
  --output-location dist \
  --login-with-github
```

This wires up automatic GitHub Actions deploys from the `frontend/` directory.

**Set the production API URL** in the Static Web App app settings:
```bash
az staticwebapp appsettings set \
  --name axon-frontend \
  --resource-group axon-prod \
  --setting-names VITE_API_BASE_URL=https://api.yourdomain.com VITE_SOCKET_URL=https://api.yourdomain.com
```

**Cost:** Free tier = $0/month for up to 100 GB bandwidth/month.

---

## Step 6 — CI/CD Integration

Add the following secrets to your GitHub repository (`Settings → Secrets`):
- `AZURE_CREDENTIALS` — service principal JSON (from `az ad sp create-for-rbac`)
- `ACR_LOGIN_SERVER` — `axonregistry.azurecr.io`
- `ACR_USERNAME`, `ACR_PASSWORD` — from `az acr credential show`

Then extend `.github/workflows/ci.yml` build job **or** create a new `deploy.yml`:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Azure

on:
  push:
    branches: [main]

env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []  # add: [backend-test, frontend-test, agent-test] once wired
    steps:
      - uses: actions/checkout@v4

      - name: Azure login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Login to ACR
        run: az acr login --name axonregistry

      - name: Build & push backend
        run: |
          docker build -t axonregistry.azurecr.io/axon-backend:${{ github.sha }} ./backend
          docker push axonregistry.azurecr.io/axon-backend:${{ github.sha }}
          docker tag axonregistry.azurecr.io/axon-backend:${{ github.sha }} axonregistry.azurecr.io/axon-backend:latest
          docker push axonregistry.azurecr.io/axon-backend:latest

      - name: Update Container App
        run: |
          az containerapp update \
            --name axon-backend \
            --resource-group axon-prod \
            --image axonregistry.azurecr.io/axon-backend:${{ github.sha }}
```

---

## Rust Agent Distribution

Rust agents run on remote machines — they are not hosted on Azure. Distribute the agent binary via the GitHub Release workflow (`release.yml`). On each target machine:

```bash
# Download the latest agent binary from GitHub Releases
curl -sSL https://github.com/YashManek1/Axon/releases/latest/download/axon-agent-linux-x86_64 -o /usr/local/bin/axon-agent
chmod +x /usr/local/bin/axon-agent

# Create .env.agent
cat > /etc/axon-agent.env <<EOF
AGENT_ID=<agent_id from registration>
AGENT_API_KEY=<api_key from registration>
CONTROL_PLANE_URL=wss://api.yourdomain.com
EOF

# Install as systemd service
cat > /etc/systemd/system/axon-agent.service <<EOF
[Unit]
Description=Axon Remote Execution Agent
After=network.target

[Service]
EnvironmentFile=/etc/axon-agent.env
ExecStart=/usr/local/bin/axon-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl enable axon-agent
systemctl start axon-agent
```

---

## Cost Estimation

### Minimal Production Setup (low traffic, dev/staging)

| Resource | SKU | Monthly Cost |
|----------|-----|-------------|
| Azure Container Registry | Basic | ~$5 |
| Azure Container Apps (backend) | 0.5 vCPU / 1 GiB, scale-to-zero | ~$0–$15 (pay per use) |
| Azure Cache for Redis | Basic C0 | ~$16 |
| Cosmos DB for MongoDB | Burstable M10 | ~$57 |
| Azure Static Web Apps | Free | $0 |
| Azure Key Vault | Standard | ~$0.03/10k ops |
| **Total** | | **~$78–$95/month** |

> With scale-to-zero on Container Apps, if the backend gets <100K requests/month the compute cost is near $0.

### HA Production Setup (always-on, multi-zone)

| Resource | SKU | Monthly Cost |
|----------|-----|-------------|
| Azure Container Registry | Standard | ~$20 |
| Azure Container Apps (backend) | 1 vCPU / 2 GiB, min-replicas=1, max=10 | ~$50–$120 |
| Azure Cache for Redis | Standard C1 (replicated) | ~$60 |
| Cosmos DB for MongoDB | M20 vCore | ~$115 |
| Azure Static Web Apps | Standard | $9 |
| Azure Key Vault | Standard | ~$1 |
| **Total** | | **~$255–$325/month** |

---

## Cost Reduction Tricks

1. **Scale-to-zero** (`--min-replicas 0`): Container Apps don't charge when idle. Set `min-replicas 1` only if you need sub-second cold-start (first request after idle has ~1-2s latency with 0 min replicas).

2. **Burstable Redis C0 vs Standard C1**: Unless you need Redis replication (HA), Basic C0 is fine for Axon's workload. BullMQ is resilient to Redis restarts via job persistence — the queue is not a cache.

3. **Cosmos DB vCore vs MongoDB Atlas**: For Azure-native deployments, Cosmos DB vCore is roughly the same price as Atlas M10 but with tighter Azure integration (Entra auth, Private Endpoint in same VNet). If you already use Atlas, stay there.

4. **Single region**: Running in a single Azure region eliminates cross-region data transfer costs (~$0.08/GB). Only add geo-replication when SLA requires <1h RPO.

5. **Reserved Instances**: For always-on workloads (min-replicas ≥ 1), purchase Container Apps Committed Use Discounts for 20–40% savings over pay-as-you-go.

6. **Turn off Redis AOF persistence for BullMQ-only use**: If Redis holds only job queues (not session data), you can disable `appendonly yes` in Redis config. Jobs lost on Redis restart will be requeued by BullMQ's stalled-job recovery. Saves some disk I/O cost.

7. **ACR lifecycle policy**: Add an ACR retention policy to auto-delete untagged images older than 30 days — prevents storage bloat.

8. **Static Web Apps free tier**: Always use the Free tier for the frontend. It supports custom domains, managed TLS, and GitHub Actions deploys. Only upgrade to Standard ($9/month) if you need staging environments or API backends tied to SWA.

---

## Health Check and Monitoring

The backend exposes `GET /admin/health` (no auth required). Use it as the Container Apps liveness probe:

```bash
az containerapp ingress update \
  --name axon-backend \
  --resource-group axon-prod \
  --transport auto

# Liveness/readiness is configured via the app's healthcheck.js
# (already in the Dockerfile HEALTHCHECK directive)
```

For observability, add Azure Monitor application insights:
```bash
az monitor app-insights component create \
  --app axon-insights \
  --location eastus \
  --resource-group axon-prod

# Get instrumentation key and add to Container App env:
# APPLICATIONINSIGHTS_CONNECTION_STRING=...
```

---

## Security Hardening Checklist

- [ ] MongoDB auth enabled (Atlas: always on; Cosmos: Entra auth or connection string with credentials)
- [ ] Redis TLS enabled (`rediss://` URI, not `redis://`)
- [ ] Container App ingress set to `external` (HTTPS only) with HTTP→HTTPS redirect
- [ ] Key Vault RBAC: only the Container App's managed identity has `Get` on secrets
- [ ] ACR admin account disabled — use managed identity for pulls
- [ ] Agent API keys rotated on any suspected compromise (`POST /agents/:id/rotate-key`)
- [ ] `ENCRYPTION_KEY` backed up securely — losing it means losing all encrypted sink URIs
- [ ] Review `npm audit` output (12 vulnerabilities flagged in backend CI) — address high-severity ones
