param(
  [Alias("?")]
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
if ($Help -or ($RemainingArgs -contains "--help") -or ($RemainingArgs -contains "-help")) {
  & (Join-Path $PSScriptRoot "verify-sim-one-game-fixed.ps1") -Help
  exit $LASTEXITCODE
}
& (Join-Path $PSScriptRoot "verify-sim-one-game-fixed.ps1") @RemainingArgs
