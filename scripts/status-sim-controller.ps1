param(
  [Alias("?")]
  [switch]$Help
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\status-sim-controller.ps1 [options]

Purpose:
  Prints simulator controller state and recent logs on Windows.

Options:
  -Help, -?, --help, -h  Show this help text.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\status-sim-controller.ps1

Environment:
  Auto-detects the repo root from the script location.
"@ | Write-Host
  exit 0
}
$repo = Enter-RepoRoot -BaseDir $PSScriptRoot
$runtime = Join-Path $repo ".runtime\sim-controller"
$state = Join-Path $runtime "state.json"
$log = Join-Path $runtime "controller.ndjson"
if (Test-Path $state) { Get-Content $state -Raw } else { Write-Host "[WARN] No sim controller state file found at $state" }
if (Test-Path $log) { Write-Host ""; Write-Host "Recent Logs"; Get-Content $log -Tail 25 } else { Write-Host "[WARN] No sim controller log file found at $log" }
