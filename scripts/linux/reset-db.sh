#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

CONFIRM=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes|--clear-database|--reset)
      CONFIRM=true
      ;;
    --help|-h)
      echo "Usage: scripts/linux/reset-db.sh --yes"
      exit 0
      ;;
    *)
      log_fail "Unknown reset-db option: $1"
      exit 2
      ;;
  esac
  shift
done

if [ "$CONFIRM" != true ]; then
  log_fail "Refusing to destroy Postgres without --yes."
  exit 2
fi

ensure_repo_root
ensure_runtime_dirs
ensure_docker_ready
print_identity
log_step "Resetting canonical local Postgres"
(cd "$BACKEND_REPO_ROOT" && docker_compose down -v --remove-orphans)
docker rm -f "$POSTGRES_CONTAINER_NAME" >/dev/null 2>&1 || true
(cd "$BACKEND_REPO_ROOT" && docker_compose up -d postgres)
wait_for_postgres
(cd "$BACKEND_REPO_ROOT" && npm run db:migrate)
log_ok "Postgres reset and migrations completed"
