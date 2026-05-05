#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

usage() {
  echo "Usage: scripts/linux/reset-db.sh --yes"
}

CONFIRM=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes|--clear-database|--reset) CONFIRM=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown reset-db option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

if [ "$CONFIRM" != true ]; then
  echo "Refusing to destroy Postgres without --yes." >&2
  exit 2
fi

# fallback-safe logging (in case backend-common.sh is missing pieces)
log_step() { command -v log_step >/dev/null 2>&1 && command log_step "$@" || echo "==> $*"; }
log_ok()   { command -v log_ok   >/dev/null 2>&1 && command log_ok   "$@" || echo "OK: $*"; }
log_fail() { command -v log_fail >/dev/null 2>&1 && command log_fail "$@" || echo "FAIL: $*" >&2; }

docker_compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

ensure_repo_root() {
  if [ ! -f "$REPO_ROOT/package.json" ]; then
    log_fail "Could not find repo root at $REPO_ROOT"
    exit 1
  fi
  export BACKEND_REPO_ROOT="${BACKEND_REPO_ROOT:-$REPO_ROOT}"
}

ensure_repo_root
ensure_runtime_dirs || true
ensure_docker_ready || true
print_identity || true

log_step "Resetting canonical local Postgres"

cd "$BACKEND_REPO_ROOT"

docker_compose down -v --remove-orphans
docker rm -f "${POSTGRES_CONTAINER_NAME:-tichu-postgres}" >/dev/null 2>&1 || true
docker_compose up -d postgres

wait_for_postgres || {
  log_fail "Postgres did not become ready"
  exit 1
}

npm run db:migrate

log_ok "Postgres reset and migrations completed"