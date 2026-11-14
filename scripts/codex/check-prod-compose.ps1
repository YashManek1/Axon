[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$synthetic = [ordered]@{
    COMPOSE_PROFILES = $null
    JWT_SECRET = 'synthetic-jwt'
    ENCRYPTION_KEY = 'synthetic-encryption'
    DISPATCH_SIGNING_KEY = 'synthetic-dispatch'
    PROMETHEUS_BEARER_TOKEN = 'synthetic-monitoring'
    GRAFANA_ADMIN_PASSWORD = 'synthetic-grafana'
    BACKEND_IMAGE = 'example.invalid/axon/backend@sha256:' + ('a' * 64)
    FRONTEND_IMAGE = 'example.invalid/axon/frontend@sha256:' + ('b' * 64)
    AXON_RELEASE_ID = 'synthetic-release'
    PORT = '43123'
    FRONTEND_PORT = '18080'
}
$saved = @{}
$assertions = 0

function Assert-Compose([bool] $Condition, [string] $Message) {
    $script:assertions++
    if (-not $Condition) { throw $Message }
}

function Invoke-ComposeConfig([string[]] $ExtraArgs) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & docker compose --env-file NUL -f docker-compose.yml -f docker-compose.prod.yml config --no-env-resolution @ExtraArgs 2>&1
        [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

try {
    foreach ($entry in $synthetic.GetEnumerator()) {
        $saved[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    Push-Location -LiteralPath $projectRoot
    try {
        $render = Invoke-ComposeConfig @('--format', 'json')
        Assert-Compose ($render.ExitCode -eq 0) 'Synthetic production Compose render failed'
        $model = $render.Output | ConvertFrom-Json
        $services = @($model.services.PSObject.Properties.Name | Sort-Object)
        Assert-Compose (($services -join ',') -eq 'backend,frontend,grafana,prometheus') 'Default service model includes an unexpected service'

        $backend = $model.services.backend
        $frontend = $model.services.frontend
        Assert-Compose ($null -eq $backend.PSObject.Properties['build'] -and $null -eq $frontend.PSObject.Properties['build']) 'A development build was inherited'
        Assert-Compose ($null -eq $backend.PSObject.Properties['depends_on']) 'Backend inherited a local data-service dependency'
        Assert-Compose ($backend.image -eq $synthetic.BACKEND_IMAGE -and $frontend.image -eq $synthetic.FRONTEND_IMAGE) 'Release image input did not reach the service model'
        Assert-Compose ($backend.environment.AXON_RELEASE_ID -eq $synthetic.AXON_RELEASE_ID) 'Release ID did not reach backend'
        Assert-Compose ($backend.environment.NODE_ENV -eq 'production' -and $backend.environment.PORT -eq '3000') 'Backend runtime environment is not production-bound'
        Assert-Compose (-not $backend.environment.PSObject.Properties['MONGO_URI'] -and -not $backend.environment.PSObject.Properties['REDIS_URI']) 'Development data endpoints override the production env file'
        Assert-Compose ($backend.env_file.Count -eq 1 -and $backend.env_file[0].path -like '*backend\.env.production') 'Backend env file was not replaced with the production file'
        Assert-Compose ($backend.ports.Count -eq 1 -and $backend.ports[0].host_ip -eq '127.0.0.1' -and $backend.ports[0].published -eq '43123' -and $backend.ports[0].target -eq 3000) 'Backend has an unexpected published port'
        Assert-Compose ($frontend.ports.Count -eq 1 -and $frontend.ports[0].host_ip -eq '127.0.0.1' -and $frontend.ports[0].published -eq '18080' -and $frontend.ports[0].target -eq 80) 'Frontend has an unexpected published port'

        foreach ($required in @('BACKEND_IMAGE', 'FRONTEND_IMAGE', 'AXON_RELEASE_ID')) {
            [Environment]::SetEnvironmentVariable($required, $null, 'Process')
            $negative = Invoke-ComposeConfig @('--quiet')
            [Environment]::SetEnvironmentVariable($required, $synthetic[$required], 'Process')
            Assert-Compose ($negative.ExitCode -ne 0 -and $negative.Output.Contains($required)) "Missing $required was not rejected"
        }
    }
    finally { Pop-Location }
    Write-Output "PASS: $assertions synthetic production Compose assertions; no services started"
}
finally {
    foreach ($name in $synthetic.Keys) {
        [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
    }
}
