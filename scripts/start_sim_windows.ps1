param(
  [Alias("?")]
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
if ($Help -or ($RemainingArgs -contains "--help") -or ($RemainingArgs -contains "-help")) {
  & (Join-Path $PSScriptRoot "windows\\start-sim.ps1") -Help
  exit $LASTEXITCODE
}
& (Join-Path $PSScriptRoot "windows\\start-sim.ps1") @RemainingArgs
