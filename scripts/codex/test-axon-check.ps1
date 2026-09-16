[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runner = Join-Path -Path $PSScriptRoot -ChildPath 'axon-check.ps1'
$failures = [System.Collections.Generic.List[string]]::new()
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ('axon-check-test-' + [guid]::NewGuid().ToString('N'))
$assertionCount = 0
$oldPath = $null

function Assert-True([bool] $Condition, [string] $Message) {
    $script:assertionCount++
    if (-not $Condition) { $failures.Add($Message) }
}

function Get-EvidenceFromOutput([object[]] $Output) {
    $evidenceLine = $Output | ForEach-Object { $_.ToString() } | Where-Object { $_ -match '^evidence: (.+)$' } | Select-Object -Last 1
    if (-not $evidenceLine) { throw 'Runner output did not name its evidence record' }
    $evidencePath = ([regex]::Match($evidenceLine, '^evidence: (.+)$')).Groups[1].Value
    if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) { throw "Evidence record does not exist: $evidencePath" }
    Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
}

try {
    $snapshotOutput = & pwsh.exe -NoProfile -NonInteractive -File $runner -Check Snapshot 2>&1
    $snapshotExit = $LASTEXITCODE
    Assert-True ($snapshotExit -eq 0) "Snapshot exited $snapshotExit"
    Assert-True (($snapshotOutput -join "`n") -match 'fingerprint: [0-9a-f]{64}') 'Snapshot did not print a SHA-256 fingerprint'
    $snapshotRecord = Get-EvidenceFromOutput $snapshotOutput
    Assert-True ($snapshotRecord.schemaVersion -eq 1) 'Snapshot evidence schema version is missing or invalid'
    Assert-True ($snapshotRecord.sourceFingerprint -eq $snapshotRecord.endingSourceFingerprint) 'Stable Snapshot fingerprints did not match'
    Assert-True (-not $snapshotRecord.sourceChangedDuringCheck) 'Stable Snapshot was incorrectly invalidated'
    Assert-True ($snapshotRecord.fingerprintScope -contains 'backend') 'Snapshot evidence did not record its fingerprint scope'

    $mockRoot = Join-Path $scratch 'project'
    $mockScriptDir = Join-Path $mockRoot 'scripts\codex'
    $mockBin = Join-Path $scratch 'bin'
    $frontendRoot = Join-Path $mockRoot 'frontend'
    $frontendSource = Join-Path $frontendRoot 'src'
    New-Item -ItemType Directory -Path $mockScriptDir, $frontendSource, (Join-Path $mockRoot 'backend'), $mockBin -Force | Out-Null
    Copy-Item -LiteralPath $runner -Destination (Join-Path $mockScriptDir 'axon-check.ps1')
    Set-Content -LiteralPath (Join-Path $frontendRoot 'package.json') -Value '{"scripts":{}}' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $frontendSource 'focused.test.tsx') -Value '// focused test fixture' -Encoding utf8
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
    $record = Get-EvidenceFromOutput $mockOutput
    Assert-True ($record.exitCode -eq 7) 'Evidence did not preserve the native exit code'
    Assert-True ($record.commands.Count -eq 1) 'Frontend did not stop after the first failing command'
    Assert-True ($record.status -eq 'failed') 'Native failure evidence status was not failed'

    # The full Frontend gate must continue to run tests, lint, and build.
    Set-Content -LiteralPath (Join-Path $mockBin 'npm.cmd') -Value "@exit /b 0`r`n" -Encoding ascii
    $env:PATH = $mockBin + [System.IO.Path]::PathSeparator + $oldPath
    $fullOutput = & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $mockScriptDir 'axon-check.ps1') -Check Frontend 2>&1
    $fullExit = $LASTEXITCODE
    $fullRecord = Get-EvidenceFromOutput $fullOutput
    Assert-True ($fullExit -eq 0) "Mock full Frontend gate exited $fullExit`: $($fullOutput -join ' | ')"
    Assert-True ($fullRecord.commands.Count -eq 3) 'Full Frontend gate did not record test, lint, and build'
    Assert-True (($fullRecord.commands[1].command -join ' ') -match 'run lint') 'Full Frontend gate did not run lint second'
    Assert-True (($fullRecord.commands[2].command -join ' ') -match 'run build') 'Full Frontend gate did not run build third'

    # Focused checks run only named tests, and unrelated backend edits do not
    # alter a frontend check fingerprint.
    $focusedArgs = @('-Check', 'FrontendFocused', '-FrontendTests', 'src/focused.test.tsx')
    $focusedOutput = & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $mockScriptDir 'axon-check.ps1') @focusedArgs 2>&1
    $focusedExit = $LASTEXITCODE
    $focusedRecord = Get-EvidenceFromOutput $focusedOutput
    Set-Content -LiteralPath (Join-Path $mockRoot 'backend\unrelated.js') -Value '// unrelated backend edit' -Encoding utf8
    $focusedOutput2 = & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $mockScriptDir 'axon-check.ps1') @focusedArgs 2>&1
    $focusedExit2 = $LASTEXITCODE
    $focusedRecord2 = Get-EvidenceFromOutput $focusedOutput2
    Assert-True ($focusedExit -eq 0 -and $focusedExit2 -eq 0) "Focused frontend checks failed: $($focusedOutput + $focusedOutput2 -join ' | ')"
    Assert-True ($focusedRecord.commands.Count -eq 1) 'Focused frontend mode ran more than one command'
    Assert-True (($focusedRecord.commands[0].command -join ' ') -match 'src/focused\.test\.tsx') 'Focused frontend mode omitted the requested test path'
    Assert-True ($focusedRecord.sourceFingerprint -eq $focusedRecord2.sourceFingerprint) 'Unrelated backend edit changed the frontend fingerprint'
    Assert-True (($focusedRecord.fingerprintScope -join ',') -eq 'frontend,scripts/codex/axon-check.ps1') 'Focused frontend evidence recorded the wrong scope'

    # A same-scope edit during a check invalidates otherwise-green evidence.
    $mutatingMock = "@echo // changed>> `"%CD%\src\focused.test.tsx`"`r`n@exit /b 0`r`n"
    Set-Content -LiteralPath (Join-Path $mockBin 'npm.cmd') -Value $mutatingMock -Encoding ascii
    $invalidatedOutput = & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $mockScriptDir 'axon-check.ps1') @focusedArgs 2>&1
    $invalidatedExit = $LASTEXITCODE
    $invalidatedRecord = Get-EvidenceFromOutput $invalidatedOutput
    Assert-True ($invalidatedExit -eq 73) "Source mutation was not invalidated (got $invalidatedExit): $($invalidatedOutput -join ' | ')"
    Assert-True ($invalidatedRecord.status -eq 'invalidated') 'Source mutation evidence status was not invalidated'
    Assert-True ($invalidatedRecord.sourceChangedDuringCheck) 'Source mutation evidence omitted its invalidation flag'
    Assert-True ($invalidatedRecord.sourceFingerprint -ne $invalidatedRecord.endingSourceFingerprint) 'Source mutation evidence fingerprints incorrectly match'

    # Timeout must terminate the command tree and remain visible in evidence.
    $timeoutMock = "@pwsh.exe -NoProfile -NonInteractive -Command `"Start-Sleep -Seconds 5`"`r`n@exit /b 0`r`n"
    Set-Content -LiteralPath (Join-Path $mockBin 'npm.cmd') -Value $timeoutMock -Encoding ascii
    $timeoutOutput = & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $mockScriptDir 'axon-check.ps1') @focusedArgs -CommandTimeoutSeconds 1 2>&1
    $timeoutExit = $LASTEXITCODE
    $timeoutRecord = Get-EvidenceFromOutput $timeoutOutput
    Assert-True ($timeoutExit -eq 124) "Timeout exit was not preserved (got $timeoutExit): $($timeoutOutput -join ' | ')"
    Assert-True ($timeoutRecord.commands.Count -eq 1 -and $timeoutRecord.commands[0].timedOut) 'Timeout evidence did not mark the command timed out'
    Assert-True ($timeoutRecord.commands[0].timeoutSeconds -eq 1) 'Timeout evidence recorded the wrong limit'
    Assert-True (($timeoutRecord.commands[0].outputTail -join "`n") -match 'timed out after 1 seconds') 'Timeout evidence omitted the diagnostic'

    # A long stable context must not push actionable tracker rows past the
    # session-hook character ceiling.
    $hookRoot = Join-Path $scratch 'hook-project'
    $hookDir = Join-Path $hookRoot '.codex\hooks'
    $hookDocs = Join-Path $hookRoot 'docs'
    New-Item -ItemType Directory -Path $hookDir, $hookDocs -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))) '.codex\hooks\session-context.ps1') -Destination $hookDir
    Set-Content -LiteralPath (Join-Path $hookDocs 'AXON-CONTEXT.md') -Value (('context-padding ' * 1000) + 'CONTEXT-END-MARKER') -Encoding utf8
    @'
