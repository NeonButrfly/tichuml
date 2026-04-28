param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresDb = "tichu",
  [switch]$ClearDatabase,
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
$params = @{
  RepoRoot = $RepoRoot
  BackendUrl = $BackendUrl
  PostgresContainer = $PostgresContainer
  PostgresUser = $PostgresUser
  PostgresDb = $PostgresDb
  TimeoutSeconds = $TimeoutSeconds
}
if ($ClearDatabase) { $params.ClearDatabase = $true }
& (Join-Path $PSScriptRoot "windows\\verify-sim-one-game-fixed.ps1") @params
