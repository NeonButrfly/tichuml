[CmdletBinding()]
param(
  [Alias("?")]
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgumentList = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Help -or $ArgumentList -contains "--help" -or $ArgumentList -contains "-h") {
@"
Usage:
  scripts\validate-training-run.ps1 [telemetry validation options]

Purpose:
  Forwards to npm run telemetry:validate-run from the detected repo root.

Options:
  -Help, -?, --help, -h  Show this help text.
  Any remaining options are forwarded to telemetry:validate-run.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\validate-training-run.ps1 -- --help

Environment:
  Auto-detects repo root from the script location. Requires npm dependencies.
"@ | Write-Host
  exit 0
}

. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Set-TichumlRepoRoot -BaseDir $PSScriptRoot
$npmRunner = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

Push-Location $repoRoot
try {
  & $npmRunner "run" "telemetry:validate-run" "--" @ArgumentList
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
