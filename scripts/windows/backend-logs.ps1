[CmdletBinding()]
param(
  [switch]$Follow,
  [switch]$DryRun,
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-HelpText {
@"
Usage:
  scripts\windows\backend-logs.ps1 [options]

Shows the backend runtime log file.

Options:
  -Follow               Follow the backend log stream.
  -DryRun               Print the resolved log path without reading it.
  -Help, -?             Show this help text and exit.
"@
}

if ($Help) {
  Show-HelpText
  exit 0
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logFile = Join-Path $repoRoot ".runtime\backend.log"
Write-Host "Backend log file: $logFile"

if ($DryRun) {
  exit 0
}

if ($Follow) {
  Get-Content -Path $logFile -Wait
} else {
  Get-Content -Path $logFile
}
