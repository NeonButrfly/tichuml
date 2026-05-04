[CmdletBinding()]
param(
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [string]$PgHost = "127.0.0.1",
  [string]$PgPort = "54329",
  [string]$PgUser = "tichu",
  [string]$PgDb = "tichu",
  [switch]$DryRun,
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Show-HelpText {
@"
Usage:
  scripts\windows\backend-health.ps1 [options]

Checks the backend health endpoint and prints the backend/database targets.

Options:
  -BackendUrl <url>     Backend base URL. Default: http://127.0.0.1:4310
  -PgHost <host>        PostgreSQL host display value.
  -PgPort <port>        PostgreSQL port display value.
  -PgUser <user>        PostgreSQL user display value.
  -PgDb <db>            PostgreSQL database display value.
  -DryRun               Print the resolved health target without calling it.
  -Help, -?             Show this help text and exit.
"@
}

if ($Help) {
  Show-HelpText
  exit 0
}

Write-Host "Backend URL: $BackendUrl"
Write-Host "Health endpoint: $BackendUrl/health"
Write-Host ("Database target: postgres://{0}:***@{1}:{2}/{3}" -f $PgUser, $PgHost, $PgPort, $PgDb)

if ($DryRun) {
  exit 0
}

Invoke-RestMethod -Uri "$BackendUrl/health"
