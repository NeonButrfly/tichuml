[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgumentList = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "windows/common.ps1")

$repoRoot = Set-TichumlRepoRoot -BaseDir $PSScriptRoot
$npmRunner = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }

Push-Location $repoRoot
try {
  & $npmRunner "run" "telemetry:validate-run" "--" @ArgumentList
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
