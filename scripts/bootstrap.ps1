param(
  [Alias("?")]
  [switch]$Help
)
$ErrorActionPreference = "Stop"
if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\bootstrap.ps1 [options]

Purpose:
  Bootstraps the Windows backend environment by forwarding to scripts\install-backend.ps1.

Options:
  -Help, -?, --help, -h  Show this help text.
  Any other option is forwarded to scripts\install-backend.ps1.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\bootstrap.ps1

Environment:
  Auto-detects the repo root through install-backend.ps1.
"@ | Write-Host
  exit 0
}
& (Join-Path $PSScriptRoot "install-backend.ps1") @args
