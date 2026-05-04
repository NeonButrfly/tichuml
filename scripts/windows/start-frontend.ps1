[CmdletBinding()]
param(
  [Alias("Host")]
  [string]$BindHost,
  [int]$Port,
  [string]$BackendUrl,
  [switch]$DryRun,
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-HelpText {
@"
Usage:
  scripts\windows\start-frontend.ps1 [options]

Starts the web frontend with the repo's existing Vite dev command.

Options:
  -Host <host>          Override the Vite host.
  -Port <port>          Override the Vite port.
  -BackendUrl <url>     Set VITE_BACKEND_BASE_URL for the frontend process.
  -DryRun               Print the resolved command without starting Vite.
  -Help, -?             Show this help text and exit.

Examples:
  scripts\windows\start-frontend.ps1
  scripts\windows\start-frontend.ps1 -BackendUrl http://127.0.0.1:4310
  scripts\windows\start-frontend.ps1 -Host 0.0.0.0 -Port 5173
"@
}

if ($Help) {
  Show-HelpText
  exit 0
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$argList = @("run", "dev", "-w", "@tichuml/web")
$viteArgs = @()
if ($BindHost) { $viteArgs += @("--host", $BindHost) }
if ($Port -gt 0) { $viteArgs += @("--port", "$Port") }
if ($viteArgs.Count -gt 0) {
  $argList += @("--")
  $argList += $viteArgs
}

Write-Host "Repo root: $repoRoot"
Write-Host ("Frontend command: npm {0}" -f ($argList -join " "))
if ($BackendUrl) {
  Write-Host "Frontend backend URL: $BackendUrl"
}
if ($BindHost -or $Port) {
  $resolvedHost = if ($BindHost) { $BindHost } else { "localhost" }
  $resolvedPort = if ($Port -gt 0) { $Port } else { 5173 }
  Write-Host ("Frontend URL hint: http://{0}:{1}" -f $resolvedHost, $resolvedPort)
}

if ($DryRun) {
  exit 0
}

Push-Location $repoRoot
try {
  if ($BackendUrl) {
    $env:VITE_BACKEND_BASE_URL = $BackendUrl
  }
  & npm @argList
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
