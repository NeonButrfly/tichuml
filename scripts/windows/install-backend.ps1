param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [string]$DatabaseUrl = "postgres://tichu:tichu_dev_password@localhost:54329/tichu",
  [string]$BootstrapUrl = "postgres://tichu:tichu_dev_password@localhost:54329/postgres",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresPassword = "tichu_dev_password",
  [string]$PostgresDb = "tichu",
  [string]$PostgresPort = "54329",
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\windows\install-backend.ps1 [options]

Installs and bootstraps the canonical Windows backend host flow.
This workflow force-refreshes the repo before rebuilding runtime artifacts.

Options:
  -RepoRoot <path>
  -DatabaseUrl <url>
  -BootstrapUrl <url>
  -PostgresContainer <name>
  -PostgresUser <user>
  -PostgresPassword <password>
  -PostgresDb <database>
  -PostgresPort <port>
  -Help, -?
"@ | Write-Host
  exit 0
}

$env:BACKEND_REPO_ROOT = $RepoRoot
. "$PSScriptRoot\backend-common.ps1"
Write-Step "Installing Windows backend host flow"
if (-not (Test-CommandExists "git")) { throw "Git is required. Install Git for Windows, then rerun." }
if (-not (Test-CommandExists "node")) { throw "Node.js is required. Install Node.js LTS, then rerun." }
if (-not (Test-CommandExists "npm")) { throw "npm is required. Install Node.js LTS, then rerun." }
if (-not (Test-CommandExists "docker")) { throw "Docker Desktop is required. Install/start Docker Desktop, then rerun." }
Ensure-RuntimeDirs
Ensure-EnvFile
Import-DotEnv
Force-RefreshRepo
. "$PSScriptRoot\backend-common.ps1"
Prepare-RuntimeStack
Set-CanonicalDatabaseIdentity -DatabaseUrl $DatabaseUrl -BootstrapUrl $BootstrapUrl -PostgresContainer $PostgresContainer -PostgresUser $PostgresUser -PostgresPassword $PostgresPassword -PostgresDb $PostgresDb -PostgresPort $PostgresPort
Start-Postgres
Wait-Postgres
Build-BackendArtifacts
Run-Migrations
Start-BackendProcess
Show-BackendStatus
Write-Ok "Windows backend host bootstrap completed."
Write-Host "Backend URL: $(Get-BackendUrl)"
Write-Host "Next commands:"
Write-Host "- Start/update backend: powershell -ExecutionPolicy Bypass -File scripts\windows\start-backend.ps1"
Write-Host "- Check backend status: powershell -ExecutionPolicy Bypass -File scripts\windows\status-backend.ps1"
Write-Host "- Stop backend: powershell -ExecutionPolicy Bypass -File scripts\windows\stop-backend.ps1"
Write-Host "- Run simulation: npm run sim -- --games 1000 --provider server_heuristic"
