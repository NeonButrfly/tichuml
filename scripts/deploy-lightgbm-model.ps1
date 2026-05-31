param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [string]$RemoteUser = "kay",
  [string]$RemoteHost = "192.168.50.36",
  [int]$SshPort = 22,
  [string]$RemoteRepoRoot = "/opt/tichuml",
  [string]$RemoteBackendUrl = "http://127.0.0.1:4310",
  [switch]$NoRestart,
  [switch]$AllowManifestMismatch,
  [switch]$DryRun,
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\deploy-lightgbm-model.ps1 [options]

Deploys the tracked promoted LightGBM model artifact from the local validated
workspace to the canonical Linux backend host, verifies hashes, and restarts
the backend so the live runtime reloads the new model.

Options:
  -RepoRoot <path>
  -RemoteUser <user>
  -RemoteHost <host>
  -SshPort <port>
  -RemoteRepoRoot <path>
  -RemoteBackendUrl <url>
  -NoRestart
  -AllowManifestMismatch
  -DryRun
  -Help, -?
"@ | Write-Host
  exit 0
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param([string]$Message) Write-Host ""; Write-Host "==> $Message" }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" }
function Write-Warn { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Get-Sha256Hex {
  param([string]$Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      $hashBytes = $sha.ComputeHash($stream)
    } finally {
      $stream.Dispose()
    }
  } finally {
    $sha.Dispose()
  }

  return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
}

function Invoke-Ssh {
  param([string]$Target, [int]$Port, [string]$Command)
  & ssh "-p" $Port $Target $Command
  if ($LASTEXITCODE -ne 0) {
    throw "ssh failed with exit code $LASTEXITCODE"
  }
}

function Invoke-Scp {
  param([int]$Port, [string[]]$Sources, [string]$Destination)
  & scp "-P" $Port @Sources $Destination
  if ($LASTEXITCODE -ne 0) {
    throw "scp failed with exit code $LASTEXITCODE"
  }
}

$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$modelPath = Join-Path $resolvedRepoRoot "ml\model_registry\lightgbm_action_model.txt"
$metaPath = Join-Path $resolvedRepoRoot "ml\model_registry\lightgbm_action_model.meta.json"
$manifestPath = Join-Path $resolvedRepoRoot "ml\model_registry\promoted-model.json"
$sshTarget = "$RemoteUser@$RemoteHost"
$remoteModelPath = "$RemoteRepoRoot/ml/model_registry/lightgbm_action_model.txt"
$remoteMetaPath = "$RemoteRepoRoot/ml/model_registry/lightgbm_action_model.meta.json"
$restartBackend = -not $NoRestart

