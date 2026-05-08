[CmdletBinding()]
param(
  [string]$SessionName,
  [string]$GameIdPrefix,
  [int]$TailLines = 20,
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

function Show-HelpText {
  @"
Usage:
  scripts\status-training.ps1 [options]

Options:
  -SessionName <name>
  -GameIdPrefix <prefix>
  -TailLines <count>
  -Help, -?

Provide SessionName or GameIdPrefix to target a run. When neither is supplied,
the newest training metadata under training-runs is used.
"@ | Write-Host
}

if ($Help) {
  Show-HelpText
  exit 0
}

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$trainingDataScript = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\training-data.ts" -Description "Training data entrypoint"
$locateArgs = @(
  "tsx", $trainingDataScript, "locate-run",
  "--repo-root", $repoRoot
)
if (-not [string]::IsNullOrWhiteSpace($SessionName)) {
  $locateArgs += @("--session-name", $SessionName)
}
if (-not [string]::IsNullOrWhiteSpace($GameIdPrefix)) {
  $locateArgs += @("--game-id-prefix", $GameIdPrefix)
}
$metadataFile = $null
$locateResult = & npx.cmd @locateArgs 2>$null
if ($LASTEXITCODE -eq 0) {
  $candidate = (($locateResult | ForEach-Object { "$_" }) -join [Environment]::NewLine).Trim()
  if (-not [string]::IsNullOrWhiteSpace($candidate)) {
    $metadataFile = $candidate
  }
}
if (-not $metadataFile) {
  throw "No training metadata matched the requested session or game-id prefix."
}
$metadata = Get-Content -Path $metadataFile -Raw | ConvertFrom-Json
$passwordFile = Join-Path (Split-Path "$($metadata.stop_file)" -Parent) "pg-password.txt"

$nodeRunner = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { "npx.cmd" } else { "npx" }
$statusArgs = @(
  "tsx", $trainingDataScript, "status-run",
  "--metadata-file", $metadataFile,
  "--tail-lines", "$TailLines"
)
if (Test-Path $passwordFile) {
  $statusArgs += @("--pg-password-file", $passwordFile)
}

Push-Location $repoRoot
try {
  & $nodeRunner @statusArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
