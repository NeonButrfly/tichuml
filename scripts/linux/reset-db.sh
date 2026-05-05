#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

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
  log_fail "Refusing to destroy Postgres without --yes."
  exit 2
fi

ensure_repo_root
ensure_runtime_dirs
assert_postgres_identity
ensure_docker_ready
print_identity

log_step "Resetting canonical local Postgres"
docker_compose down -v --remove-orphans
docker rm -f "${POSTGRES_CONTAINER_NAME:-tichu-postgres}" >/dev/null 2>&1 || true
docker_compose up -d postgres
wait_for_postgres
run_migrations

log_ok "Postgres reset and migrations completed"
