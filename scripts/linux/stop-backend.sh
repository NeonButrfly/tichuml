#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

STOP_POSTGRES=false

usage() {
  cat <<'EOF'
Usage: scripts/linux/stop-backend.sh [--backend-only|--full|--keep-postgres]

Stops the Linux backend host services safely.

Modes:
  --backend-only    Stop backend and backend-owned controller processes only.
  --keep-postgres   Alias for --backend-only.
  --full            Stop backend/controller processes and the Postgres container.

Default: --backend-only
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backend-only|--keep-postgres)
      STOP_POSTGRES=false
      ;;
    --full)
      STOP_POSTGRES=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      log_fail "Unknown stop option: $1"
      usage >&2
      exit 2
      ;;
  esac
  shift
done

main() {
  log_step "Stopping Linux backend host flow"
  load_repo_env
  ensure_runtime_dirs

  stop_sim_controller_runtime

  log_step "Stopping backend process"
  if backend_running || backend_port_listening; then
    stop_backend
    log_ok "Backend process stopped"
  else
    rm -f "$BACKEND_PID_FILE"
    log_ok "Backend process is already stopped"
  fi

  if [ "$STOP_POSTGRES" = true ]; then
    stop_postgres
  else
    log_info "Keeping Postgres running (use --full to stop it)"
  fi

  log_action_result "stop_backend" "ok" "backend_stop_complete full=$STOP_POSTGRES"
  cat <<EOF

[OK] Backend stop flow completed.
Backend pid file: $BACKEND_PID_FILE
Postgres stopped: $STOP_POSTGRES
EOF
}

main "$@"
