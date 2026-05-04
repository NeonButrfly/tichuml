#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/linux/update-backend.sh [--help|-h]

Force-refreshes the Linux backend repo checkout from the live remote and
refreshes runtime artifacts. If the backend is already running, it will be
restarted after the update completes.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

main() {
  log_step "Checking Linux backend repository updates"
  load_repo_env
  ensure_runtime_dirs
  require_command git

  local branch before_local_commit before_remote_commit_live after_local_commit after_remote_commit_live remote_commit ahead behind dirty update_applied restart_triggered status message code_changed
  branch="$GIT_BRANCH"
  update_applied=false
  restart_triggered=false
  status="ok"
  message="Repository force-synced to origin/$branch."
  code_changed=false

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
  before_local_commit="$(git_local_commit)"
  if ! before_remote_commit_live="$(git_remote_commit)"; then
    message="Unable to contact live remote origin/$branch; update aborted."
    write_update_status "failed" false false "$message" "$before_local_commit" "unknown" 0 0 "$(repo_dirty && printf true || printf false)" "$before_local_commit" "unknown" "$before_local_commit" "unknown" false
    exit 1
  fi

  log_info "Before local commit: $before_local_commit"
  log_info "Before live remote commit: $before_remote_commit_live"

  if ! git_force_sync_repo "$BACKEND_REPO_ROOT" "$branch" "$REPO_URL"; then
    after_local_commit="$(git_local_commit 2>/dev/null || printf '%s\n' "$before_local_commit")"
    after_remote_commit_live="$(git_remote_commit 2>/dev/null || printf '%s\n' unknown)"
    message="Repository force-sync failed; local HEAD was not verified against live remote origin/$branch."
    write_update_status "failed" false false "$message" "$after_local_commit" "$after_remote_commit_live" 0 0 "$(repo_dirty && printf true || printf false)" "$before_local_commit" "$before_remote_commit_live" "$after_local_commit" "$after_remote_commit_live" false
    exit 1
  fi
  load_repo_env

  after_local_commit="$(git_local_commit)"
  after_remote_commit_live="$(git_remote_commit)"
  if [ "$before_local_commit" != "$after_local_commit" ]; then
    code_changed=true
  fi

  install_node_dependencies_if_needed
  install_ml_requirements_if_needed
  ensure_docker_running
  start_postgres
  wait_for_postgres

  build_runtime_artifacts
  verify_runtime_artifacts
  run_migrations
  update_applied=true
  remote_commit="$after_remote_commit_live"
  if [ "$code_changed" = true ]; then
    message="Force-synced latest code from origin/$branch; runtime stack refreshed."
  else
    message="Code already matched live origin/$branch; runtime stack refreshed."
  fi

  if [ "$backend_was_running" = true ]; then
    log_step "Restarting backend after update"
    stop_backend
    start_backend_background
    verify_backend_http_endpoints
    restart_triggered=true
    message="$message Backend restarted."
  fi

  after_local_commit="$(git_local_commit)"
  after_remote_commit_live="$(git_remote_commit)"
  remote_commit="$after_remote_commit_live"
  set -- $(git_ahead_behind)
  ahead="$1"
  behind="$2"
  dirty=false

  write_update_status "$status" "$update_applied" "$restart_triggered" "$message" "$after_local_commit" "$remote_commit" "$ahead" "$behind" "$dirty" "$before_local_commit" "$before_remote_commit_live" "$after_local_commit" "$after_remote_commit_live" "$code_changed"
  log_info "Branch: $branch"
  log_info "Before local commit: $before_local_commit"
  log_info "Before live remote commit: $before_remote_commit_live"
  log_info "After local commit: $after_local_commit"
  log_info "After live remote commit: $after_remote_commit_live"
  log_info "Code changed: $code_changed"
  log_info "Update applied: $update_applied"
  log_info "Restart triggered: $restart_triggered"
  log_ok "$message"
}

main "$@"
