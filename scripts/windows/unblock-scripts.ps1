param(
  [string]$RepoRoot = $(Resolve-Path (Join-Path $PSScriptRoot "..\\.."))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Join-Path $RepoRoot "scripts"
$targets = @(Get-ChildItem -Path $scriptRoot -Recurse -File -Include *.ps1,*.psm1,*.cmd,*.bat | Sort-Object FullName)
foreach ($target in $targets) {
  Unblock-File -LiteralPath $target.FullName
  Write-Host $target.FullName
}
