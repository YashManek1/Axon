[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Snapshot', 'Backend', 'Frontend', 'Agent')]
    [string] $Check,
    [string[]] $BackendTests = @(),
    [switch] $SkipRedisPreflight,
    [ValidateRange(1, 3600)]
    [int] $CommandTimeoutSeconds = 600
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$evidenceRoot = Join-Path $projectRoot '.codex\evidence'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
$baseName = '{0}-{1}' -f $stamp, $Check.ToLowerInvariant()
$textLog = Join-Path $evidenceRoot ($baseName + '.log')
$jsonLog = Join-Path $evidenceRoot ($baseName + '.json')
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function Get-SourceFingerprint {
    $skipDirs = @('.git', '.codex', '.agents', '.claude', '.cursor', '.gemini', '.kiro', '.qoder', '.serena', '.vscode', '.antigravitycli', '.playwright-mcp', '.code-review-graph', 'node_modules', 'target', 'dist', 'coverage', 'graphify-out', 'logs', 'private')
    $names = @('package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'Cargo.toml', 'Cargo.lock', 'tsconfig.json', 'vite.config.js', 'vite.config.ts', 'vitest.config.js', 'vitest.config.ts')
    $extensions = @('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.rs', '.toml', '.ps1', '.yml', '.yaml', '.css', '.scss', '.html')
    $files = [Collections.Generic.List[IO.FileInfo]]::new()

    foreach ($rootName in @('backend', 'frontend', 'agent', 'scripts')) {
        $sourceRoot = Join-Path $projectRoot $rootName
        if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) { continue }
        $pending = [Collections.Generic.Stack[string]]::new()
        $pending.Push($sourceRoot)
        while ($pending.Count -gt 0) {
            foreach ($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
                if ($entry.PSIsContainer) {
                    if ($skipDirs -notcontains $entry.Name) { $pending.Push($entry.FullName) }
                    continue
                }
                if ($entry.Name -eq '.env' -or $entry.Name -like '.env.*') { continue }
                if ($entry.Name -match '\.(log|pem|key|pfx|p12)$' -or $entry.Name -match '^(id_rsa|id_ed25519)') { continue }
                if (($names -contains $entry.Name) -or ($extensions -contains $entry.Extension.ToLowerInvariant())) { $files.Add($entry) }
            }
        }
    }
    foreach ($rootName in @('AGENTS.md', 'docker-compose.yml', 'docker-compose.prod.yml')) {
        $rootFile = Join-Path $projectRoot $rootName
        if (Test-Path -LiteralPath $rootFile -PathType Leaf) { $files.Add((Get-Item -LiteralPath $rootFile)) }
    }

    $hash = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        foreach ($file in ($files | Sort-Object FullName -Unique)) {
            $relative = [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
            $fileHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            $hash.AppendData([Text.Encoding]::UTF8.GetBytes($relative + "`0" + $fileHash + "`n"))
        }
        [Convert]::ToHexString($hash.GetHashAndReset()).ToLowerInvariant()
    }
    finally { $hash.Dispose() }
}

function Test-RedisAvailable {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.ConnectAsync('127.0.0.1', 6379)
        $connect.Wait(750) -and $client.Connected
    }
    catch { $false }
    finally { $client.Dispose() }
}

