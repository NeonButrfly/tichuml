param(
  [int]$IntervalSeconds = 2,
  [string]$Container = "tichu-postgres",
  [string]$User = "tichu",
  [string]$Db = "tichu",
  [Alias("?")]
  [switch]$Help
)

if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\monitor-db.ps1 [options]

Purpose:
  Repeatedly prints recent telemetry table counts and rows from the local Postgres container.

Options:
  -IntervalSeconds <count>  Refresh interval. Default: 2
  -Container <name>         Postgres container. Default: tichu-postgres
  -User <name>              Postgres user. Default: tichu
  -Db <name>                Postgres database. Default: tichu
  -Help, -?, --help, -h     Show this help text.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\monitor-db.ps1 -IntervalSeconds 5

Environment:
  Auto-detects nothing beyond Docker. Requires the local Postgres container to be running.
"@ | Write-Host
  exit 0
}

$ErrorActionPreference = "Stop"
while ($true) {
  Clear-Host
  Write-Host "Tichu telemetry DB monitor - $(Get-Date)"
  docker exec $Container psql -U $User -d $Db -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;"
  docker exec $Container psql -U $User -d $Db -c "SELECT id, game_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 8;"
  docker exec $Container psql -U $User -d $Db -c "SELECT id, game_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 8;"
  Start-Sleep -Seconds $IntervalSeconds
}
