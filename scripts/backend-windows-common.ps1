Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $env:BACKEND_REPO_ROOT -or [string]::IsNullOrWhiteSpace($env:BACKEND_REPO_ROOT)) { $env:BACKEND_REPO_ROOT = "C:\tichu\tichuml" }

$script:RepoRoot = $env:BACKEND_REPO_ROOT
$script:RuntimeDir = Join-Path $script:RepoRoot ".runtime"
$script:PidFile = Join-Path $script:RuntimeDir "backend.pid"
$script:LogFile = Join-Path $script:RuntimeDir "backend.log"
$script:UpdateStatusFile = Join-Path $script:RuntimeDir "backend-update-status.env"
$script:EvalSummaryFile = Join-Path $script:RepoRoot "eval\results\latest_summary.json"
$script:DefaultRepoUrl = "https://github.com/NeonButrfly/tichuml.git"
$script:DefaultBranch = "main"

function Write-Step { param([string]$Message) Write-Host ""; Write-Host "==> $Message" }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" }
function Write-Warn { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }

function Test-CommandExists { param([string]$Name) return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Invoke-Logged {
  param([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory)
  $args = @($ArgumentList)
  $wd = if ($WorkingDirectory) { $WorkingDirectory } else { (Get-Location).Path }
  Write-Info ("Running: {0} {1}" -f $FilePath, ($args -join " "))
  Push-Location $wd
  try {
    & $FilePath @args
    if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

function Ensure-RuntimeDirs {
  New-Item -ItemType Directory -Force -Path $script:RuntimeDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $script:RepoRoot "eval\results") | Out-Null
}

function Ensure-EnvFile {
  $envFile = Join-Path $script:RepoRoot ".env"
  $example = Join-Path $script:RepoRoot ".env.example"
  if (-not (Test-Path $envFile) -and (Test-Path $example)) { Copy-Item $example $envFile }
  if (-not (Test-Path $envFile)) {
    @(
      "DATABASE_URL=postgres://tichu:tichu_dev_password@localhost:54329/tichu",
      "PG_BOOTSTRAP_URL=postgres://tichu:tichu_dev_password@localhost:54329/postgres",
      "POSTGRES_DB=tichu",
      "POSTGRES_USER=tichu",
      "POSTGRES_PASSWORD=tichu_dev_password",
      "POSTGRES_PORT=54329",
      "PORT=4310",
      "HOST=0.0.0.0",
      "BACKEND_BASE_URL=http://localhost:4310",
      "AUTO_BOOTSTRAP_DATABASE=true",
      "AUTO_MIGRATE=true",
      "AUTO_UPDATE_ON_START=true",
      "GIT_BRANCH=main",
      "REPO_URL=https://github.com/NeonButrfly/tichuml.git",
      "PYTHON_EXECUTABLE=python",
      "LIGHTGBM_INFER_SCRIPT=ml/infer.py",
      "LIGHTGBM_MODEL_PATH=ml/model_registry/lightgbm_action_model.txt",
      "LIGHTGBM_MODEL_META_PATH=ml/model_registry/lightgbm_action_model.meta.json"
    ) | Set-Content -Path $envFile -Encoding UTF8
  }
}

function Import-DotEnv {
  Ensure-EnvFile
  $envFile = Join-Path $script:RepoRoot ".env"
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $idx = $line.IndexOf("=")
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"')
    if ($name) { Set-Item -Path "Env:$name" -Value $value }
  }
}

function Get-RepoUrl { if ($env:REPO_URL) { return $env:REPO_URL } return $script:DefaultRepoUrl }
function Get-GitBranch { if ($env:GIT_BRANCH) { return $env:GIT_BRANCH } return $script:DefaultBranch }
function Get-BackendUrl { if ($env:BACKEND_BASE_URL) { return $env:BACKEND_BASE_URL } return "http://localhost:4310" }

function Force-RefreshRepo {
  Ensure-RuntimeDirs
  $repoUrl = Get-RepoUrl
  $branch = Get-GitBranch
  if (-not (Test-Path $script:RepoRoot)) { New-Item -ItemType Directory -Force -Path (Split-Path $script:RepoRoot -Parent) | Out-Null; Invoke-Logged "git" @("clone", $repoUrl, $script:RepoRoot) (Split-Path $script:RepoRoot -Parent) }
  if (-not (Test-Path (Join-Path $script:RepoRoot ".git"))) { throw "Repo root exists but is not a git repo: $script:RepoRoot" }
  Write-Step "Force-refreshing repository state"
  Write-Warn "Local tracked and untracked changes in $script:RepoRoot will be overwritten for this backend workflow."
  Invoke-Logged "git" @("-C", $script:RepoRoot, "remote", "set-url", "origin", $repoUrl) $script:RepoRoot
  Invoke-Logged "git" @("-C", $script:RepoRoot, "fetch", "--prune", "origin", $branch) $script:RepoRoot
  Invoke-Logged "git" @("-C", $script:RepoRoot, "checkout", $branch) $script:RepoRoot
  Invoke-Logged "git" @("-C", $script:RepoRoot, "reset", "--hard", "origin/$branch") $script:RepoRoot
  Invoke-Logged "git" @("-C", $script:RepoRoot, "clean", "-fd") $script:RepoRoot
  "LAST_UPDATE_STATUS=pass" | Set-Content -Path $script:UpdateStatusFile -Encoding UTF8
}

function Test-DockerReachable {
  if (-not (Test-CommandExists "docker")) { return $false }
  try { & docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Ensure-Docker {
  if (Test-DockerReachable) { Write-Ok "Docker daemon is reachable"; return }
  Write-Warn "Docker is not reachable. Start Docker Desktop, then rerun this script."
  throw "Docker daemon is not reachable"
}

function Install-NodeDependenciesIfNeeded {
  $stamp = Join-Path $script:RuntimeDir "npm-install.stamp"
  $nodeModules = Join-Path $script:RepoRoot "node_modules"
  if (-not (Test-Path $nodeModules) -or -not (Test-Path $stamp)) { Invoke-Logged "npm" @("install") $script:RepoRoot; New-Item -ItemType File -Force -Path $stamp | Out-Null } else { Write-Info "Node dependencies already up to date" }
}

function Get-PythonCommand {
  if ($env:PYTHON_EXECUTABLE) { return $env:PYTHON_EXECUTABLE }
  if (Test-CommandExists "py") { return "py" }
  return "python"
}

function Ensure-PythonVenv {
  $venv = Join-Path $script:RepoRoot ".venv"
  $venvPython = Join-Path $venv "Scripts\python.exe"
  if (-not (Test-Path $venvPython)) { $py = Get-PythonCommand; Invoke-Logged $py @("-m", "venv", $venv) $script:RepoRoot }
}

function Install-MLRequirementsIfNeeded {
  $req = Join-Path $script:RepoRoot "ml\requirements.txt"
  if (-not (Test-Path $req)) { Write-Warn "No ml\requirements.txt found; skipping ML Python requirements"; return }
  Ensure-PythonVenv
  $stamp = Join-Path $script:RuntimeDir "ml-install.stamp"
  if (-not (Test-Path $stamp)) {
    $venvPython = Join-Path $script:RepoRoot ".venv\Scripts\python.exe"
    Invoke-Logged $venvPython @("-m", "pip", "install", "--upgrade", "pip") $script:RepoRoot
    Invoke-Logged $venvPython @("-m", "pip", "install", "-r", $req) $script:RepoRoot
    New-Item -ItemType File -Force -Path $stamp | Out-Null
  } else { Write-Info "ML requirements already up to date" }
}

function Prepare-RuntimeStack {
  Write-Step "Preparing Windows backend runtime stack"
  foreach ($cmd in @("git", "node", "npm", "docker")) { if (-not (Test-CommandExists $cmd)) { throw "Required command missing: $cmd" } }
  Ensure-RuntimeDirs
  Import-DotEnv
  Ensure-Docker
  Install-NodeDependenciesIfNeeded
  Install-MLRequirementsIfNeeded
}

function Start-Postgres {
  Write-Step "Starting Postgres via docker compose"
  Invoke-Logged "docker" @("compose", "up", "-d", "postgres") $script:RepoRoot
}

function Wait-Postgres {
  Write-Step "Waiting for Postgres readiness"
  $container = if ($env:POSTGRES_CONTAINER_NAME) { $env:POSTGRES_CONTAINER_NAME } else { "tichu-postgres" }
  $user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "tichu" }
  $db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "tichu" }
  for ($i = 1; $i -le 40; $i++) {
    & docker exec $container pg_isready -U $user -d $db *> $null
    if ($LASTEXITCODE -eq 0) { Write-Ok "Postgres is accepting connections"; return }
    Start-Sleep -Seconds 2
  }
  throw "Postgres did not become ready"
}

function Run-Migrations {
  Write-Step "Running database migrations"
  Invoke-Logged "npm" @("run", "db:migrate") $script:RepoRoot
}

function Build-BackendArtifacts {
  Write-Step "Building backend and simulator runtime artifacts"
  $scripts = @("build:shared", "build:engine", "build:telemetry", "build:ai", "build:server", "build:sim-runner")
  foreach ($s in $scripts) { Invoke-Logged "npm" @("run", $s) $script:RepoRoot }
}

function Get-BackendPid {
  if (Test-Path $script:PidFile) {
    $pidText = (Get-Content $script:PidFile -Raw).Trim()
    if ($pidText -match "^\d+$") {
      $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
      if ($proc) { return [int]$pidText }
    }
  }
  return $null
}

function Start-BackendProcess {
  $existing = Get-BackendPid
  if ($existing) { Write-Warn "Backend is already running with pid $existing"; return }
  Write-Step "Starting backend process"
  $cmd = "npm run dev:server *> `"$script:LogFile`""
  $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "cd `"$script:RepoRoot`"; $cmd") -WindowStyle Minimized -PassThru
  Set-Content -Path $script:PidFile -Value $proc.Id -Encoding UTF8
  Write-Ok "Backend started with pid $($proc.Id)"
}

function Stop-BackendProcess {
  $pid = Get-BackendPid
  if (-not $pid) { Write-Warn "Backend pid file missing or process is not running"; Remove-Item $script:PidFile -Force -ErrorAction SilentlyContinue; return }
  Write-Step "Stopping backend process"
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  Remove-Item $script:PidFile -Force -ErrorAction SilentlyContinue
  Write-Ok "Backend stopped"
}

function Test-BackendHealth {
  $url = (Get-BackendUrl).TrimEnd("/") + "/health"
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) { Write-Ok "/health reachable at $url"; return $true }
  } catch { Write-Fail "/health not reachable at $url - $($_.Exception.Message)" }
  return $false
}

function Show-BackendStatus {
  Write-Step "Inspecting Windows backend host status"
  Ensure-RuntimeDirs
  Import-DotEnv
  foreach ($cmd in @("git", "node", "npm", "docker")) { if (Test-CommandExists $cmd) { Write-Ok "$cmd is installed" } else { Write-Fail "$cmd is missing" } }
  if (Test-DockerReachable) { Write-Ok "Docker daemon is running" } else { Write-Fail "Docker daemon is not running" }
  $container = if ($env:POSTGRES_CONTAINER_NAME) { $env:POSTGRES_CONTAINER_NAME } else { "tichu-postgres" }
  try {
    $running = docker inspect -f "{{.State.Running}}" $container 2>$null
    if ($running -eq "true") { Write-Ok "Postgres container is running" } else { Write-Fail "Postgres container is not running" }
  } catch { Write-Fail "Postgres container not found" }
  $pid = Get-BackendPid
  if ($pid) { Write-Ok "Backend process is running with pid $pid" } else { Write-Fail "Backend process is not running" }
  [void](Test-BackendHealth)
}
