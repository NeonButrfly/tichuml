#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
START_REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$START_REPO_ROOT/.env" ] && command -v node >/dev/null 2>&1; then
  eval "$(node "$START_REPO_ROOT/scripts/runtime-config.mjs" export-shell "$START_REPO_ROOT/.env")"
fi

if [ "$(uname -s)" = "Linux" ]; then
  printf '\n==> Force-syncing repository before backend startup\n'
  REPO_DIR="${REPO_DIR:-$START_REPO_ROOT}" \
    REPO_URL="${REPO_URL:-https://github.com/NeonButrfly/tichuml.git}" \
    BRANCH="${BRANCH:-${GIT_BRANCH:-main}}" \
    "$SCRIPT_DIR/force-sync.sh"
fi

# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

main() {
  log_step "Starting Linux backend host flow"
  load_repo_env
  ensure_runtime_dirs

  log_step "Startup checklist"
  log_info "1. Loading env from $BACKEND_REPO_ROOT/.env"
  log_info "2. Force-syncing repo to origin/$GIT_BRANCH"
  log_info "3. Verifying runtime prerequisites"
  log_info "4. Verifying Docker and Docker Compose"
  log_info "5. Starting Postgres and waiting for readiness"
  log_info "6. Ensuring Python venv and ML requirements"
  log_info "7. Ensuring Node workspace dependencies"
  log_info "8. Building workspace packages before migrations"
  log_info "9. Running database migrations"
  log_info "10. Starting backend and verifying HTTP endpoints"

  prepare_runtime_stack
  build_runtime_artifacts
  verify_runtime_artifacts
  run_migrations

  if backend_running; then
    log_warn "Backend is already running with pid $(backend_pid)"
    verify_backend_http_endpoints
    return
  fi

  start_backend_background
  verify_backend_http_endpoints

  local local_commit remote_commit ahead behind
  local_commit="$(git_local_commit)"
  log_info "Refreshing remote commit metadata for status output"
  git -C "$BACKEND_REPO_ROOT" fetch origin "$GIT_BRANCH" >/dev/null 2>&1 || true
  remote_commit="$(git_remote_commit 2>/dev/null || printf '%s\n' "$local_commit")"
  set -- $(git_ahead_behind 2>/dev/null || printf '0 0')
  ahead="$1"
  behind="$2"

  cat <<EOF
[OK] Backend started successfully.
Branch: $GIT_BRANCH
Local commit: $local_commit
Remote commit: $remote_commit
Ahead/behind: $ahead/$behind
Backend URLs:
- $BACKEND_PUBLIC_URL
- $BACKEND_LOCAL_URL
Control panel:
- $BACKEND_PUBLIC_URL/admin/control
Log file: $BACKEND_LOG_FILE
Runtime dir: $BACKEND_RUNTIME_DIR
EOF
}

main "$@"