| ID | Task | Owner | Status | Evidence / next action |
|---|---|---|---|---|
| KEEP-01 | must survive truncation | Sol | IN PROGRESS | ACTIONABLE-SURVIVES |
| DROP-01 | completed history | Sol | DONE | DONE-MUST-NOT-APPEAR |
'@ | Set-Content -LiteralPath (Join-Path $hookDocs 'AXON-LIVE-TODO.md') -Encoding utf8
    $hookOutput = '{}' | & pwsh.exe -NoProfile -NonInteractive -File (Join-Path $hookDir 'session-context.ps1') 2>&1
    $hookExit = $LASTEXITCODE
    $hookRecord = ($hookOutput -join "`n") | ConvertFrom-Json
    $hookContext = $hookRecord.hookSpecificOutput.additionalContext
    Assert-True ($hookExit -eq 0) "Session hook exited $hookExit"
    Assert-True ($hookContext.Length -le 5600) "Session hook exceeded its character ceiling: $($hookContext.Length)"
    Assert-True ($hookContext -match 'ACTIONABLE-SURVIVES') 'Actionable row was lost when context was truncated'
    Assert-True ($hookContext -notmatch 'DONE-MUST-NOT-APPEAR') 'Completed tracker row leaked into session context'
    Assert-True ($hookContext -match 'Active context truncated') 'Long context did not report deterministic truncation'
}
finally {
    if ($null -ne $oldPath) { $env:PATH = $oldPath }
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

Write-Output "PASS: runner and session-hook behavior verified ($assertionCount assertions)."
exit 0
