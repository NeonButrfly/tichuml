param(
  [int]$Games = 100,
  [string]$Provider = "server_heuristic",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [switch]$Telemetry,
  [Alias("?")]
  [switch]$Help
)
$ErrorActionPreference = "Stop"
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
$repo = if ($env:BACKEND_REPO_ROOT) { $env:BACKEND_REPO_ROOT } else { "C:\tichu\tichuml" }
$telemetryValue = if ($Telemetry) { "true" } else { "false" }
cd $repo
npm run sim -- --games $Games --provider $Provider --backend-url $BackendUrl --telemetry $telemetryValue --strict-telemetry false
