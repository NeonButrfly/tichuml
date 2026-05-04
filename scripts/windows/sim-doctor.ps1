[CmdletBinding()]
param(
  [Alias("?")]
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"

if ($Help) {
@"
Usage:
  scripts\windows\sim-doctor.ps1 [sim:doctor options]

Runs the simulator diagnostics and then validates backend telemetry truth.

Examples:
  scripts\windows\sim-doctor.ps1
  scripts\windows\sim-doctor.ps1 --backend-url http://127.0.0.1:4310
"@ | Write-Host
  exit 0
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $repoRoot
try {
  & npm.cmd run sim:doctor -- @RemainingArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & npm.cmd run telemetry:truth -- --backend-url "http://127.0.0.1:4310" --require-rows
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
