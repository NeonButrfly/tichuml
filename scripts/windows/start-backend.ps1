param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [string]$DatabaseUrl = "postgres://tichu:tichu_dev_password@localhost:54329/tichu",
  [string]$BootstrapUrl = "postgres://tichu:tichu_dev_password@localhost:54329/postgres",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresPassword = "tichu_dev_password",
  [string]$PostgresDb = "tichu",
  [string]$PostgresPort = "54329",
  [string]$BackendUrl = "http://localhost:4310"
)

$env:BACKEND_REPO_ROOT = $RepoRoot
. "$PSScriptRoot\backend-common.ps1"
Write-Step "Starting Windows backend host flow"
Ensure-RuntimeDirs
Ensure-EnvFile
Import-DotEnv
if ($env:AUTO_UPDATE_ON_START -eq "true") { Force-RefreshRepo; . "$PSScriptRoot\backend-common.ps1"; Import-DotEnv }
Prepare-RuntimeStack
Set-CanonicalDatabaseIdentity -DatabaseUrl $DatabaseUrl -BootstrapUrl $BootstrapUrl -PostgresContainer $PostgresContainer -PostgresUser $PostgresUser -PostgresPassword $PostgresPassword -PostgresDb $PostgresDb -PostgresPort $PostgresPort
$env:BACKEND_BASE_URL = $BackendUrl
Start-Postgres
Wait-Postgres
Build-BackendArtifacts
Run-Migrations
Start-BackendProcess
Show-BackendStatus
