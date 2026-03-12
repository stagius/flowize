param(
  [string]$ListenHost = "0.0.0.0",
  [int]$Port = 3000,
  [int]$BridgePort = 4141,
  [string]$LogDir = ".flowize-host-logs",
  [ValidateSet("prod", "dev")]
  [string]$Mode = "prod"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedLogDir = if ([System.IO.Path]::IsPathRooted($LogDir)) { $LogDir } else { Join-Path $repoRoot $LogDir }

if (-not (Test-Path $resolvedLogDir)) {
  New-Item -ItemType Directory -Path $resolvedLogDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$appLog = Join-Path $resolvedLogDir "app-$timestamp.log"
$bridgeLog = Join-Path $resolvedLogDir "bridge-$timestamp.log"

Write-Host "Starting Flowize remote host from $repoRoot"
Write-Host "Mode: $Mode"
Write-Host "App log: $appLog"
Write-Host "Bridge log: $bridgeLog"

if ($Mode -eq "prod") {
  Write-Host "Building Flowize for production..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Production build failed with exit code $LASTEXITCODE"
  }
}

$appCommand = if ($Mode -eq "prod") {
  '$env:FLOWIZE_HOST = "' + $ListenHost + '"; $env:PORT = "' + $Port + '"; node scripts/serve-dist.mjs 2>&1 | Tee-Object -FilePath "' + $appLog + '" -Append'
} else {
  'npm run dev -- --host ' + $ListenHost + ' --port ' + $Port + ' 2>&1 | Tee-Object -FilePath "' + $appLog + '" -Append'
}
$bridgeCommand = '$env:BRIDGE_HOST = "0.0.0.0"; $env:BRIDGE_PORT = "' + $BridgePort + '"; npm run bridge:start 2>&1 | Tee-Object -FilePath "' + $bridgeLog + '" -Append'

Start-Process powershell -ArgumentList '-NoExit', '-Command', $appCommand -WorkingDirectory $repoRoot | Out-Null
Start-Process powershell -ArgumentList '-NoExit', '-Command', $bridgeCommand -WorkingDirectory $repoRoot | Out-Null

Write-Host "Flowize host processes launched."
Write-Host "Open the UI at http://<this-pc-or-tailnet-ip>:$Port"
Write-Host "Bridge health should be available at http://<this-pc-or-tailnet-ip>:$BridgePort/health"
Write-Host "Keep this machine awake and signed in for 24/7 remote use."