function Invoke-RecordedCommand {
    param(
        [Parameter(Mandatory)][string] $FilePath,
        [Parameter(Mandatory)][string[]] $Arguments,
        [Parameter(Mandatory)][string] $WorkingDirectory,
        [hashtable] $EnvironmentChanges = @{}
    )
    $started = (Get-Date).ToUniversalTime()
    $resolved = Get-Command -Name $FilePath -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $resolved) {
        $message = "Required command was not found: $FilePath"
        Add-Content -LiteralPath $textLog -Value $message -Encoding utf8
        return [ordered]@{ command = @($FilePath) + $Arguments; workingDirectory = $WorkingDirectory; startedUtc = $started.ToString('o'); endedUtc = (Get-Date).ToUniversalTime().ToString('o'); exitCode = 127; timedOut = $false; timeoutSeconds = $CommandTimeoutSeconds; outputTail = @($message) }
    }

    $info = [Diagnostics.ProcessStartInfo]::new()
    $isBatch = [IO.Path]::GetExtension($resolved.Source) -in @('.cmd', '.bat')
    if ($isBatch) {
        $pwsh = Get-Command pwsh.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $pwsh) {
            $message = 'Required command was not found: pwsh.exe'
            Add-Content -LiteralPath $textLog -Value $message -Encoding utf8
            return [ordered]@{ command = @($FilePath) + $Arguments; workingDirectory = $WorkingDirectory; startedUtc = $started.ToString('o'); endedUtc = (Get-Date).ToUniversalTime().ToString('o'); exitCode = 127; timedOut = $false; timeoutSeconds = $CommandTimeoutSeconds; outputTail = @($message) }
        }
        $info.FileName = $pwsh.Source
        $wrapperPath = Join-Path $evidenceRoot 'invoke-batch.ps1'
        if (-not (Test-Path -LiteralPath $wrapperPath)) {
            [IO.File]::WriteAllText($wrapperPath, '& $args[0] @($args[1..($args.Count - 1)]); exit $LASTEXITCODE', [Text.UTF8Encoding]::new($false))
        }
        foreach ($item in @('-NoProfile', '-NonInteractive', '-File', $wrapperPath, $resolved.Source)) { [void]$info.ArgumentList.Add($item) }
    }
    else { $info.FileName = $resolved.Source }
    foreach ($argument in $Arguments) { [void]$info.ArgumentList.Add($argument) }
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.CreateNoWindow = $true
    foreach ($key in $EnvironmentChanges.Keys) {
        if ($null -eq $EnvironmentChanges[$key]) { [void]$info.Environment.Remove($key) }
        else { $info.Environment[$key] = [string]$EnvironmentChanges[$key] }
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $completed = $process.WaitForExit($CommandTimeoutSeconds * 1000)
        $timedOut = -not $completed
        if ($timedOut) {
            $process.Kill($true)
            $process.WaitForExit()
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($timedOut) { $stderr += "`nCommand timed out after $CommandTimeoutSeconds seconds." }
        $lines = [Collections.Generic.List[string]]::new()
        foreach ($line in (($stdout + "`n" + $stderr) -split '\r?\n')) { if ($line.Length -gt 0) { $lines.Add($line) } }
        Add-Content -LiteralPath $textLog -Value (@("COMMAND: $FilePath $($Arguments -join ' ')") + $lines) -Encoding utf8
        $tail = if ($lines.Count -eq 0) { @() } else { @($lines[[Math]::Max(0, $lines.Count - 30)..($lines.Count - 1)]) }
        $nativeExit = if ($timedOut) { 124 } else { $process.ExitCode }
        return [ordered]@{ command = @($FilePath) + $Arguments; workingDirectory = $WorkingDirectory; startedUtc = $started.ToString('o'); endedUtc = (Get-Date).ToUniversalTime().ToString('o'); exitCode = $nativeExit; timedOut = $timedOut; timeoutSeconds = $CommandTimeoutSeconds; outputTail = $tail }
    }
    catch {
        $message = $_.Exception.Message
        Add-Content -LiteralPath $textLog -Value $message -Encoding utf8
        return [ordered]@{ command = @($FilePath) + $Arguments; workingDirectory = $WorkingDirectory; startedUtc = $started.ToString('o'); endedUtc = (Get-Date).ToUniversalTime().ToString('o'); exitCode = 126; timedOut = $false; timeoutSeconds = $CommandTimeoutSeconds; outputTail = @($message) }
    }
    finally { $process.Dispose() }
}

