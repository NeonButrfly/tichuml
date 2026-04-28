#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

main() {
  log_step "Checking Linux backend repository updates"
  load_repo_env
  ensure_runtime_dirs
  require_command git

  local branch local_commit remote_commit ahead behind dirty update_applied restart_triggered status message
  branch="$GIT_BRANCH"
  update_applied=false
  restart_triggered=false
  status="ok"
  message="Repository force-synced to origin/$branch."

  local backend_was_running
  if backend_running || health_endpoint_ready || backend_port_listening; then
    backend_was_running=true
  else
    backend_was_running=false
  fi

  log_step "Applying force update from origin/$branch"
  if repo_dirty; then
    log_warn "Repository is dirty; local changes will be overwritten by the backend update workflow."
  fi
  local_commit="$(git_local_commit)"
  git_force_sync_repo "$BACKEND_REPO_ROOT" "$branch" "$REPO_URL"
  load_repo_env

  install_node_dependencies_if_needed
  install_ml_requirements_if_needed
  ensure_docker_running
  start_postgres
  wait_for_postgres

  build_runtime_artifacts
  verify_runtime_artifacts
  run_migrations
  update_applied=true
  remote_commit="$(git_remote_commit)"
  if [ "$local_commit" = "$remote_commit" ]; then
    message="Repository already matched origin/$branch; runtime stack refreshed."
  else
    message="Force-synced latest code from origin/$branch."
  fi

  if [ "$backend_was_running" = true ]; then
    log_step "Restarting backend after update"
    stop_backend
    start_backend_background
    verify_backend_http_endpoints
    restart_triggered=true
    message="$message Backend restarted."
  fi

  local_commit="$(git_local_commit)"
  remote_commit="$(git_remote_commit)"
  set -- $(git_ahead_behind)
  ahead="$1"
  behind="$2"
  dirty=false

  write_update_status "$status" "$update_applied" "$restart_triggered" "$message" "$local_commit" "$remote_commit" "$ahead" "$behind" "$dirty"
  log_info "Branch: $branch"
  log_info "Local commit: $local_commit"
  log_info "Remote commit: $remote_commit"
  log_info "Update applied: $update_applied"
  log_info "Restart triggered: $restart_triggered"
  log_ok "$message"
}

main "$@"
