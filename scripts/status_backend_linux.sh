#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-linux-common.sh"

status_line() {
  printf '%-6s %s\n' "$1" "$2"
}

http_status_reachable() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local status
  status="$(curl_json_status "$method" "$url" "$body" 2>/dev/null || true)"
  case "$status" in
    200|202|400|422) return 0 ;;
    *) return 1 ;;
  esac
}

print_update_status() {
  if [ ! -f "$BACKEND_UPDATE_STATUS_FILE" ]; then
    status_line "[WARN]" "No update status has been recorded yet."
    return
  fi

  # shellcheck disable=SC1090
  . "$BACKEND_UPDATE_STATUS_FILE"
  status_line "[OK]" "Last update check: ${LAST_CHECK_AT:-unknown}"
  status_line "[OK]" "Last update status: ${STATUS:-unknown} (applied=${UPDATE_APPLIED:-false}, restart=${RESTART_TRIGGERED:-false})"
  status_line "[OK]" "Last update message: ${MESSAGE:-n/a}"
}

main() {
  log_step "Inspecting Linux backend host status"
  load_repo_env
  ensure_runtime_dirs

  local prerequisites_missing=false

  if has_command git; then
    status_line "[OK]" "git is installed"
  else
    status_line "[FAIL]" "git is missing"
    prerequisites_missing=true
  fi

  if has_command curl; then
    status_line "[OK]" "curl is installed"
  else
    status_line "[FAIL]" "curl is missing"
    prerequisites_missing=true
  fi

  if has_command python3; then
    status_line "[OK]" "python3 is installed"
  else
    status_line "[FAIL]" "python3 is missing"
    prerequisites_missing=true
  fi

  if has_command node; then
    status_line "[OK]" "node is installed"
  else
    status_line "[FAIL]" "node is missing"
    prerequisites_missing=true
  fi

  if has_command npm; then
    status_line "[OK]" "npm is installed"
  else
    if has_command node; then
      status_line "[FAIL]" "node is installed but npm is missing; install npm from the same Node distribution before starting the backend"
    else
      status_line "[FAIL]" "npm is missing"
    fi
    prerequisites_missing=true
  fi

  if has_command docker; then
    status_line "[OK]" "docker is installed"
  else
    status_line "[FAIL]" "docker is missing"
    prerequisites_missing=true
  fi

  if has_command docker; then
    if docker_compose_available; then
      status_line "[OK]" "Docker Compose is available via $(docker_compose_command)"
    else
      status_line "[FAIL]" "Docker Compose is unavailable; rerun install_backend_linux.sh to install a distro package or manual CLI plugin"
      prerequisites_missing=true
    fi
  else
    status_line "[WARN]" "Skipping Compose check because docker is missing"
  fi

  if [ "$prerequisites_missing" = true ]; then
    status_line "[WARN]" "Install prerequisites are incomplete. Recovery: rerun bash scripts/install_backend_linux.sh after fixing the missing packages."
  else
    status_line "[OK]" "System install prerequisites are present"
  fi

  if has_command docker; then
    local docker_error
    docker_error="$(docker_info_error)"
    if docker info >/dev/null 2>&1; then
      status_line "[OK]" "Docker daemon is running"
    else
      if printf '%s' "$docker_error" | grep -qi 'permission denied'; then
        status_line "[FAIL]" "Docker daemon is installed but this user lacks daemon access; add the user to the docker group and sign in again"
      else
        status_line "[FAIL]" "Docker daemon is not running; recovery: sudo systemctl enable --now docker"
      fi
    fi

    if docker_compose_available; then
      if docker_compose ps --status running postgres | grep -q postgres; then
        status_line "[OK]" "Postgres container is running"
      else
        status_line "[FAIL]" "Postgres container is not running"
      fi

      if docker_compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        status_line "[OK]" "Postgres is accepting connections"
      else
        status_line "[FAIL]" "Postgres connectivity check failed"
      fi
    else
      status_line "[WARN]" "Skipping Postgres container checks because Docker Compose is unavailable"
    fi
  else
    status_line "[WARN]" "Skipping Docker/Postgres runtime checks because docker is missing"
  fi

  if backend_running; then
    status_line "[OK]" "Backend process is running with pid $(backend_pid)"
  else
    status_line "[WARN]" "Backend process is not currently running"
  fi

  if has_command curl; then
    if http_status_reachable GET "$BACKEND_LOCAL_URL/health"; then
      status_line "[OK]" "/health reachable at $BACKEND_LOCAL_URL/health"
    else
      status_line "[FAIL]" "/health is not reachable at $BACKEND_LOCAL_URL/health"
    fi

    if http_status_reachable POST "$BACKEND_LOCAL_URL/api/decision/request" '{}'; then
      status_line "[OK]" "/api/decision/request endpoint is reachable"
    else
      status_line "[FAIL]" "/api/decision/request endpoint is not reachable"
    fi

    if http_status_reachable POST "$BACKEND_LOCAL_URL/api/telemetry/event" '{}'; then
      status_line "[OK]" "/api/telemetry/event endpoint is reachable"
    else
      status_line "[FAIL]" "/api/telemetry/event endpoint is not reachable"
    fi
  else
    status_line "[WARN]" "Skipping HTTP endpoint checks because curl is missing"
  fi

  if [ -x "$BACKEND_REPO_ROOT/.venv/bin/python" ]; then
    status_line "[OK]" "Python virtual environment exists"
  else
    status_line "[FAIL]" "Python virtual environment is missing"
  fi

  if [ -d "$BACKEND_REPO_ROOT/node_modules" ]; then
    status_line "[OK]" "Node workspace dependencies exist"
  else
    status_line "[FAIL]" "Node workspace dependencies are missing"
  fi

  if [ -f "$BACKEND_REPO_ROOT/ml/model_registry/lightgbm_action_model.txt" ]; then
    status_line "[OK]" "LightGBM model file exists"
  else
    status_line "[WARN]" "LightGBM model file is missing"
  fi

  if has_command git; then
    local branch local_commit remote_commit ahead behind
    branch="$(git_current_branch)"
    local_commit="$(git_local_commit)"
    git -C "$BACKEND_REPO_ROOT" fetch origin "$GIT_BRANCH" >/dev/null 2>&1 || true
    remote_commit="$(git_remote_commit 2>/dev/null || printf '%s\n' 'unknown')"
    set -- $(git_ahead_behind 2>/dev/null || printf '0 0')
    ahead="$1"
    behind="$2"

    status_line "[OK]" "Git branch: $branch"
    status_line "[OK]" "Local commit: $local_commit"
    status_line "[OK]" "Remote commit: $remote_commit"
    status_line "[OK]" "Ahead/behind: $ahead/$behind"

    if repo_dirty; then
      status_line "[WARN]" "Repository has uncommitted changes; install/update/start workflows will force remote state over them"
    else
      status_line "[OK]" "Repository worktree is clean"
    fi
  else
    status_line "[WARN]" "Skipping Git state checks because git is missing"
  fi

  print_update_status
}

main "$@"
