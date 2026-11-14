[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    # Consume documented hook input without relying on transcript format.
    $rawInput = [Console]::In.ReadToEnd()
    if ($rawInput) { $null = $rawInput | ConvertFrom-Json }

    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $contextPath = Join-Path $projectRoot 'docs\AXON-CONTEXT.md'
    $todoPath = Join-Path $projectRoot 'docs\AXON-LIVE-TODO.md'
    if (-not (Test-Path -LiteralPath $contextPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $todoPath -PathType Leaf)) {
        exit 0
    }

    $context = Get-Content -LiteralPath $contextPath -Raw
    $todo = Get-Content -LiteralPath $todoPath -Raw
    # Keep stable context, then include only tracker rows that still need action.
    # DONE history remains available in the source file without consuming every resume.
    $actionableRows = ($todo -split "`r?`n") |
        Where-Object { $_ -match '\|\s*(TODO|IN PROGRESS|BLOCKED)\s*\|' }
    $actionable = if ($actionableRows) {
        "`nACTIONABLE TRACKER ROWS`n" + ($actionableRows -join "`n")
    } else {
        "`nACTIONABLE TRACKER ROWS`n(none recorded)"
    }

    $prefix = @"
Axon continuity checkpoint. Sol is the default executor; use architecture_astra before shared contracts, auth/tenant boundaries, retry semantics, destructive workflows, public promises, and for final acceptance of security-sensitive changes.

$actionable

ACTIVE CONTEXT
"@
    $maxCharacters = 5600
    $suffix = "`n[Active context truncated; open docs/AXON-CONTEXT.md for omitted detail.]"
    $contextBudget = [Math]::Max(0, $maxCharacters - $prefix.Length - $suffix.Length)
    $boundedContext = if ($context.Length -le $contextBudget) {
        $context
    } elseif ($contextBudget -gt 0) {
        $context.Substring(0, $contextBudget) + $suffix
    } else {
        $suffix.TrimStart()
    }
    $brief = $prefix + $boundedContext

    # If actionable rows alone eventually exceed the total ceiling, fail closed
    # to a bounded payload. Under normal growth only ACTIVE CONTEXT is trimmed.
    if ($brief.Length -gt $maxCharacters) { $brief = $brief.Substring(0, $maxCharacters) }

    [ordered]@{
        hookSpecificOutput = [ordered]@{
            hookEventName = 'SessionStart'
            additionalContext = $brief
        }
    } | ConvertTo-Json -Depth 4 -Compress
}
catch {
    # Continuity must never prevent a session from starting.
    [Console]::Error.WriteLine("Axon session context hook skipped: $($_.Exception.Message)")
    exit 0
}
