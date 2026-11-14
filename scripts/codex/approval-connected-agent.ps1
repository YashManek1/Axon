[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "../..")).Path
& node (Join-Path $PSScriptRoot "approval-connected-agent-orchestrator.mjs")
exit $LASTEXITCODE

<# Legacy implementation retained inert below this point.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location -LiteralPath $repoRoot
$runId = "approval-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))-$PID"
$evidenceDir = Join-Path $repoRoot "$EvidenceRoot/$runId"
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempDir = [IO.Path]::GetFullPath((Join-Path $tempBase "axon-$runId"))
if (-not $tempDir.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
    -not ([IO.Path]::GetFileName($tempDir)).StartsWith("axon-approval-", [StringComparison]::Ordinal)) {
    throw "Unsafe temporary path: $tempDir"
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$statePath = Join-Path $tempDir "state.json"
$agentEnvPath = Join-Path $tempDir "agent.env"
$reportPath = Join-Path $evidenceDir "connected-approval.json"
$setupPath = Join-Path $evidenceDir "fixture.json"

function Get-FreeTcpPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); return ([Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}
function Invoke-Checked([string]$Description, [scriptblock]$Command) {
    Write-Host "[approval] $Description"
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE" }
}
function Wait-Checked([string]$Description, [scriptblock]$Probe) {
    for ($i = 0; $i -lt 90; $i++) {
        & $Probe *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 1
    }
    throw "$Description did not become ready"
}

$env:NODE_ENV = "test"
$env:COMPOSE_PROJECT_NAME = "axon-approval-$PID"
$env:MONGO_PORT = [string](Get-FreeTcpPort)
$env:REDIS_PORT = [string](Get-FreeTcpPort)
$env:PORT = [string](Get-FreeTcpPort)
$env:MONGO_URI = "mongodb://axon_dev:axon_dev_secret@127.0.0.1:$($env:MONGO_PORT)/axon_r204_acceptance?authSource=admin"
$env:REDIS_URI = "redis://127.0.0.1:$($env:REDIS_PORT)/15"
$env:AXON_RUNTIME_URL = "http://127.0.0.1:$($env:PORT)"
$env:JWT_SECRET = "approval-disposable-jwt-secret-at-least-32-characters"
$env:ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$env:DISPATCH_SIGNING_KEY = "0123456789abcdef0123456789abcdef"
$env:AXON_RELEASE_ID = "approval-disposable-$(git rev-parse --short HEAD)"
$env:PROMETHEUS_BEARER_TOKEN = "approval-local-compose-token"
$env:GRAFANA_ADMIN_PASSWORD = "approval-local-compose-password"
$agentImage = "axon-agent-approval:$PID"
$agentContainer = "axon-approval-agent-$PID"
$journalVolume = "axon-approval-journal-$PID"
$agentCreated = $false
$journalCreated = $false
$stackCreated = $false
$failure = $null

try {
    if (@(docker compose ps -q).Count -ne 0) { throw "Disposable Compose project name already in use" }
    Invoke-Checked "start isolated MongoDB and Redis" { docker compose up -d mongodb redis }
    $stackCreated = $true
    Wait-Checked "MongoDB" { docker compose exec -T mongodb mongosh --quiet --username axon_dev --password axon_dev_secret --authenticationDatabase admin --eval "db.adminCommand('ping').ok" }
    Wait-Checked "Redis" { docker compose exec -T redis redis-cli ping }
    Invoke-Checked "build current backend" { docker compose build backend }
    Invoke-Checked "build current Linux agent" { docker build --target runtime --tag $agentImage agent }
    $sandboxImage = (& docker image inspect alpine:3.19 --format '{{index .RepoDigests 0}}').Trim()
    if ($LASTEXITCODE -ne 0 -or $sandboxImage -notmatch '^.+@sha256:[0-9a-f]{64}$') {
        throw "Immutable local alpine:3.19 sandbox image unavailable"
    }
    Invoke-Checked "seed disposable approval fixture" {
        node scripts/codex/r2-04-runtime-drill.mjs --phase setup --state $statePath --report $setupPath
    }
    $hostMongo = $env:MONGO_URI
    $hostRedis = $env:REDIS_URI
    try {
        $env:MONGO_URI = "mongodb://axon_dev:axon_dev_secret@mongodb:27017/axon_r204_acceptance?authSource=admin"
        $env:REDIS_URI = "redis://redis:6379/15"
        Invoke-Checked "start current backend" { docker compose up -d --force-recreate backend }
    }
    finally { $env:MONGO_URI = $hostMongo; $env:REDIS_URI = $hostRedis }
    Wait-Checked "backend health" { docker compose exec -T backend node healthcheck.js }
    $backendId = (& docker compose ps -q backend).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $backendId) { throw "Backend container not found" }
    $inspection = @(& docker inspect $backendId | ConvertFrom-Json)[0]
    $network = @($inspection.NetworkSettings.Networks.PSObject.Properties.Name)[0]
    if (-not $network) { throw "Backend network not found" }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    Invoke-Checked "create disposable agent journal" { docker volume create $journalVolume }
    $journalCreated = $true
    @(
        "SERVER_URL=http://backend:$($env:PORT)"
        "AGENT_ID=$($state.agentId)"
        "AGENT_API_KEY=$($state.apiKey)"
        "DISPATCH_SIGNING_KEY=$($env:DISPATCH_SIGNING_KEY)"
        "AXON_RELEASE_ID=$($env:AXON_RELEASE_ID)"
        "AXON_AGENT_JOURNAL_DIR=/var/lib/axon/journal"
        "AGENT_SANDBOX_MODE=docker"
        "AGENT_SANDBOX_DOCKER_IMAGE=$sandboxImage"
    ) | Set-Content -LiteralPath $agentEnvPath -Encoding utf8
    Invoke-Checked "start real connected Docker-contained agent" {
        docker run -d --name $agentContainer --network $network --group-add 0 --volume ("{0}:/var/lib/axon/journal" -f $journalVolume) --volume /var/run/docker.sock:/var/run/docker.sock --env-file $agentEnvPath $agentImage
    }
    $agentCreated = $true
    Invoke-Checked "exercise preview, approval, replay, and saved output" {
        node scripts/codex/approval-connected-agent.mjs $statePath $reportPath
    }
    Write-Host "[approval] PASS report: $reportPath"
}
catch {
    $failure = $_
    Write-Host "[approval] FAIL: $($_.Exception.Message)"
    throw
}
finally {
    if ($agentCreated) { & docker rm --force $agentContainer *> $null }
    if ($stackCreated) { & docker compose down --volumes --remove-orphans *> $null }
    if ($journalCreated) { & docker volume rm $journalVolume *> $null }
    if (Test-Path -LiteralPath $tempDir) {
        $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $tempDir).Path)
        if ($resolved.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
            ([IO.Path]::GetFileName($resolved)).StartsWith("axon-approval-", [StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
    if ($failure) { Write-Host "[approval] Isolated resources cleaned up after failure" }
}
#>
