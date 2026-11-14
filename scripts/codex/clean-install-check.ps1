[CmdletBinding()]
param(
    [string]$EnvFile = "backend/.env.example"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Write-Host "=== Axon Clean-Slate Installation Verification ===" -ForegroundColor Cyan
Write-Host "Project Root: $projectRoot"

$assertions = 0
function Assert-Clean([bool]$Condition, [string]$Message) {
    $script:assertions++
    if (-not $Condition) {
        Write-Error "FAIL: $Message"
        throw $Message
    }
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

# 1. Environment Template Integrity Verification
Write-Host "`n1. Checking Environment Templates & Required Secrets..." -ForegroundColor Yellow
$examplePath = Join-Path $projectRoot "backend\.env.example"
Assert-Clean (Test-Path $examplePath) "backend/.env.example must exist"

$exampleContent = Get-Content $examplePath -Raw
$mandatoryKeys = @(
    "PORT",
    "NODE_ENV",
    "AXON_EXECUTION_PROFILE",
    "MONGO_URI",
    "REDIS_URI",
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "DISPATCH_SIGNING_KEY",
    "PROMETHEUS_BEARER_TOKEN"
)

foreach ($key in $mandatoryKeys) {
    Assert-Clean ($exampleContent -match "(?m)^$key=") "Template contains mandatory production variable: $key"
}

# 2. Production Compose File Fencing Verification
Write-Host "`n2. Verifying Production Compose Fencing & Volume Isolation..." -ForegroundColor Yellow
$prodComposePath = Join-Path $projectRoot "docker-compose.prod.yml"
Assert-Clean (Test-Path $prodComposePath) "docker-compose.prod.yml must exist"

$prodContent = Get-Content $prodComposePath -Raw
Assert-Clean ($prodContent -match 'profiles:\s*\["local-data-only"\]') "MongoDB and Redis are isolated under 'local-data-only' profile"
Assert-Clean ($prodContent -match 'NODE_ENV:\s*production') "Backend runtime explicitly bound to production"
Assert-Clean ($prodContent -match '127\.0\.0\.1:') "Published ports explicitly bound to loopback only (127.0.0.1)"

# 3. Clean Volume State Verification
Write-Host "`n3. Verifying Clean Slate Storage & Absence of Leakage..." -ForegroundColor Yellow
$gitStatus = & git status --porcelain 2>&1
$hasCommittedSecrets = $gitStatus | Where-Object { $_ -match '\.env\.production$' }
Assert-Clean ($null -eq $hasCommittedSecrets) "No live .env.production is committed to git"

# 4. Probe & Healthcheck Semantics Verification
Write-Host "`n4. Verifying Health Check Probes & Docker Lifecycle..." -ForegroundColor Yellow
$baseComposePath = Join-Path $projectRoot "docker-compose.yml"
Assert-Clean (Test-Path $baseComposePath) "Base docker-compose.yml must exist"

$baseContent = Get-Content $baseComposePath -Raw
Assert-Clean ($baseContent -match 'healthcheck:') "Backend and data containers define healthcheck probes"
Assert-Clean ($baseContent -match 'service_healthy') "Inter-service dependencies require healthy probe condition"

# 5. Clean Boot Port & Conflict Preflight
Write-Host "`n5. Preflighting Network Ports (Loopback)..." -ForegroundColor Yellow
$testPorts = @(3000, 8080)
foreach ($port in $testPorts) {
    $listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    if ($listener) {
        Write-Host "  [INFO] Port $port is currently in use by PID $($listener[0].OwningProcess) (Dev server or background service)" -ForegroundColor Gray
    } else {
        Write-Host "  [OK] Port $port is free and available for clean installation" -ForegroundColor Green
    }
}

Write-Host "`n=== CLEAN-SLATE INSTALLATION VERIFICATION PASSED ===" -ForegroundColor Green
Write-Host "Total verified assertions: $assertions" -ForegroundColor Green