$startedUtc = (Get-Date).ToUniversalTime()
$fingerprintBefore = Get-SourceFingerprint
$commands = [Collections.Generic.List[object]]::new()
$exitCode = 0
$status = 'passed'
$note = $null
try {
    switch ($Check) {
        'Snapshot' {
            $previous = Get-ChildItem -LiteralPath $evidenceRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
            $last = if ($previous) { try { $prior = Get-Content -LiteralPath $previous.FullName -Raw | ConvertFrom-Json; "$($prior.check):$($prior.status):$($prior.exitCode)" } catch { 'unreadable' } } else { 'none' }
            $note = "version=1 fingerprint=$fingerprintBefore last=$last"
            Add-Content -LiteralPath $textLog -Value $note -Encoding utf8
        }
        'Backend' {
            if (-not $SkipRedisPreflight -and -not (Test-RedisAvailable)) {
                $exitCode = 69
                $note = 'Redis preflight failed: 127.0.0.1:6379 is unavailable; no service was started.'
                Add-Content -LiteralPath $textLog -Value $note -Encoding utf8
                break
            }
            $hadMongo = Test-Path Env:MONGO_URI
            $savedMongo = $env:MONGO_URI
            try {
                Remove-Item Env:MONGO_URI -ErrorAction SilentlyContinue
                $result = Invoke-RecordedCommand npm.cmd (@('test', '--', '--maxWorkers=1', '--hookTimeout=10000') + $BackendTests) (Join-Path $projectRoot 'backend') @{ MONGO_URI = $null }
                $commands.Add($result)
                $exitCode = [int]$result.exitCode
            }
            finally { if ($hadMongo) { $env:MONGO_URI = $savedMongo } else { Remove-Item Env:MONGO_URI -ErrorAction SilentlyContinue } }
        }
        'Frontend' {
            foreach ($arguments in @(@('test', '--', '--run'), @('run', 'lint'), @('run', 'build'))) {
                $result = Invoke-RecordedCommand npm.cmd $arguments (Join-Path $projectRoot 'frontend')
                $commands.Add($result)
                $exitCode = [int]$result.exitCode
                if ($exitCode -ne 0) { break }
            }
        }
        'Agent' {
            foreach ($arguments in @(@('test', '--offline'), @('clippy', '--offline', '--', '-D', 'warnings'))) {
                $result = Invoke-RecordedCommand cargo.exe $arguments (Join-Path $projectRoot 'agent')
                $commands.Add($result)
                $exitCode = [int]$result.exitCode
                if ($exitCode -ne 0) { break }
            }
            $note = 'Agent check covers local offline unit tests and clippy; it does not validate a Linux release build.'
        }
    }
}
catch {
    $exitCode = 1
    $note = $_.Exception.Message
    Add-Content -LiteralPath $textLog -Value $note -Encoding utf8
}

$fingerprintAfter = Get-SourceFingerprint
$invalidated = $fingerprintBefore -ne $fingerprintAfter
if ($invalidated) {
    if ($exitCode -eq 0) { $exitCode = 73 }
    $status = 'invalidated'
    $note = 'Source changed while the check was running; discard this result and rerun.'
    Add-Content -LiteralPath $textLog -Value $note -Encoding utf8
}
elseif ($exitCode -ne 0) { $status = 'failed' }

$record = [ordered]@{ schemaVersion = 1; check = $Check; status = $status; exitCode = $exitCode; startedUtc = $startedUtc.ToString('o'); endedUtc = (Get-Date).ToUniversalTime().ToString('o'); projectRoot = $projectRoot; sourceFingerprint = $fingerprintBefore; endingSourceFingerprint = $fingerprintAfter; sourceChangedDuringCheck = $invalidated; commands = @($commands); note = $note; textLog = $textLog }
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonLog -Encoding utf8
Write-Output "Axon $Check check: $status (exit $exitCode)"
Write-Output "fingerprint: $fingerprintBefore"
Write-Output "evidence: $jsonLog"
if ($note) { Write-Output $note }
if ($exitCode -ne 0 -and $commands.Count -gt 0) {
    Write-Output 'failure tail:'
    $commands[$commands.Count - 1].outputTail | Select-Object -Last 30 | ForEach-Object { Write-Output $_ }
}
exit $exitCode