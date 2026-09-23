[CmdletBinding()]
param(
    [string]$EvidenceRoot = ".codex/evidence",
    [switch]$SkipImages,
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location -LiteralPath $repoRoot

$sourceSha = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to resolve the source Git SHA." }
$dirtyEntries = @(& git status --porcelain --untracked-files=all)
if (-not $AllowDirty -and $dirtyEntries.Count -gt 0) {
    throw "Matched-release acceptance requires a clean working tree. Commit the implementation first or use -AllowDirty for development-only diagnosis."
}
if ($SkipImages) {
    throw "-SkipImages cannot produce R2-04 release acceptance. The Linux image gates are mandatory."
}

$startedAt = [DateTime]::UtcNow
$stamp = $startedAt.ToString("yyyyMMddTHHmmssfffZ")
$runId = "$stamp-$PID-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$evidenceDir = Join-Path $repoRoot "$EvidenceRoot/r2-04-$runId"
New-Item -ItemType Directory -Path $evidenceDir -ErrorAction Stop | Out-Null
$manifestPath = Join-Path $evidenceDir "manifest.json"

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = [IO.Path]::GetFullPath((Join-Path $tempBase "axon-r204-$runId"))
if (-not $tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
    -not ([IO.Path]::GetFileName($tempRoot)).StartsWith("axon-r204-", [StringComparison]::Ordinal)) {
    throw "Refusing unsafe temporary path: $tempRoot"
}
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$durabilityState = Join-Path $tempRoot "durability-state.json"
$runtimeState = Join-Path $tempRoot "runtime-state.json"
$agentEnvPath = Join-Path $tempRoot "agent.env"
$reports = [ordered]@{
    durabilitySeed = Join-Path $evidenceDir "01-durability-seed.json"
    durabilityVerify = Join-Path $evidenceDir "02-durability-verify.json"
    runtimeSetup = Join-Path $evidenceDir "03-runtime-setup.json"
    agentGeneration1 = Join-Path $evidenceDir "04-agent-generation-1.json"
    success = Join-Path $evidenceDir "05-runtime-success.json"
    agentGeneration2Mismatch = Join-Path $evidenceDir "06-agent-generation-2-mismatch.json"
    releaseMismatch = Join-Path $evidenceDir "07-release-mismatch.json"
    releaseMismatchContainment = Join-Path $evidenceDir "08-release-mismatch-containment.json"
    agentGeneration3 = Join-Path $evidenceDir "09-agent-generation-3.json"
    restartAcknowledged = Join-Path $evidenceDir "10-restart-acknowledged.json"
    restartContainmentBefore = Join-Path $evidenceDir "11-restart-containment-before.json"
    agentGeneration4 = Join-Path $evidenceDir "12-agent-generation-4.json"
    restartUnknown = Join-Path $evidenceDir "13-restart-unknown.json"
    restartContainmentAfter = Join-Path $evidenceDir "14-restart-containment-after.json"
    agentGeneration5 = Join-Path $evidenceDir "15-agent-generation-5.json"
    timeout = Join-Path $evidenceDir "16-timeout-descendant.json"
    timeoutContainmentAfter = Join-Path $evidenceDir "17-timeout-containment-after.json"
    agentJournalLinuxTests = Join-Path $evidenceDir "18-agent-journal-linux-tests.log"
    preUpgradeQuiesce = Join-Path $evidenceDir "19-pre-upgrade-quiesce.json"
    candidateGeneration = Join-Path $evidenceDir "20-candidate-generation.json"
    candidateResume = Join-Path $evidenceDir "21-candidate-resume.json"
    candidateSuccess = Join-Path $evidenceDir "22-candidate-success.json"
    preRollbackQuiesce = Join-Path $evidenceDir "23-pre-rollback-quiesce.json"
    rollbackGeneration = Join-Path $evidenceDir "24-rollback-generation.json"
    rollbackResume = Join-Path $evidenceDir "25-rollback-resume.json"
    rollbackSuccess = Join-Path $evidenceDir "26-rollback-success.json"
    restartObservation = Join-Path $evidenceDir "27-restart-idempotent-observation.json"
    restartBlocked = Join-Path $evidenceDir "28-restart-hold-blocks-dispatch.json"
    restartBlockedContainment = Join-Path $evidenceDir "29-restart-blocked-containment.json"
}

function Get-FreeTcpPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

$runtimePort = Get-FreeTcpPort
$mongoHostPort = Get-FreeTcpPort
$redisHostPort = Get-FreeTcpPort
$composeProject = "axon-r204-$PID"
$env:NODE_ENV = "test"
$env:COMPOSE_PROJECT_NAME = $composeProject
$env:MONGO_PORT = [string]$mongoHostPort
$env:REDIS_PORT = [string]$redisHostPort
$env:MONGO_URI = "mongodb://axon_dev:axon_dev_secret@127.0.0.1:$mongoHostPort/axon_r204_acceptance?authSource=admin"
$env:REDIS_URI = "redis://127.0.0.1:$redisHostPort/15"
$env:JWT_SECRET = "r204-acceptance-jwt-secret-at-least-32-characters"
$env:ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$env:DISPATCH_SIGNING_KEY = "0123456789abcdef0123456789abcdef"
$env:AXON_RELEASE_ID = $sourceSha
$env:PROMETHEUS_BEARER_TOKEN = "r204-local-compose-token"
$env:GRAFANA_ADMIN_PASSWORD = "r204-local-compose-password"
$env:PORT = [string]$runtimePort
$env:AXON_RUNTIME_URL = "http://127.0.0.1:$runtimePort"

$shortSha = $sourceSha.Substring(0, 12)
$agentImage = "axon-agent-r204-runtime:$shortSha"
$agentTestImage = "axon-agent-r204-test:$shortSha"
$agentContainer = "axon-r204-agent-$PID"
$sentinelContainer = "axon-r204-unrelated-sentinel-$PID"
$journalVolume = "axon-r204-journal-$PID"
$sandboxImage = $null
$backendStarted = $false
$agentCreated = $false
$sentinelCreated = $false
$volumeCreated = $false
$acceptanceError = $null

function Invoke-Checked {
    param([string]$Description, [scriptblock]$Command)
    Write-Host "[R2-04] $Description"
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

function Wait-Command {
    param(
        [string]$Description,
        [scriptblock]$Probe,
        [int]$Attempts = 60,
        [int]$DelayMilliseconds = 1000
    )
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        & $Probe *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
    throw "$Description did not become ready in time."
}

function Invoke-RuntimeDrill {
    param(
        [string]$Phase,
        [string]$Report,
        [string]$Scenario,
        [int]$Generation
    )
    $arguments = @(
        "scripts/codex/r2-04-runtime-drill.mjs",
        "--phase", $Phase,
        "--state", $runtimeState,
        "--report", $Report
    )
    if ($Scenario) { $arguments += @("--scenario", $Scenario) }
    if ($Generation -gt 0) { $arguments += @("--generation", [string]$Generation) }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "Runtime drill phase '$Phase' failed with exit code $LASTEXITCODE." }
}

function Start-AcceptanceBackend {
    param([string]$ReleaseId)
    $hostMongo = $env:MONGO_URI
    $hostRedis = $env:REDIS_URI
    $hostRelease = $env:AXON_RELEASE_ID
    try {
        $env:MONGO_URI = "mongodb://axon_dev:axon_dev_secret@mongodb:27017/axon_r204_acceptance?authSource=admin"
        $env:REDIS_URI = "redis://redis:6379/15"
        $env:AXON_RELEASE_ID = $ReleaseId
        Invoke-Checked "Starting backend release $ReleaseId" {
            docker compose up -d --force-recreate backend
        }
        $script:backendStarted = $true
    }
    finally {
        $env:MONGO_URI = $hostMongo
        $env:REDIS_URI = $hostRedis
        $env:AXON_RELEASE_ID = $hostRelease
    }
    Wait-Command "Backend health for release $ReleaseId" { docker compose exec -T backend node healthcheck.js }
}

function Stop-AcceptanceBackend {
    if ($script:backendStarted) {
        Invoke-Checked "Stopping backend to quiesce dispatch" { docker compose stop backend }
        $script:backendStarted = $false
    }
}

function Start-AcceptanceAgent {
    param([string]$ReleaseId)
    $state = Get-Content -LiteralPath $runtimeState -Raw | ConvertFrom-Json
    @(
        "SERVER_URL=http://backend:$runtimePort"
        "AGENT_ID=$($state.agentId)"
        "AGENT_API_KEY=$($state.apiKey)"
        "DISPATCH_SIGNING_KEY=$($env:DISPATCH_SIGNING_KEY)"
        "AXON_RELEASE_ID=$ReleaseId"
        "AXON_AGENT_JOURNAL_DIR=/var/lib/axon/journal"
        "AGENT_SANDBOX_MODE=docker"
        "AGENT_SANDBOX_DOCKER_IMAGE=$script:sandboxImage"
    ) | Set-Content -LiteralPath $agentEnvPath -Encoding utf8
    Invoke-Checked "Starting trusted agent release $ReleaseId with Docker containment access" {
        docker run -d --name $agentContainer --network $script:networkName --group-add 0 --volume ("{0}:/var/lib/axon/journal" -f $journalVolume) --volume /var/run/docker.sock:/var/run/docker.sock --env-file $agentEnvPath $agentImage
    }
    $script:agentCreated = $true
}

function Remove-AcceptanceAgent {
    if ($script:agentCreated) {
        & docker rm --force $agentContainer *> $null
        $script:agentCreated = $false
    }
}

function Get-AxonManagedContainerIds {
    @(& docker ps -aq --filter "label=com.axon.execution-owner" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Assert-ContainmentState {
    param(
        [int]$ExpectedManagedCount,
        [string]$Report,
        [string]$Checkpoint
    )
    $managed = @(Get-AxonManagedContainerIds)
    if ($managed.Count -ne $ExpectedManagedCount) {
        throw "Containment checkpoint '$Checkpoint' expected $ExpectedManagedCount Axon-managed containers, found $($managed.Count): $($managed -join ', ')"
    }
    $sentinelRunning = (& docker inspect --format '{{.State.Running}}' $sentinelContainer 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $sentinelRunning -ne 'true') {
        throw "Unrelated sentinel did not survive containment checkpoint '$Checkpoint'."
    }
    $managedSecurity = @()
    foreach ($containerId in $managed) {
        $inspection = @(& docker inspect $containerId | ConvertFrom-Json)[0]
        if ($LASTEXITCODE -ne 0 -or -not $inspection) {
            throw "Unable to inspect Axon-managed container '$containerId' at '$Checkpoint'."
        }
        if ($ExpectedManagedCount -gt 0 -and -not $inspection.State.Running) { throw "Managed container '$containerId' is not running at '$Checkpoint'." }
        $mounts = @($inspection.Mounts)
        $mountDestinations = @($mounts | ForEach-Object { [string]$_.Destination })
        $networkMode = [string]$inspection.HostConfig.NetworkMode
        $capDrop = @($inspection.HostConfig.CapDrop)
        $securityOpt = @($inspection.HostConfig.SecurityOpt)
        $ownerLabel = [string]$inspection.Config.Labels.'com.axon.execution-owner'
        if ($networkMode -ne 'none' -or -not $inspection.HostConfig.ReadonlyRootfs -or
            $capDrop -notcontains 'ALL' -or $securityOpt -notcontains 'no-new-privileges' -or
            $mounts.Count -ne 0 -or
            [string]::IsNullOrWhiteSpace($ownerLabel)) {
            throw "Managed container '$containerId' violated the command containment contract at '$Checkpoint'."
        }
        $managedSecurity += [ordered]@{
            containerId = $containerId
            ownerLabel = $ownerLabel
            networkMode = $networkMode
            readOnlyRootFilesystem = [bool]$inspection.HostConfig.ReadonlyRootfs
            capDrop = $capDrop
            securityOptions = $securityOpt
            mountDestinations = $mountDestinations
        }
    }
    [ordered]@{
        checkpoint = $Checkpoint
        expectedManagedCount = $ExpectedManagedCount
        managedContainerIds = $managed
        managedContainerSecurity = $managedSecurity
        unrelatedSentinel = $sentinelContainer
        unrelatedSentinelRunning = $true
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Report -Encoding utf8
}

try {
    Invoke-Checked "Starting isolated MongoDB and Redis dependencies" { docker compose up -d mongodb redis }
    Wait-Command "MongoDB" {
        docker compose exec -T mongodb mongosh --quiet --username axon_dev --password axon_dev_secret --authenticationDatabase admin --eval "db.adminCommand('ping').ok"
    }
    Wait-Command "Redis" { docker compose exec -T redis redis-cli ping }

    Invoke-Checked "Building backend from source SHA $shortSha" { docker compose build backend }
    Invoke-Checked "Building the Linux agent runtime image from source SHA $shortSha" {
        docker build --target runtime --tag $agentImage agent
    }
    Invoke-Checked "Running Linux agent tests and strict Clippy in the image build" {
        docker build --target test --tag $agentTestImage agent
    }
    Invoke-Checked "Pulling the command sandbox base image" { docker pull alpine:3.19 }
    $sandboxImage = (& docker image inspect alpine:3.19 --format '{{index .RepoDigests 0}}').Trim()
    if ($LASTEXITCODE -ne 0 -or $sandboxImage -notmatch '^.+@sha256:[0-9a-f]{64}$') {
        throw "Unable to resolve an immutable command sandbox image digest."
    }
    $journalTests = @(
        "journal::tests::identical_active_duplicate_does_not_create_another_attempt"
        "journal::tests::identical_terminal_duplicate_replays_stored_result"
        "journal::tests::conflicting_attempt_id_reuse_is_rejected"
        "journal::tests::startup_recovers_received_and_running_attempts_as_unknown"
    )
    $journalEvidence = [Collections.Generic.List[string]]::new()
    foreach ($journalTest in $journalTests) {
        $journalEvidence.Add("=== $journalTest ===")
        $testOutput = @(& docker run --rm --entrypoint cargo $agentTestImage test --locked $journalTest -- --exact --nocapture 2>&1)
        $testExit = $LASTEXITCODE
        foreach ($line in $testOutput) { $journalEvidence.Add([string]$line) }
        if ($testExit -ne 0) {
            $journalEvidence | Set-Content -LiteralPath $reports.agentJournalLinuxTests -Encoding utf8
            throw "Linux journal test '$journalTest' failed with exit code $testExit."
        }
    }
    $journalEvidence | Set-Content -LiteralPath $reports.agentJournalLinuxTests -Encoding utf8
    $containmentTest = "sandbox::tests::docker_recovery_covers_crash_windows_and_preserves_sentinel"
    $journalEvidence.Add("=== $containmentTest ===")
    $containmentOutput = @(& docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock --env AXON_RUN_DOCKER_CONTAINMENT_TESTS=1 --env ("AXON_TEST_DOCKER_IMAGE={0}" -f $sandboxImage) --entrypoint cargo $agentTestImage test --locked $containmentTest -- --exact --nocapture 2>&1)
    $containmentExit = $LASTEXITCODE
    foreach ($line in $containmentOutput) { $journalEvidence.Add([string]$line) }
    $journalEvidence | Set-Content -LiteralPath $reports.agentJournalLinuxTests -Encoding utf8
    if ($containmentExit -ne 0) {
        throw "Linux Docker containment recovery test failed with exit code $containmentExit."
    }


    Invoke-Checked "Seeding persistence generation 1" {
        node scripts/codex/r2-04-live-drill.mjs --phase seed --state $durabilityState --report $reports.durabilitySeed
    }
    Invoke-Checked "Restarting the real Redis container" { docker compose restart redis }
    Wait-Command "Redis after restart" { docker compose exec -T redis redis-cli ping }
    Invoke-Checked "Verifying Redis restart, loss recovery, migration, and TTL overlap" {
        node scripts/codex/r2-04-live-drill.mjs --phase verify --state $durabilityState --report $reports.durabilityVerify
    }

    Invoke-RuntimeDrill -Phase "setup" -Report $reports.runtimeSetup

    Start-AcceptanceBackend -ReleaseId $sourceSha

    $backendContainer = (& docker compose ps -q backend).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $backendContainer) { throw "Unable to resolve the backend container." }
    $backendInspect = @(& docker inspect $backendContainer | ConvertFrom-Json)[0]
    $networkName = @($backendInspect.NetworkSettings.Networks.PSObject.Properties.Name)[0]
    if (-not $networkName) { throw "Unable to resolve the backend Docker network." }

    Invoke-Checked "Creating an isolated persistent agent journal volume" { docker volume create $journalVolume }
    $volumeCreated = $true
    Invoke-Checked "Starting an unrelated sentinel container" {
        docker run -d --name $sentinelContainer --network none $sandboxImage sh -c "while :; do sleep 60; done"
    }
    $sentinelCreated = $true

    Start-AcceptanceAgent -ReleaseId $sourceSha
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.agentGeneration1 -Generation 1
    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.success -Scenario "success"

    Remove-AcceptanceAgent
    Start-AcceptanceAgent -ReleaseId "r204-deliberate-mismatch"
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.agentGeneration2Mismatch -Generation 2
    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.releaseMismatch -Scenario "mismatch"
    Assert-ContainmentState -ExpectedManagedCount 0 -Report $reports.releaseMismatchContainment -Checkpoint "release-mismatch"

    Remove-AcceptanceAgent
    Start-AcceptanceAgent -ReleaseId $sourceSha
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.agentGeneration3 -Generation 3
    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.timeout -Scenario "timeout"
    Wait-Command "owned timeout descendant cleanup" {
        $count = @(Get-AxonManagedContainerIds).Count
        $global:LASTEXITCODE = if ($count -eq 0) { 0 } else { 1 }
    }
    Assert-ContainmentState -ExpectedManagedCount 0 -Report $reports.timeoutContainmentAfter -Checkpoint "after-timeout"

    Remove-AcceptanceAgent
    Stop-AcceptanceBackend
    Invoke-RuntimeDrill -Phase "reconcile-quiesced" -Report $reports.preUpgradeQuiesce -Scenario "pre-upgrade"

    $candidateReleaseId = "$sourceSha-r204-candidate"
    Start-AcceptanceBackend -ReleaseId $candidateReleaseId
    Start-AcceptanceAgent -ReleaseId $candidateReleaseId
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.candidateGeneration -Generation 4
    Invoke-RuntimeDrill -Phase "verify-resume" -Report $reports.candidateResume -Scenario "pre-upgrade"
    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.candidateSuccess -Scenario "candidate"

    Remove-AcceptanceAgent
    Stop-AcceptanceBackend
    Invoke-RuntimeDrill -Phase "reconcile-quiesced" -Report $reports.preRollbackQuiesce -Scenario "pre-rollback"

    Start-AcceptanceBackend -ReleaseId $sourceSha
    Start-AcceptanceAgent -ReleaseId $sourceSha
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.rollbackGeneration -Generation 5
    Invoke-RuntimeDrill -Phase "verify-resume" -Report $reports.rollbackResume -Scenario "pre-rollback"
    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.rollbackSuccess -Scenario "rollback"

    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.restartAcknowledged -Scenario "restart"

    Wait-Command "one active Axon-owned command container" {
        $count = @(Get-AxonManagedContainerIds).Count
        $global:LASTEXITCODE = if ($count -eq 1) { 0 } else { 1 }
    }
    Assert-ContainmentState -ExpectedManagedCount 1 -Report $reports.restartContainmentBefore -Checkpoint "before-agent-restart"
    Invoke-Checked "Restarting the agent during an acknowledged execution" { docker restart $agentContainer }
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.agentGeneration4 -Generation 6
    Invoke-RuntimeDrill -Phase "verify-restart" -Report $reports.restartUnknown
    Wait-Command "owned command cleanup after agent restart" {
        $count = @(Get-AxonManagedContainerIds).Count
        $global:LASTEXITCODE = if ($count -eq 0) { 0 } else { 1 }
    }
    Assert-ContainmentState -ExpectedManagedCount 0 -Report $reports.restartContainmentAfter -Checkpoint "after-agent-restart"

    Invoke-Checked "Restarting the reconciled agent a second time" { docker restart $agentContainer }
    Invoke-RuntimeDrill -Phase "wait-agent" -Report $reports.agentGeneration5 -Generation 7
    Invoke-RuntimeDrill -Phase "verify-restart" -Report $reports.restartObservation

    Invoke-RuntimeDrill -Phase "dispatch" -Report $reports.restartBlocked -Scenario "blocked"
    Assert-ContainmentState -ExpectedManagedCount 0 -Report $reports.restartBlockedContainment -Checkpoint "after-blocked-dispatch"

    $mongoVersion = (& docker compose exec -T mongodb mongosh --quiet --username axon_dev --password axon_dev_secret --authenticationDatabase admin --eval "db.version()").Trim()
    $redisVersion = (& docker compose exec -T redis redis-server --version).Trim()
    $composeImages = @(& docker compose images --format json)
    $status = if ($dirtyEntries.Count -eq 0) { "passed" } else { "diagnostic-passed" }
    $manifest = [ordered]@{
        milestone = "R2-04"
        status = $status
        sourceSha = $sourceSha
        releaseId = $sourceSha
        workingTreeClean = ($dirtyEntries.Count -eq 0)
        protocolVersion = 2
        startedAt = $startedAt.ToString("o")
        finishedAt = [DateTime]::UtcNow.ToString("o")
        topology = [ordered]@{
            mongo = "127.0.0.1:$mongoHostPort/axon_r204_acceptance"
            mongoVersion = $mongoVersion
            redis = "127.0.0.1:$redisHostPort/15"
            redisVersion = $redisVersion
            redisPersistence = "appendonly yes"
            backendPort = $runtimePort
            dockerNetwork = $networkName
            agentJournalVolume = "ephemeral-owned-volume"
            sandboxImage = $sandboxImage
            trustedAgentDockerSocket = "mounted-only-on-agent"
            commandContainerNetwork = "none"
            linuxAgentValidation = "docker-test-target"
        }
        assertions = @(
            "redis_restart_restores_scoped_state"
            "redis_loss_and_ahead_generation_fail_closed"
            "legacy_generation_migrates_monotonically"
            "ttl_overlap_is_fenced"
            "matched_release_executes_and_persists_output"
            "acknowledged_execution_restart_finishes_unknown"
            "unknown_target_hold_persists_and_blocks_redispatch"
            "containment_intent_is_persisted_before_create_and_reconciled_on_startup"
            "agent_restart_removes_the_exact_owned_command_container"
            "timeout_kills_descendants_and_leaves_zero_owned_command_containers"
            "unrelated_sentinel_survives_containment_reconciliation"
            "command_containers_receive_no_agent_journal_or_docker_socket"
            "linux_journal_tests_block_active_and_terminal_duplicate_delivery"
            "release_mismatch_is_rejected_before_agent_execution"
            "dispatch_is_quiesced_and_nonterminal_runs_are_reconciled_before_pair_changes"
            "matched_pair_release_configuration_rollback_preserves_generation_and_dispatch"
        )
        limitations = @(
            "The live restart and timeout drills prove owned-container cleanup and unrelated-container survival; exact active and terminal redelivery behavior is also proven by named Linux Rust unit tests."
            "The rollback drill uses identical immutable image bytes with distinct release IDs to verify quiesce, reconciliation, matched-pair ordering, monotonic generation, and resumed dispatch."
            "Restoring a separately built prior artifact digest remains a T21 release-bundle responsibility."
            "ACKNOWLEDGED or otherwise uncertain attempts are never redispatched automatically."
        )
        evidence = @($reports.Values | ForEach-Object { Split-Path -Leaf $_ })
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    if ($status -eq "passed") {
        Write-Host "[R2-04] Matched-release live acceptance passed. Evidence: $manifestPath"
    }
    else {
        Write-Host "[R2-04] Development diagnostic passed; a clean-tree rerun is required. Evidence: $manifestPath"
    }
}
catch {
    $acceptanceError = $_
    $failure = [ordered]@{
        milestone = "R2-04"
        status = "failed"
        sourceSha = $sourceSha
        workingTreeClean = ($dirtyEntries.Count -eq 0)
        startedAt = $startedAt.ToString("o")
        finishedAt = [DateTime]::UtcNow.ToString("o")
        error = $_.Exception.Message
        evidence = @($reports.Values | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Split-Path -Leaf $_ })
    }
    $failure | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Warning "R2-04 acceptance failed. Evidence: $manifestPath"
}
finally {
    Remove-AcceptanceAgent
    if ($sentinelCreated) {
        & docker rm --force $sentinelContainer *> $null
        $sentinelCreated = $false
    }
    if ($backendStarted) {
        & docker compose stop backend *> $null
        $backendStarted = $false
    }
    if ($volumeCreated) { & docker volume rm --force $journalVolume *> $null }
    & docker compose down --volumes --remove-orphans *> $null
    if (Test-Path -LiteralPath $tempRoot) {
        $resolvedTemp = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $tempRoot).Path)
        if ($resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
            ([IO.Path]::GetFileName($resolvedTemp)).StartsWith("axon-r204-", [StringComparison]::Ordinal)) {
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
        else {
            Write-Warning "Temporary cleanup refused unsafe path: $resolvedTemp"
        }
    }
}
if ($acceptanceError) { throw $acceptanceError }
