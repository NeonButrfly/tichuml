#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/linux/runtime-action.sh <action>

Actions:
  start_backend
  stop_backend
  restart_backend
  full_restart
  start_postgres
  stop_postgres
  update_repo
  clear_db
  apply_config_restart
EOF
}

reset_database() {
  log_step "Resetting Postgres database"
  ensure_docker_running
  start_postgres
  wait_for_postgres
  log_warn "Dropping and recreating public schema in database '$POSTGRES_DB'"
  docker_compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL
  run_migrations
  log_ok "Database reset and migrations completed"
}

main() {
  if [ "$#" -ne 1 ]; then
    usage >&2
    exit 2
  fi

  local action="$1"
  load_repo_env
  ensure_runtime_dirs
  log_action_result "$action" "started" "runtime action accepted"

  case "$action" in
    start_backend)
      "$SCRIPT_DIR/start-backend.sh"
      ;;
    stop_backend)
      "$SCRIPT_DIR/stop-backend.sh" --backend-only
      ;;
    restart_backend|apply_config_restart)
      "$SCRIPT_DIR/stop-backend.sh" --backend-only
      "$SCRIPT_DIR/start-backend.sh"
      ;;
    full_restart)
      "$SCRIPT_DIR/stop-backend.sh" --full
      "$SCRIPT_DIR/start-backend.sh"
      ;;
    start_postgres)
      ensure_docker_running
      start_postgres
      wait_for_postgres
      ;;
    stop_postgres)
      stop_postgres
      ;;
    update_repo)
      "$SCRIPT_DIR/update-backend.sh"
      ;;
    clear_db)
      reset_database
      ;;
    *)
      log_action_result "$action" "error" "unsupported runtime action"
      log_fail "Unsupported runtime action: $action"
      usage >&2
      exit 2
      ;;
  esac

  log_action_result "$action" "ok" "runtime action completed"
}

main "$@"
