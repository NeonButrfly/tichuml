while ($true) {
    Clear-Host
    Write-Host "Tichu telemetry DB monitor - $(Get-Date)"

    docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;"

    docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT id, game_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 8;"

    docker exec tichu-postgres psql -U tichu -d tichu -c "SELECT id, game_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 8;"

    Start-Sleep -Seconds 2
}