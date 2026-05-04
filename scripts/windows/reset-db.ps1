param(
  [string]$RepoRoot = "C:\tichu\tichuml",
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
  scripts\windows\reset-db.ps1 [options]

Stops the backend, recreates the Postgres data volume, and reruns migrations.

Options:
  -RepoRoot <path>
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

Write-Step "Resetting Windows Postgres container"
Ensure-RuntimeDirs
Import-DotEnv
Set-CanonicalDatabaseIdentity -PostgresContainer $PostgresContainer -PostgresUser $PostgresUser -PostgresPassword $PostgresPassword -PostgresDb $PostgresDb -PostgresPort $PostgresPort
Stop-BackendProcess
docker compose down -v
if ($LASTEXITCODE -ne 0) { throw "docker compose down -v failed" }
Start-Postgres
Wait-Postgres
Run-Migrations
Write-Ok "Postgres reset completed with canonical identity."
