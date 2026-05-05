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

function Get-TrainingMetadataFile {
  param(
    [string]$RepoRoot,
    [string]$SessionNameValue,
    [string]$GameIdPrefixValue
  )

  $trainingRoot = Join-Path $RepoRoot "training-runs"
  if (-not (Test-Path $trainingRoot)) {
    throw "Training runs directory does not exist: $trainingRoot"
  }

  $candidates = @()
  foreach ($file in Get-ChildItem -Path $trainingRoot -Filter metadata.json -Recurse -File) {
    $json = Get-Content -Path $file.FullName -Raw | ConvertFrom-Json
    if (-not [string]::IsNullOrWhiteSpace($SessionNameValue) -and $json.session_name -ne $SessionNameValue) {
      continue
    }
    if (-not [string]::IsNullOrWhiteSpace($GameIdPrefixValue) -and $json.game_id_prefix -ne $GameIdPrefixValue) {
      continue
    }
    $candidates += [pscustomobject]@{
      Path = $file.FullName
      RunId = "$($json.run_id)"
      StartedAt = "$($json.started_at)"
    }
  }

  if ($candidates.Count -eq 0) {
    throw "No training metadata matched the requested session or game-id prefix."
  }

  return ($candidates | Sort-Object StartedAt -Descending | Select-Object -First 1).Path
}

if ($Help) {
  Show-HelpText
  exit 0
}

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$trainingDataScript = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\training-data.ts" -Description "Training data entrypoint"
$metadataFile = Get-TrainingMetadataFile -RepoRoot $repoRoot -SessionNameValue $SessionName -GameIdPrefixValue $GameIdPrefix
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
