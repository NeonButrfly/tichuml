param(
  [int]$Games = 100,
  [string]$Provider = "server_heuristic",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [switch]$Telemetry,
  [Alias("?")]
  [switch]$Help
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
if ($Help) {
@"
Usage:
  scripts\windows\start-sim.ps1 [options]

Runs a finite self-play simulator batch from Windows.

Options:
  -Games <count>
  -Provider <local|server_heuristic|lightgbm_model>
  -BackendUrl <url>
  -Telemetry
  -Help, -?
"@ | Write-Host
  exit 0
}
$repo = Enter-RepoRoot -BaseDir $PSScriptRoot
$telemetryValue = if ($Telemetry) { "true" } else { "false" }
Set-Location -LiteralPath $repo
npm.cmd run sim -- --games $Games --provider $Provider --backend-url $BackendUrl --telemetry $telemetryValue --strict-telemetry false
