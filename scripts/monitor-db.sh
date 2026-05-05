#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'EOF'
Usage:
  scripts/monitor-db.sh [options]

Purpose:
  Repeatedly prints recent telemetry table counts and rows from the local Postgres container.

Options:
  --interval-seconds <count>  Refresh interval. Default: 2
  --container <name>          Postgres container. Default: tichu-postgres
  --user <name>               Postgres user. Default: tichu
  --db <name>                 Postgres database. Default: tichu
  --help, -h                  Show this help text.

Examples:
  scripts/monitor-db.sh --interval-seconds 5

Environment:
  Auto-detects nothing beyond Docker. Requires the local Postgres container to be running.
EOF
}

INTERVAL_SECONDS="2"
CONTAINER="tichu-postgres"
USER_NAME="tichu"
DB_NAME="tichu"

while (($#)); do
  case "$1" in
    --interval-seconds) INTERVAL_SECONDS="${2:?missing value for --interval-seconds}"; shift 2 ;;
    --container) CONTAINER="${2:?missing value for --container}"; shift 2 ;;
    --user) USER_NAME="${2:?missing value for --user}"; shift 2 ;;
    --db) DB_NAME="${2:?missing value for --db}"; shift 2 ;;
    --help|-h) print_help; exit 0 ;;
    *) echo "Unknown monitor-db option: $1" >&2; print_help >&2; exit 2 ;;
  esac
done

while true; do
  clear || true
  printf 'Tichu telemetry DB monitor - %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker exec "$CONTAINER" psql -U "$USER_NAME" -d "$DB_NAME" -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;"
  docker exec "$CONTAINER" psql -U "$USER_NAME" -d "$DB_NAME" -c "SELECT id, game_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 8;"
  docker exec "$CONTAINER" psql -U "$USER_NAME" -d "$DB_NAME" -c "SELECT id, game_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 8;"
  sleep "$INTERVAL_SECONDS"
done
