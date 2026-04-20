#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-linux-common.sh"

auto_update_enabled() {
  case "${AUTO_UPDATE_ON_START:-true}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

main() {
  load_repo_env
  ensure_runtime_dirs

  if auto_update_enabled; then
    log_info "Checking for backend updates on startup"
    if ! "$SCRIPT_DIR/update_backend_linux.sh"; then
      log_warn "Update step failed; continuing with the current checkout."
    fi
  fi

  prepare_runtime_stack
  build_runtime_artifacts

  if backend_running; then
    log_warn "Backend is already running with pid $(backend_pid)"
    return
  fi

  start_backend_background

  local local_commit remote_commit ahead behind
  local_commit="$(git_local_commit)"
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
Log file: $BACKEND_LOG_FILE
EOF
}

main "$@"
