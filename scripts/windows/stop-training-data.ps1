[CmdletBinding()]
param(
  [string]$SessionName,
  [int]$TimeoutSeconds = 60,
  [switch]$Force,
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Help) {
@"
Usage:
  scripts\windows\stop-training-data.ps1 -SessionName <name> [options]

Requests a clean shutdown for a Windows training-data session and waits for the
runner to finalize scoped exports.

Options:
  -SessionName <name>
  -TimeoutSeconds <seconds>
  -Force
  -Help, -?
"@ | Write-Host
  exit 0
}

if ([string]::IsNullOrWhiteSpace($SessionName)) {
  throw "SessionName is required unless -Help or -? is used."
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Find-TrainingMetadataBySession {
  param([string]$RepoRoot, [string]$Name)
  $trainingRoot = Join-Path $RepoRoot "training-runs"
  if (-not (Test-Path $trainingRoot)) { return $null }
  foreach ($file in Get-ChildItem -Path $trainingRoot -Filter metadata.json -Recurse -File) {
    $json = Get-Content -Path $file.FullName -Raw | ConvertFrom-Json
    if ($json.session_name -eq $Name) {
      return [pscustomobject]@{
        Path = $file.FullName
        Metadata = $json
      }
    }
  }
  return $null
}

$repoRoot = Get-RepoRoot
$found = Find-TrainingMetadataBySession -RepoRoot $repoRoot -Name $SessionName
if (-not $found) {
  throw "No training session metadata found for $SessionName"
}

$metadataPath = $found.Path
$metadata = $found.Metadata
$stopFile = "$($metadata.stop_file)"
$pidFile = "$($metadata.pid_file)"
$passwordFile = Join-Path (Split-Path $stopFile -Parent) "pg-password.txt"

New-Item -ItemType Directory -Force -Path (Split-Path $stopFile -Parent) | Out-Null
(Get-Date).ToString("o") | Set-Content -Path $stopFile -Encoding UTF8

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (-not (Test-Path $pidFile)) { break }
  $pidText = (Get-Content -Path $pidFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($pidText)) { break }
  $process = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
  if (-not $process) { break }
  Start-Sleep -Seconds 2
}

if (Test-Path $pidFile) {
  $pidText = (Get-Content -Path $pidFile -Raw).Trim()
  if (-not [string]::IsNullOrWhiteSpace($pidText)) {
    $process = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
    if ($process) {
      if ($Force) {
        Push-Location $repoRoot
        try {
          & npx tsx scripts/training-data.ts finalize-run --metadata-file $metadataPath --pg-password-file $passwordFile | Out-Host
        } finally {
          Pop-Location
        }
        Stop-Process -Id $process.Id -Force
      } else {
        Write-Warning "Runner is still active after $TimeoutSeconds seconds. Re-run with -Force if you need to terminate it."
      }
    }
  }
}

Write-Host "Stop requested for $SessionName"