foreach ($path in @($modelPath, $metaPath, $manifestPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required file is missing: $path"
  }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$localModelHash = Get-Sha256Hex -Path $modelPath
$localMetaHash = Get-Sha256Hex -Path $metaPath

if (-not $AllowManifestMismatch) {
  if ($manifest.model.model_sha256 -ne $localModelHash) {
    throw "Local model hash does not match promoted-model.json. Update the tracked manifest or use -AllowManifestMismatch intentionally."
  }
  if ($manifest.model.meta_sha256 -ne $localMetaHash) {
    throw "Local model metadata hash does not match promoted-model.json. Update the tracked manifest or use -AllowManifestMismatch intentionally."
  }
}

if ($DryRun) {
  Write-Host "Resolved repo root: $resolvedRepoRoot"
  Write-Host "SSH target: ${sshTarget}:$SshPort"
  Write-Host "Remote repo root: $RemoteRepoRoot"
  Write-Host "Remote backend URL: $RemoteBackendUrl"
  Write-Host "Restart backend: $restartBackend"
  Write-Host "Manifest version: $($manifest.model.model_version)"
  Write-Host "Local model hash: $localModelHash"
  Write-Host "Local meta hash: $localMetaHash"
  Write-Host "Remote model path: $remoteModelPath"
  Write-Host "Remote meta path: $remoteMetaPath"
  exit 0
}

Assert-Command ssh
Assert-Command scp

Write-Step "Inspecting local promoted model artifact"
Write-Info "Manifest version: $($manifest.model.model_version)"
Write-Info "Local model hash: $localModelHash"
Write-Info "Local meta hash: $localMetaHash"

Write-Step "Backing up the current remote model artifact"
$backupCommand = @'
set -euo pipefail
cd __REMOTE_REPO_ROOT__
backup_dir=".runtime/model-backups/$(date -u +%Y%m%dT%H%M%SZ)-deploy-lightgbm"
mkdir -p "\$backup_dir"
if [ -f "ml/model_registry/lightgbm_action_model.txt" ]; then
  cp "ml/model_registry/lightgbm_action_model.txt" "\$backup_dir/"
fi
if [ -f "ml/model_registry/lightgbm_action_model.meta.json" ]; then
  cp "ml/model_registry/lightgbm_action_model.meta.json" "\$backup_dir/"
fi
printf '%s\n' "\$backup_dir"
'@.Replace("__REMOTE_REPO_ROOT__", $RemoteRepoRoot)
$backupDirOutput = & ssh "-p" $SshPort $sshTarget $backupCommand
if ($LASTEXITCODE -ne 0) {
  throw "ssh backup command failed with exit code $LASTEXITCODE"
}
$backupDir = ($backupDirOutput | Select-Object -Last 1).ToString().Trim()
Write-Info "Remote backup dir: $backupDir"

Write-Step "Copying the promoted model artifact to Linux"
Invoke-Scp -Port $SshPort -Sources @($modelPath, $metaPath) -Destination "${sshTarget}:${RemoteRepoRoot}/ml/model_registry/"

Write-Step "Verifying remote model hashes"
$verifyCommand = @'
set -euo pipefail
cd __REMOTE_REPO_ROOT__
sha256sum "ml/model_registry/lightgbm_action_model.txt" "ml/model_registry/lightgbm_action_model.meta.json"
'@.Replace("__REMOTE_REPO_ROOT__", $RemoteRepoRoot)
$verifyOutput = & ssh "-p" $SshPort $sshTarget $verifyCommand
if ($LASTEXITCODE -ne 0) {
  throw "ssh verify command failed with exit code $LASTEXITCODE"
}
$verifyText = ($verifyOutput | Out-String)
if ($verifyText -notmatch $localModelHash) {
  throw "Remote model hash did not match the local promoted artifact."
}
if ($verifyText -notmatch $localMetaHash) {
  throw "Remote metadata hash did not match the local promoted artifact."
}
Write-Ok "Remote model hashes match the promoted artifact"

if ($restartBackend) {
  Write-Step "Restarting the Linux backend"
  $restartCommand = @'
set -euo pipefail
cd __REMOTE_REPO_ROOT__
./scripts/restart-backend.sh
'@.Replace("__REMOTE_REPO_ROOT__", $RemoteRepoRoot)
  & ssh "-p" $SshPort $sshTarget $restartCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Remote backend restart failed with exit code $LASTEXITCODE"
  }
} else {
  Write-Warn "Skipping backend restart; the live process may still serve the older loaded model until restarted."
}

Write-Step "Checking remote backend health"
$healthCommand = @'
set -euo pipefail
for _ in $(seq 1 60); do
  if curl -fsS __REMOTE_BACKEND_URL__/health >/dev/null 2>&1; then
    curl -fsS __REMOTE_BACKEND_URL__/health
    exit 0
  fi
  sleep 2
done
echo "Timed out waiting for backend health at __REMOTE_BACKEND_URL__/health" >&2
exit 1
'@.Replace("__REMOTE_BACKEND_URL__", $RemoteBackendUrl)
$healthOutput = & ssh "-p" $SshPort $sshTarget $healthCommand
if ($LASTEXITCODE -ne 0) {
  throw "Remote backend health check failed with exit code $LASTEXITCODE"
}
Write-Ok "Remote backend is healthy"
Write-Host ($healthOutput | Out-String).Trim()
