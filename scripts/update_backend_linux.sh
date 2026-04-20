#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-linux-common.sh"

main() {
  load_repo_env
  ensure_runtime_dirs
  require_command git

  local branch local_commit remote_commit ahead behind dirty update_applied restart_triggered status message
  branch="$GIT_BRANCH"
  update_applied=false
  restart_triggered=false
  status="ok"
  message="Repository already up to date."

  if repo_dirty; then
    local_commit="$(git_local_commit)"
    git -C "$BACKEND_REPO_ROOT" fetch origin "$branch" >/dev/null 2>&1 || true
    remote_commit="$(git_remote_commit 2>/dev/null || printf '%s\n' "$local_commit")"
    set -- $(git_ahead_behind 2>/dev/null || printf '0 0')
    ahead="$1"
    behind="$2"
    dirty=true
    message="Repository is dirty; skipping update to avoid overwriting local changes."
    write_update_status "warn" "$update_applied" "$restart_triggered" "$message" "$local_commit" "$remote_commit" "$ahead" "$behind" "$dirty"
    log_warn "$message"
    return
  fi

  git -C "$BACKEND_REPO_ROOT" fetch origin "$branch"
  local_commit="$(git_local_commit)"
  remote_commit="$(git_remote_commit)"
  set -- $(git_ahead_behind)
  ahead="$1"
  behind="$2"
  dirty=false

  if [ "$behind" -gt 0 ] && [ "$ahead" -gt 0 ]; then
    status="fail"
    message="Repository has diverged from origin/$branch; manual intervention required."
    write_update_status "$status" "$update_applied" "$restart_triggered" "$message" "$local_commit" "$remote_commit" "$ahead" "$behind" "$dirty"
    log_fail "$message"
    exit 1
  fi

  if [ "$behind" -eq 0 ]; then
    write_update_status "$status" "$update_applied" "$restart_triggered" "$message" "$local_commit" "$remote_commit" "$ahead" "$behind" "$dirty"
    log_info "Branch: $branch"
    log_info "Local commit: $local_commit"
    log_info "Remote commit: $remote_commit"
    log_info "Update applied: $update_applied"
    log_info "Restart triggered: $restart_triggered"
    log_ok "$message"
    return
  fi

  local backend_was_running
  if backend_running; then
    backend_was_running=true
  else
    backend_was_running=false
  fi

  git -C "$BACKEND_REPO_ROOT" pull --ff-only origin "$branch"
  load_repo_env

  install_node_dependencies_if_needed
  install_ml_requirements_if_needed
  ensure_docker_running
  start_postgres
  wait_for_postgres

  run_migrations
  build_runtime_artifacts
  update_applied=true
  message="Pulled latest code from origin/$branch."

  if [ "$backend_was_running" = true ]; then
    stop_backend
    start_backend_background
    restart_triggered=true
    message="Pulled latest code from origin/$branch and restarted the backend."
  fi

  local_commit="$(git_local_commit)"
  remote_commit="$(git_remote_commit)"
  set -- $(git_ahead_behind)
  ahead="$1"
  behind="$2"

  write_update_status "$status" "$update_applied" "$restart_triggered" "$message" "$local_commit" "$remote_commit" "$ahead" "$behind" "$dirty"
  log_info "Branch: $branch"
  log_info "Local commit: $local_commit"
  log_info "Remote commit: $remote_commit"
  log_info "Update applied: $update_applied"
  log_info "Restart triggered: $restart_triggered"
  log_ok "$message"
}

main "$@"
