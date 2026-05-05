param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresPassword = "tichu_dev_password",
  [string]$PostgresDb = "tichu",
  [string]$PostgresPort = "54329",
  [switch]$Yes,
  [switch]$ClearDatabase,
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\reset-db.ps1 [options]

Stops the backend, recreates the Postgres data volume, and reruns migrations.

Options:
  -RepoRoot <path>
  -PostgresContainer <name>
  -PostgresUser <user>
  -PostgresPassword <password>
  -PostgresDb <database>
  -PostgresPort <port>
  -Yes or -ClearDatabase
      Required confirmation. This script destroys and recreates the local
      Postgres data volume.
  -Help, -?

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\reset-db.ps1 -ClearDatabase

Destructive warning:
  Refuses to run unless -Yes or -ClearDatabase is passed.
"@ | Write-Host
  exit 0
}

if (-not $Yes -and -not $ClearDatabase) {
  Write-Error "Refusing to destroy Postgres without -Yes or -ClearDatabase."
  exit 2
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
