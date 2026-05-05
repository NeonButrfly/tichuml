param(
  [string]$RepoRoot = "",
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\unblock-scripts.ps1 [options]

Purpose:
  Unblocks local Windows script files after download or clone security marking.

Options:
  -RepoRoot <path>       Repo root. Defaults to script-relative detection.
  -Help, -?, --help, -h  Show this help text.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\unblock-scripts.ps1

Environment:
  Auto-detects repo root from the script location.
"@ | Write-Host
  exit 0
}
if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$scriptRoot = Join-Path $RepoRoot "scripts"
$targets = @(Get-ChildItem -Path $scriptRoot -Recurse -File -Include *.ps1,*.psm1,*.cmd,*.bat | Sort-Object FullName)
foreach ($target in $targets) {
  Unblock-File -LiteralPath $target.FullName
  Write-Host $target.FullName
}
