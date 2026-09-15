[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runner = Join-Path -Path $PSScriptRoot -ChildPath 'axon-check.ps1'
$failures = [System.Collections.Generic.List[string]]::new()
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ('axon-check-test-' + [guid]::NewGuid().ToString('N'))

function Assert-True([bool] $Condition, [string] $Message) {
    if (-not $Condition) { $failures.Add($Message) }
}

try {
    $snapshotOutput = & pwsh.exe -NoProfile -NonInteractive -File $runner -Check Snapshot 2>&1
    $snapshotExit = $LASTEXITCODE
    Assert-True ($snapshotExit -eq 0) "Snapshot exited $snapshotExit"
    Assert-True (($snapshotOutput -join "`n") -match 'fingerprint: [0-9a-f]{64}') 'Snapshot did not print a SHA-256 fingerprint'

    $mockRoot = Join-Path $scratch 'project'
    $mockScriptDir = Join-Path $mockRoot 'scripts\codex'
    $mockBin = Join-Path $scratch 'bin'
    New-Item -ItemType Directory -Path $mockScriptDir, (Join-Path $mockRoot 'frontend'), $mockBin -Force | Out-Null
    Copy-Item -LiteralPath $runner -Destination (Join-Path $mockScriptDir 'axon-check.ps1')
    Set-Content -LiteralPath (Join-Path $mockRoot 'frontend\package.json') -Value '{"scripts":{}}' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $mockBin 'npm.cmd') -Value "@echo mocked failure 1>&2`r`n@exit /b 7`r`n" -Encoding ascii

    $oldPath = $env:PATH
    try {
        $env:PATH = $mockBin + [System.IO.Path]::PathSeparator + $oldPath
        $mockOutput = & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $mockScriptDir 'axon-check.ps1') -Check Frontend 2>&1
        $mockExit = $LASTEXITCODE
    }
    finally { $env:PATH = $oldPath }

    Assert-True ($mockExit -eq 7) "Mock native failure was not preserved (got $mockExit): $($mockOutput -join ' | ')"
    Assert-True (($mockOutput -join "`n") -match 'mocked failure') 'Failure tail was not printed'
    $evidence = Get-ChildItem -LiteralPath (Join-Path $mockRoot '.codex\evidence') -Filter '*.json' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $record = Get-Content -LiteralPath $evidence.FullName -Raw | ConvertFrom-Json
    Assert-True ($record.exitCode -eq 7) 'Evidence did not preserve the native exit code'
    Assert-True ($record.commands.Count -eq 1) 'Frontend did not stop after the first failing command'
}
finally {
    if (Test-Path -LiteralPath $scratch) {
        $resolvedScratch = (Resolve-Path -LiteralPath $scratch).Path
        $expectedScratch = [System.IO.Path]::GetFullPath($scratch)
        $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
        if ($resolvedScratch -ne $expectedScratch -or
            -not $resolvedScratch.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
            [System.IO.Path]::GetFileName($resolvedScratch) -notmatch '^axon-check-test-[0-9a-f]{32}$') {
            throw "Refusing unsafe scratch cleanup: $resolvedScratch"
        }
        Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output 'PASS: Snapshot evidence and mocked native failure propagation verified (6 assertions).'
exit 0
