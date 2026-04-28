#!/usr/bin/env bash

set -euo pipefail

linux_script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

linux_repo_root() {
  local script_dir candidate
  script_dir="$(linux_script_dir)"
  candidate="${TICHU_REPO_ROOT:-${BACKEND_REPO_ROOT:-}}"
  if [ -n "$candidate" ]; then
    CDPATH= cd -- "$candidate" && pwd
    return
  fi
  candidate="$(CDPATH= cd -- "$script_dir/../.." && pwd)"
  if [ -d "$candidate/.git" ]; then
    printf '%s\n' "$candidate"
    return
  fi
  if [ -d /opt/tichuml/.git ]; then
    printf '%s\n' /opt/tichuml
    return
  fi
  printf '%s\n' "$candidate"
}

export BACKEND_REPO_ROOT="${BACKEND_REPO_ROOT:-$(linux_repo_root)}"
export TICHU_REPO_ROOT="$BACKEND_REPO_ROOT"
export POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-tichu-postgres}"
export POSTGRES_USER="${POSTGRES_USER:-tichu}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-tichu_dev_password}"
export POSTGRES_DB="${POSTGRES_DB:-tichu}"
export POSTGRES_PORT="${POSTGRES_PORT:-54329}"
export DATABASE_URL="${DATABASE_URL:-postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/$POSTGRES_DB}"
export PG_BOOTSTRAP_URL="${PG_BOOTSTRAP_URL:-postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:$POSTGRES_PORT/postgres}"
export BACKEND_BASE_URL="${BACKEND_BASE_URL:-http://127.0.0.1:4310}"
export PORT="${PORT:-4310}"
export BACKEND_RUNTIME_DIR="${BACKEND_RUNTIME_DIR:-$BACKEND_REPO_ROOT/.runtime}"
export BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-$BACKEND_RUNTIME_DIR/backend.log}"
export SIM_LOG_DIR="${SIM_LOG_DIR:-$BACKEND_REPO_ROOT/logs/sim-training}"

log_step() { printf '\n==> %s\n' "$1"; }
log_info() { printf '[INFO] %s\n' "$1"; }
log_ok() { printf '[OK] %s\n' "$1"; }
log_warn() { printf '[WARN] %s\n' "$1"; }
log_fail() { printf '[FAIL] %s\n' "$1" >&2; }

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_fail "Required command '$1' was not found in PATH."
    exit 1
  fi
}

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$BACKEND_REPO_ROOT/docker-compose.yml" "$@"
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$BACKEND_REPO_ROOT/docker-compose.yml" "$@"
    return
  fi
  log_fail "Docker Compose is unavailable."
  exit 1
}

ensure_runtime_dirs() {
  mkdir -p "$BACKEND_RUNTIME_DIR" "$SIM_LOG_DIR" "$BACKEND_REPO_ROOT/diagnostics"
}

ensure_repo_root() {
  if [ ! -f "$BACKEND_REPO_ROOT/package.json" ]; then
    log_fail "Repo root is not valid: $BACKEND_REPO_ROOT"
    exit 1
  fi
}

ensure_docker_ready() {
  require_command docker
  if ! docker info >/dev/null 2>&1; then
    log_fail "Docker daemon is not reachable. Start Docker and rerun the script."
    exit 1
  fi
}

assert_postgres_identity() {
  ensure_docker_ready
  if ! docker inspect "$POSTGRES_CONTAINER_NAME" >/dev/null 2>&1; then
    return
  fi
  local env_lines
  env_lines="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$POSTGRES_CONTAINER_NAME" 2>/dev/null || true)"
  if printf '%s\n' "$env_lines" | grep -Eq '^POSTGRES_USER=postgres$|^POSTGRES_DB=tichuml$'; then
    log_fail "Existing $POSTGRES_CONTAINER_NAME uses the old Postgres identity. Run scripts/linux/reset-db.sh --yes to recreate it."
    exit 1
  fi
}

wait_for_postgres() {
  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if docker exec "$POSTGRES_CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      log_ok "Postgres is healthy in $POSTGRES_CONTAINER_NAME"
      return
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  log_fail "Postgres did not become healthy in time."
  exit 1
}

kill_sim_processes() {
  local pids pid
  pids="$(pgrep -f 'sim-runner|npm run sim|sim-controller|run-training-sim' || true)"
  for pid in $pids; do
    [ "$pid" = "$$" ] && continue
    kill "$pid" >/dev/null 2>&1 || true
  done
  sleep 1
  for pid in $pids; do
    [ "$pid" = "$$" ] && continue
    kill -0 "$pid" >/dev/null 2>&1 && kill -9 "$pid" >/dev/null 2>&1 || true
  done
}

db_count() {
  docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "SELECT COUNT(*) FROM $1;" | tr -d '[:space:]'
}

print_identity() {
  log_info "Repo root: $BACKEND_REPO_ROOT"
  log_info "Backend URL: $BACKEND_BASE_URL"
  log_info "Postgres: $POSTGRES_CONTAINER_NAME db=$POSTGRES_DB user=$POSTGRES_USER port=$POSTGRES_PORT"
  log_info "DATABASE_URL: $(printf '%s' "$DATABASE_URL" | sed -E 's#//([^:/@]+):([^@/]+)@#//\1:***@#')"
}
