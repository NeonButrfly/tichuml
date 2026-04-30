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
$script:CanonicalPostgresContainer = "tichu-postgres"
$script:CanonicalPostgresUser = "tichu"
$script:CanonicalPostgresPassword = "tichu_dev_password"
$script:CanonicalPostgresDb = "tichu"
$script:CanonicalPostgresPort = "54329"
$script:CanonicalDatabaseUrl = "postgres://tichu:tichu_dev_password@localhost:54329/tichu"
$script:CanonicalBootstrapUrl = "postgres://tichu:tichu_dev_password@localhost:54329/postgres"

function Write-Step { param([string]$Message) Write-Host ""; Write-Host "==> $Message" }
function Write-Ok { param([string]$Message) Write-Host "[OK] $Message" }
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" }
function Write-Warn { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }

function Test-CommandExists { param([string]$Name) return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function ConvertTo-SafeDatabaseUrl {
  param([string]$Value)
  if (-not $Value) { return "" }
  return ($Value -replace "//([^:/@]+):([^@/]+)@", '//$1:***@')
}

function Invoke-Logged {
  param([string]$FilePath, [string[]]$ArgsList = @(), [string]$WorkingDirectory)
  $cmdArgs = @($ArgsList)
  $wd = if ($WorkingDirectory) { $WorkingDirectory } else { (Get-Location).Path }
  Write-Info ("Running: {0} {1}" -f $FilePath, ($cmdArgs -join " "))
  Push-Location $wd
  try {
    & $FilePath @cmdArgs
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

function Set-CanonicalDatabaseIdentity {
  param(
    [string]$DatabaseUrl = $script:CanonicalDatabaseUrl,
    [string]$BootstrapUrl = $script:CanonicalBootstrapUrl,
    [string]$PostgresContainer = $script:CanonicalPostgresContainer,
    [string]$PostgresUser = $script:CanonicalPostgresUser,
    [string]$PostgresPassword = $script:CanonicalPostgresPassword,
    [string]$PostgresDb = $script:CanonicalPostgresDb,
    [string]$PostgresPort = $script:CanonicalPostgresPort
  )
  $env:DATABASE_URL = $DatabaseUrl
  $env:PG_BOOTSTRAP_URL = $BootstrapUrl
  $env:POSTGRES_CONTAINER_NAME = $PostgresContainer
  $env:POSTGRES_USER = $PostgresUser
  $env:POSTGRES_PASSWORD = $PostgresPassword
  $env:POSTGRES_DB = $PostgresDb
  $env:POSTGRES_PORT = $PostgresPort
  Write-Info ("Backend DATABASE_URL: {0}" -f (ConvertTo-SafeDatabaseUrl $env:DATABASE_URL))
}

function Get-RepoUrl { if ($env:REPO_URL) { return $env:REPO_URL } return $script:DefaultRepoUrl }
function Get-GitBranch { if ($env:GIT_BRANCH) { return $env:GIT_BRANCH } return $script:DefaultBranch }
function Get-BackendUrl { if ($env:BACKEND_BASE_URL) { return $env:BACKEND_BASE_URL } return "http://localhost:4310" }

function Read-LsRemoteCommit {
  param([object[]]$Output, [string]$Branch)
  $line = @($Output | Where-Object { "$_" -match "^[0-9a-fA-F]{40}\s+" } | Select-Object -First 1)
  if (-not $line -or [string]::IsNullOrWhiteSpace("$line")) { throw "Live remote refs/heads/${Branch} did not return a commit SHA." }
  return (("$line" -split "\s+")[0]).Trim()
}

function Get-LocalCommit {
  return ((& git -C $script:RepoRoot rev-parse HEAD) -join "").Trim()
}

function Ensure-OriginRemote {
  param([string]$RepoUrl = (Get-RepoUrl))
  & git -C $script:RepoRoot remote get-url origin *> $null
  if ($LASTEXITCODE -ne 0) { Invoke-Logged "git" @("-C", $script:RepoRoot, "remote", "add", "origin", $RepoUrl) $script:RepoRoot }
  Invoke-Logged "git" @("-C", $script:RepoRoot, "remote", "set-url", "origin", $RepoUrl) $script:RepoRoot
}

function Get-LiveRemoteCommit {
  param([string]$Branch = (Get-GitBranch), [string]$RepoUrl = (Get-RepoUrl))
  Ensure-OriginRemote -RepoUrl $RepoUrl
  $output = & git -C $script:RepoRoot ls-remote origin "refs/heads/$Branch" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Unable to contact live remote origin refs/heads/${Branch}: $($output -join ' ')" }
  return Read-LsRemoteCommit -Output $output -Branch $Branch
}

function Refresh-RemoteBranch {
  param([string]$Branch = (Get-GitBranch))
  Invoke-Logged "git" @("-C", $script:RepoRoot, "fetch", "--prune", "origin", "+refs/heads/${Branch}:refs/remotes/origin/${Branch}") $script:RepoRoot
}

function Get-AheadBehind {
  param([string]$Branch = (Get-GitBranch))
  Refresh-RemoteBranch -Branch $Branch
  $output = & git -C $script:RepoRoot rev-list --left-right --count "HEAD...origin/$Branch"
  if ($LASTEXITCODE -ne 0) { throw "Unable to compute ahead/behind for origin/${Branch}: $($output -join ' ')" }
  return (($output -join " ").Trim() -split "\s+")
}

function Write-UpdateStatus {
  param(
    [string]$Status = "pass",
    [string]$UpdateApplied = "true",
    [string]$RestartTriggered = "false",
    [string]$Message = "Repository force-refreshed.",
    [string]$LocalCommit = "",
    [string]$RemoteCommit = "",
    [string]$Ahead = "0",
    [string]$Behind = "0",
    [string]$Dirty = "false",
    [string]$BeforeLocalCommit = "",
    [string]$BeforeRemoteCommitLive = "",
    [string]$AfterLocalCommit = "",
    [string]$AfterRemoteCommitLive = "",
    [string]$CodeChanged = "false"
  )
  Ensure-RuntimeDirs
  $lines = @(
    "LAST_CHECK_AT=$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')",
    "STATUS=$Status",
    "UPDATE_APPLIED=$UpdateApplied",
    "RESTART_TRIGGERED=$RestartTriggered",
    "BRANCH=$(Get-GitBranch)",
    "LOCAL_COMMIT=$LocalCommit",
    "REMOTE_COMMIT=$RemoteCommit",
    "AHEAD=$Ahead",
    "BEHIND=$Behind",
    "DIRTY=$Dirty",
    "BEFORE_LOCAL_COMMIT=$BeforeLocalCommit",
    "BEFORE_REMOTE_COMMIT_LIVE=$BeforeRemoteCommitLive",
    "AFTER_LOCAL_COMMIT=$AfterLocalCommit",
    "AFTER_REMOTE_COMMIT_LIVE=$AfterRemoteCommitLive",
    "CODE_CHANGED=$CodeChanged",
    ('MESSAGE="{0}"' -f $Message.Replace('"', '\"'))
  )
  $lines | Set-Content -Path $script:UpdateStatusFile -Encoding UTF8
}

function Force-RefreshRepo {
  $repoRootExisted = Test-Path $script:RepoRoot
  Ensure-RuntimeDirs
  $repoUrl = Get-RepoUrl
  $branch = Get-GitBranch
  $beforeLocalCommit = ""
  $beforeRemoteCommitLive = ""
  try {
    if (-not $repoRootExisted) {
      New-Item -ItemType Directory -Force -Path (Split-Path $script:RepoRoot -Parent) | Out-Null
      $remoteOutput = & git ls-remote $repoUrl "refs/heads/$branch" 2>&1
      if ($LASTEXITCODE -ne 0) { throw "Unable to contact live remote refs/heads/${branch}: $($remoteOutput -join ' ')" }
      $beforeRemoteCommitLive = Read-LsRemoteCommit -Output $remoteOutput -Branch $branch
      Remove-Item -LiteralPath $script:RepoRoot -Recurse -Force -ErrorAction SilentlyContinue
      Invoke-Logged "git" @("clone", "-b", $branch, $repoUrl, $script:RepoRoot) (Split-Path $script:RepoRoot -Parent)
    }
    if (-not (Test-Path (Join-Path $script:RepoRoot ".git"))) { throw "Repo root exists but is not a git repo: $script:RepoRoot" }
    Write-Step "Force-refreshing repository state"
    Write-Warn "Local tracked and untracked changes in $script:RepoRoot will be overwritten for this backend workflow."
    $beforeLocalCommit = Get-LocalCommit
    $beforeRemoteCommitLive = Get-LiveRemoteCommit -Branch $branch -RepoUrl $repoUrl
    Write-Info "Live remote commit for origin/${branch}: $beforeRemoteCommitLive"
    Refresh-RemoteBranch -Branch $branch
    Write-Info ("Running: git -C {0} checkout {1}" -f $script:RepoRoot, $branch)
    & git -C $script:RepoRoot checkout $branch
    if ($LASTEXITCODE -ne 0) { Invoke-Logged "git" @("-C", $script:RepoRoot, "checkout", "-B", $branch, "origin/$branch") $script:RepoRoot }
    Invoke-Logged "git" @("-C", $script:RepoRoot, "reset", "--hard", "origin/$branch") $script:RepoRoot
    Invoke-Logged "git" @("-C", $script:RepoRoot, "clean", "-fd") $script:RepoRoot
    $afterLocalCommit = Get-LocalCommit
    $afterRemoteCommitLive = Get-LiveRemoteCommit -Branch $branch -RepoUrl $repoUrl
    if ($afterLocalCommit -ne $afterRemoteCommitLive) { throw "After force refresh, local HEAD $afterLocalCommit does not match live remote $afterRemoteCommitLive" }
    $aheadBehind = Get-AheadBehind -Branch $branch
    $codeChanged = if ($beforeLocalCommit -ne $afterLocalCommit) { "true" } else { "false" }
    $updateApplied = $codeChanged
    $message = if ($codeChanged -eq "true") { "Repository force-refreshed to live origin/$branch." } else { "Repository already matched live origin/$branch." }
    $script:LastRepoRefreshResult = [pscustomobject]@{
      BeforeLocalCommit = $beforeLocalCommit
      BeforeRemoteCommitLive = $beforeRemoteCommitLive
      AfterLocalCommit = $afterLocalCommit
      AfterRemoteCommitLive = $afterRemoteCommitLive
      CodeChanged = $codeChanged
      Ahead = $aheadBehind[0]
      Behind = $aheadBehind[1]
      Message = $message
    }
    Write-UpdateStatus -Status "pass" -UpdateApplied $updateApplied -RestartTriggered "false" -Message $message -LocalCommit $afterLocalCommit -RemoteCommit $afterRemoteCommitLive -Ahead $aheadBehind[0] -Behind $aheadBehind[1] -BeforeLocalCommit $beforeLocalCommit -BeforeRemoteCommitLive $beforeRemoteCommitLive -AfterLocalCommit $afterLocalCommit -AfterRemoteCommitLive $afterRemoteCommitLive -CodeChanged $codeChanged
    Write-Ok "Local HEAD matches live remote $afterRemoteCommitLive"
  } catch {
    $localForStatus = if ($beforeLocalCommit) { $beforeLocalCommit } else { try { Get-LocalCommit } catch { "" } }
    $message = $_.Exception.Message
    Write-UpdateStatus -Status "fail" -UpdateApplied "false" -RestartTriggered "false" -Message $message -LocalCommit $localForStatus -RemoteCommit $beforeRemoteCommitLive -BeforeLocalCommit $beforeLocalCommit -BeforeRemoteCommitLive $beforeRemoteCommitLive -AfterLocalCommit $localForStatus -AfterRemoteCommitLive $beforeRemoteCommitLive -CodeChanged "false"
    throw
  }
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
  if (-not (Test-Path $nodeModules) -or -not (Test-Path $stamp)) { Invoke-Logged "npm.cmd" @("install") $script:RepoRoot; New-Item -ItemType File -Force -Path $stamp | Out-Null } else { Write-Info "Node dependencies already up to date" }
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
  foreach ($cmd in @("git", "node", "npm.cmd", "docker")) { if (-not (Test-CommandExists $cmd)) { throw "Required command missing: $cmd" } }
  Ensure-RuntimeDirs
  Import-DotEnv
  Set-CanonicalDatabaseIdentity
  Ensure-Docker
  Install-NodeDependenciesIfNeeded
  Install-MLRequirementsIfNeeded
}

function Start-Postgres {
  Write-Step "Starting Postgres via docker compose"
  Test-PostgresContainerIdentity
  Invoke-Logged "docker" @("compose", "up", "-d", "postgres") $script:RepoRoot
  Test-PostgresContainerIdentity
}

function Test-PostgresContainerIdentity {
  $container = if ($env:POSTGRES_CONTAINER_NAME) { $env:POSTGRES_CONTAINER_NAME } else { $script:CanonicalPostgresContainer }
  $inspect = docker inspect $container 2>$null
  if ($LASTEXITCODE -ne 0) { return }
  $envLines = docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' $container 2>$null
  $hasOldUser = @($envLines | Where-Object { $_ -eq "POSTGRES_USER=postgres" }).Count -gt 0
  $hasOldDb = @($envLines | Where-Object { $_ -eq "POSTGRES_DB=tichuml" }).Count -gt 0
  if ($hasOldUser -or $hasOldDb) {
    throw "Existing $container uses old Postgres identity (POSTGRES_USER=postgres or POSTGRES_DB=tichuml). Run scripts\windows\reset-db.ps1 to recreate it."
  }
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
  Invoke-Logged "npm.cmd" @("run", "db:migrate") $script:RepoRoot
}

function Build-BackendArtifacts {
  Write-Step "Building backend and simulator runtime artifacts"
  $scripts = @("build:shared", "build:engine", "build:telemetry", "build:ai", "build:ui-kit", "build:server", "build:sim-runner", "build:web")
  foreach ($s in $scripts) { Invoke-Logged "npm.cmd" @("run", $s) $script:RepoRoot }
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
  if ($existing) { Write-Warn "Backend is already running with pid $existing"; Stop-BackendProcess }
  Stop-StaleBackendListeners
  Write-Step "Starting backend process"
  $cmd = "npm run dev:server *> `"$script:LogFile`""
  $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "cd `"$script:RepoRoot`"; $cmd") -WindowStyle Hidden -PassThru
  Set-Content -Path $script:PidFile -Value $proc.Id -Encoding UTF8
  Write-Ok "Backend started with pid $($proc.Id)"
}

function Stop-StaleBackendListeners {
  $port = if ($env:PORT) { [int]$env:PORT } else { 4310 }
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $owningPid = [int]$listener.OwningProcess
    if ($owningPid -eq $PID) { continue }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$owningPid" -ErrorAction SilentlyContinue
    $cmd = if ($proc) { $proc.CommandLine } else { "" }
    if ($cmd -match "tichuml|dev:server|@tichuml/server|apps/server|node|tsx|npm") {
      Write-Warn "Stopping stale backend listener on port $port with pid $owningPid"
      Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
    } else {
      throw "Port $port is already in use by pid $owningPid ($cmd). Stop it or choose another PORT."
    }
  }
}

function Stop-BackendProcess {
  $backendPid = Get-BackendPid
  if (-not $backendPid) { Write-Warn "Backend pid file missing or process is not running"; Remove-Item $script:PidFile -Force -ErrorAction SilentlyContinue; return }
  Write-Step "Stopping backend process"
  Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
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
  foreach ($cmd in @("git", "node", "npm.cmd", "docker")) { if (Test-CommandExists $cmd) { Write-Ok "$cmd is installed" } else { Write-Fail "$cmd is missing" } }
  if (Test-DockerReachable) { Write-Ok "Docker daemon is running" } else { Write-Fail "Docker daemon is not running" }
  $container = if ($env:POSTGRES_CONTAINER_NAME) { $env:POSTGRES_CONTAINER_NAME } else { "tichu-postgres" }
  try {
    $running = docker inspect -f "{{.State.Running}}" $container 2>$null
    if ($running -eq "true") { Write-Ok "Postgres container is running" } else { Write-Fail "Postgres container is not running" }
  } catch { Write-Fail "Postgres container not found" }
  $backendPid = Get-BackendPid
  if ($backendPid) {
    Write-Ok "Backend process is running with pid $backendPid"
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$backendPid" -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Info "Backend command line: $($proc.CommandLine)"
      Write-Info "Backend cwd: $script:RepoRoot"
      Write-Info ("Backend DATABASE_URL: {0}" -f (ConvertTo-SafeDatabaseUrl $env:DATABASE_URL))
    }
  } else { Write-Fail "Backend process is not running" }
  [void](Test-BackendHealth)
}
