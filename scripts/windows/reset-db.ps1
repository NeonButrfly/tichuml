param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresPassword = "tichu_dev_password",
  [string]$PostgresDb = "tichu",
  [string]$PostgresPort = "54329"
)

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
