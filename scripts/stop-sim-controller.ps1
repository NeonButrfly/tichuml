param(
  [Alias("?")]
  [switch]$Help
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")
if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\stop-sim-controller.ps1 [options]

Purpose:
  Stops the Windows simulator controller by writing the repo-local stop signal.

Options:
  -Help, -?, --help, -h  Show this help text.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\stop-sim-controller.ps1

Environment:
  Auto-detects the repo root from the script location.
"@ | Write-Host
  exit 0
}
$repo = Enter-RepoRoot -BaseDir $PSScriptRoot
$runtime = Join-Path $repo ".runtime\sim-controller"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Set-Content -Path (Join-Path $runtime "stop") -Value "stop" -Encoding UTF8
Write-Host "[OK] Sim controller stop file written."
