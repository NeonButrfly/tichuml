#!/usr/bin/env bash
set -Eeuo pipefail

script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

repo_root() {
  CDPATH= cd -- "$(script_dir)/.." && pwd
}

print_help() {
  cat <<'EOF'
Usage:
  scripts/start-backend.sh [options]

Starts the backend using the repo's canonical Linux backend workflow.

Options:
  --host <host>          Override HOST for the backend process.
  --port <port>          Override PORT for the backend process.
  --backend-url <url>    Override BACKEND_BASE_URL for the backend process.
  --pg-host <host>       Override PostgreSQL host in DATABASE_URL.
  --pg-port <port>       Override PostgreSQL port in DATABASE_URL.
  --pg-user <user>       Override PostgreSQL user in DATABASE_URL.
  --pg-db <db>           Override PostgreSQL database in DATABASE_URL.
  --pg-password <pass>   Override PostgreSQL password in DATABASE_URL.
  --docker               Use the default Docker-backed backend workflow.
  --no-docker            Not supported by the current backend host flow.
  --logs                 Tail backend logs after startup.
  --follow               Alias for --logs.
  --dry-run              Print the resolved command without starting the backend.
  --help, -h             Show this help text and exit.

Examples:
  scripts/start-backend.sh
  scripts/start-backend.sh --backend-url http://127.0.0.1:4310 --logs
  scripts/start-backend.sh --pg-host 127.0.0.1 --pg-port 54329 --pg-user tichu --pg-db tichu
EOF
}

HOST_VALUE=""
PORT_VALUE=""
BACKEND_URL_VALUE=""
PG_HOST_VALUE="127.0.0.1"
PG_PORT_VALUE="54329"
PG_USER_VALUE="tichu"
PG_DB_VALUE="tichu"
PG_PASSWORD_VALUE="tichu_dev_password"
TAIL_LOGS="false"
DRY_RUN="false"

while (($#)); do
  case "$1" in
    --host)
      HOST_VALUE="${2:?missing value for --host}"
      shift 2
      ;;
    --port)
      PORT_VALUE="${2:?missing value for --port}"
      shift 2
      ;;
    --backend-url)
      BACKEND_URL_VALUE="${2:?missing value for --backend-url}"
      shift 2
      ;;
    --pg-host)
      PG_HOST_VALUE="${2:?missing value for --pg-host}"
      shift 2
      ;;
    --pg-port)
      PG_PORT_VALUE="${2:?missing value for --pg-port}"
      shift 2
      ;;
    --pg-user)
      PG_USER_VALUE="${2:?missing value for --pg-user}"
      shift 2
      ;;
    --pg-db)
      PG_DB_VALUE="${2:?missing value for --pg-db}"
      shift 2
      ;;
    --pg-password)
      PG_PASSWORD_VALUE="${2:?missing value for --pg-password}"
      shift 2
      ;;
    --docker)
      shift
      ;;
    --no-docker)
      echo "The current backend host workflow requires Docker for Postgres; --no-docker is not supported." >&2
      exit 2
      ;;
    --logs|--follow)
      TAIL_LOGS="true"
      shift
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

ROOT="$(repo_root)"
DB_URL="postgres://${PG_USER_VALUE}:${PG_PASSWORD_VALUE}@${PG_HOST_VALUE}:${PG_PORT_VALUE}/${PG_DB_VALUE}"
BOOTSTRAP_URL="postgres://${PG_USER_VALUE}:${PG_PASSWORD_VALUE}@${PG_HOST_VALUE}:${PG_PORT_VALUE}/postgres"

echo "Repo root: $ROOT"
echo "Backend command: scripts/linux/start-backend.sh"
echo "Backend URL: ${BACKEND_URL_VALUE:-http://127.0.0.1:${PORT_VALUE:-4310}}"
echo "Health endpoint: ${BACKEND_URL_VALUE:-http://127.0.0.1:${PORT_VALUE:-4310}}/health"
echo "Database target: postgres://${PG_USER_VALUE}:***@${PG_HOST_VALUE}:${PG_PORT_VALUE}/${PG_DB_VALUE}"

if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

cd "$ROOT"
START_ENV=(
  "DATABASE_URL=$DB_URL"
  "PG_BOOTSTRAP_URL=$BOOTSTRAP_URL"
  "POSTGRES_USER=$PG_USER_VALUE"
  "POSTGRES_PASSWORD=$PG_PASSWORD_VALUE"
  "POSTGRES_DB=$PG_DB_VALUE"
  "POSTGRES_PORT=$PG_PORT_VALUE"
)
if [[ -n "$HOST_VALUE" ]]; then
  START_ENV+=("HOST=$HOST_VALUE")
fi
if [[ -n "$PORT_VALUE" ]]; then
  START_ENV+=("PORT=$PORT_VALUE")
fi
if [[ -n "$BACKEND_URL_VALUE" ]]; then
  START_ENV+=("BACKEND_BASE_URL=$BACKEND_URL_VALUE" "BACKEND_URL=$BACKEND_URL_VALUE")
fi
env "${START_ENV[@]}" bash scripts/linux/start-backend.sh

if [[ "$TAIL_LOGS" == "true" ]]; then
  exec bash scripts/backend-logs.sh --follow
fi
