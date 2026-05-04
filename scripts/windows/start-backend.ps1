param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [Alias("Host")]
  [string]$BindHost,
  [Alias("Port")]
  [string]$BindPort,
  [string]$PgHost = "127.0.0.1",
  [string]$PgPort = "54329",
  [string]$PgUser = "tichu",
  [string]$PgDb = "tichu",
  [string]$PgPassword = "tichu_dev_password",
  [switch]$Docker,
  [switch]$NoDocker,
  [switch]$Logs,
  [switch]$Follow,
  [string]$DatabaseUrl = "postgres://tichu:tichu_dev_password@localhost:54329/tichu",
  [string]$BootstrapUrl = "postgres://tichu:tichu_dev_password@localhost:54329/postgres",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresPassword = "tichu_dev_password",
  [string]$PostgresDb = "tichu",
  [string]$PostgresPort = "54329",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [switch]$DryRun,
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\windows\start-backend.ps1 [options]

Starts the canonical Windows backend host flow.
If AUTO_UPDATE_ON_START=true in the repo env, this flow can force-refresh the
repo before startup.

Options:
  -RepoRoot <path>
  -Host <host>
  -Port <port>
  -BackendUrl <url>
  -PgHost <host>
  -PgPort <port>
  -PgUser <user>
  -PgDb <db>
  -PgPassword <password>
  -Docker
  -NoDocker
  -Logs
  -Follow
  -DatabaseUrl <url>
  -BootstrapUrl <url>
  -PostgresContainer <name>
  -PostgresUser <user>
  -PostgresPassword <password>
  -PostgresDb <db>
  -PostgresPort <port>
  -BackendUrl <url>
  -DryRun
  -Help, -?
"@ | Write-Host
  exit 0
}

if ($NoDocker) {
  throw "The current Windows backend host flow requires Docker for Postgres; -NoDocker is not supported."
}

if ($PSBoundParameters.ContainsKey("PgUser")) { $PostgresUser = $PgUser }
if ($PSBoundParameters.ContainsKey("PgPassword")) { $PostgresPassword = $PgPassword }
if ($PSBoundParameters.ContainsKey("PgDb")) { $PostgresDb = $PgDb }
if ($PSBoundParameters.ContainsKey("PgPort")) { $PostgresPort = $PgPort }
if (-not $PSBoundParameters.ContainsKey("DatabaseUrl")) {
  $DatabaseUrl = "postgres://$PgUser`:$PgPassword@$PgHost`:$PgPort/$PgDb"
}
if (-not $PSBoundParameters.ContainsKey("BootstrapUrl")) {
  $BootstrapUrl = "postgres://$PgUser`:$PgPassword@$PgHost`:$PgPort/postgres"
}
if ($BindHost) { $env:HOST = $BindHost }
if ($BindPort) { $env:PORT = $BindPort }

if ($DryRun) {
  Write-Host "Repo root: $RepoRoot"
  Write-Host "Backend command: scripts\\windows\\start-backend.ps1"
  Write-Host "Backend URL: $BackendUrl"
  Write-Host "Health endpoint: $BackendUrl/health"
  Write-Host ("Database target: {0}" -f ($DatabaseUrl -replace "//([^:/@]+):([^@/]+)@", '//$1:***@'))
  exit 0
}

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

if ($Logs -or $Follow) {
  & (Join-Path $PSScriptRoot "backend-logs.ps1") -Follow:$true
}
