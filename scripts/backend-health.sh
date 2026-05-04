#!/usr/bin/env bash
set -Eeuo pipefail

BACKEND_URL="http://127.0.0.1:4310"
PG_HOST="127.0.0.1"
PG_PORT="54329"
PG_USER="tichu"
PG_DB="tichu"
DRY_RUN="false"

print_help() {
  cat <<'EOF'
Usage:
  scripts/backend-health.sh [options]

Checks the backend health endpoint and prints the backend/database targets.

Options:
  --backend-url <url>    Backend base URL. Default: http://127.0.0.1:4310
  --pg-host <host>       PostgreSQL host display value.
  --pg-port <port>       PostgreSQL port display value.
  --pg-user <user>       PostgreSQL user display value.
  --pg-db <db>           PostgreSQL database display value.
  --dry-run              Print the resolved health target without calling it.
  --help, -h             Show this help text and exit.
EOF
}

while (($#)); do
  case "$1" in
    --backend-url)
      BACKEND_URL="${2:?missing value for --backend-url}"
      shift 2
      ;;
    --pg-host)
      PG_HOST="${2:?missing value for --pg-host}"
      shift 2
      ;;
    --pg-port)
      PG_PORT="${2:?missing value for --pg-port}"
      shift 2
      ;;
    --pg-user)
      PG_USER="${2:?missing value for --pg-user}"
      shift 2
      ;;
    --pg-db)
      PG_DB="${2:?missing value for --pg-db}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help >&2
      exit 2
      ;;
  esac
done

echo "Backend URL: $BACKEND_URL"
echo "Health endpoint: $BACKEND_URL/health"
echo "Database target: postgres://${PG_USER}:***@${PG_HOST}:${PG_PORT}/${PG_DB}"

if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

curl -fsS "$BACKEND_URL/health"
