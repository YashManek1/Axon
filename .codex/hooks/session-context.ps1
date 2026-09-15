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
    $brief = @"
Axon continuity checkpoint. Sol is the default executor; use architecture_astra before shared contracts, auth/tenant boundaries, retry semantics, destructive workflows, public promises, and for final acceptance of security-sensitive changes.

ACTIVE CONTEXT
$context

LIVE TRACKER
$todo
"@

    $maxCharacters = 6500
    if ($brief.Length -gt $maxCharacters) {
        $suffix = "`n[Checkpoint truncated; open the two source files for the omitted detail.]"
        $brief = $brief.Substring(0, $maxCharacters - $suffix.Length) + $suffix
    }

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
