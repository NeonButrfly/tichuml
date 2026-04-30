#!/usr/bin/env bash

backend_script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

backend_repo_root_default() {
  CDPATH= cd -- "$(backend_script_dir)/../.." && pwd
}

BACKEND_REPO_ROOT="${BACKEND_REPO_ROOT-}"
if [ -z "$BACKEND_REPO_ROOT" ]; then
  BACKEND_REPO_ROOT="$(backend_repo_root_default)"
fi

set -u

BACKEND_RUNTIME_DIR="${BACKEND_RUNTIME_DIR:-$BACKEND_REPO_ROOT/.runtime}"
BACKEND_PID_FILE="${BACKEND_PID_FILE:-$BACKEND_RUNTIME_DIR/backend.pid}"
BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-$BACKEND_RUNTIME_DIR/backend.log}"
BACKEND_UPDATE_STATUS_FILE="${BACKEND_UPDATE_STATUS_FILE:-$BACKEND_RUNTIME_DIR/backend-update-status.env}"
BACKEND_UPDATE_STATUS_JSON_FILE="${BACKEND_UPDATE_STATUS_JSON_FILE:-$BACKEND_RUNTIME_DIR/backend-update-status.json}"
BACKEND_ACTION_LOG_FILE="${BACKEND_ACTION_LOG_FILE:-$BACKEND_RUNTIME_DIR/actions.ndjson}"
BACKEND_LAST_EVAL_FILE="${BACKEND_LAST_EVAL_FILE:-$BACKEND_REPO_ROOT/eval/results/latest_summary.json}"

backend_now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

backend_log() {
  printf '%s %s\n' "$1" "$2"
}

log_step() {
  printf '\n==> %s\n' "$1"
}

log_info() {
  backend_log "[INFO]" "$1"
}

log_ok() {
  backend_log "[OK]" "$1"
}

log_warn() {
  backend_log "[WARN]" "$1"
}

log_fail() {
  backend_log "[FAIL]" "$1" >&2
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

require_command() {
  if ! has_command "$1"; then
    log_fail "Required command '$1' was not found in PATH."
    exit 1
  fi
}

ensure_runtime_dirs() {
  mkdir -p "$BACKEND_RUNTIME_DIR" "$BACKEND_REPO_ROOT/eval/results"
  touch "$BACKEND_ACTION_LOG_FILE"
}

ensure_env_file() {
  if [ ! -f "$BACKEND_REPO_ROOT/.env" ]; then
    cp "$BACKEND_REPO_ROOT/.env.example" "$BACKEND_REPO_ROOT/.env"
  fi
}

load_repo_env() {
  log_info "Loading backend environment from $BACKEND_REPO_ROOT/.env"
  ensure_env_file

  require_command node
  eval "$(node "$BACKEND_REPO_ROOT/scripts/runtime-config.mjs" export-shell "$BACKEND_REPO_ROOT/.env")"
}

docker_info_error() {
  docker info 2>&1 >/dev/null || true
}

docker_compose_command() {
  if docker compose version >/dev/null 2>&1; then
    printf '%s\n' "docker compose"
    return
  fi

  if has_command docker-compose && docker-compose version >/dev/null 2>&1; then
    printf '%s\n' "docker-compose"
    return
  fi

  return 1
}

docker_compose_available() {
  docker_compose_command >/dev/null 2>&1
}

docker_compose() {
  local compose_command
  if ! compose_command="$(docker_compose_command)"; then
    log_fail "Docker is installed but neither 'docker compose' nor 'docker-compose' is available. Rerun scripts/linux/install-backend.sh so it can install a distro package or manual Compose plugin."
    exit 1
  fi

  local -a compose_parts=()
  # shellcheck disable=SC2206
  compose_parts=($compose_command)
  (
    cd "$BACKEND_REPO_ROOT" &&
      "${compose_parts[@]}" -f "$BACKEND_REPO_ROOT/docker-compose.yml" "$@"
  )
}

repo_dirty() {
  [ -n "$(git -C "$BACKEND_REPO_ROOT" status --porcelain)" ]
}

git_current_branch() {
  git -C "$BACKEND_REPO_ROOT" branch --show-current
}

git_local_commit() {
  git -C "$BACKEND_REPO_ROOT" rev-parse HEAD
}

git_live_remote_commit() {
  local branch="${1:-$GIT_BRANCH}"
  local repo_url="${2:-$REPO_URL}"
  local repo_root="${3:-$BACKEND_REPO_ROOT}"
  local output sha

  git -C "$repo_root" remote get-url origin >/dev/null 2>&1 ||
    git -C "$repo_root" remote add origin "$repo_url"
  git -C "$repo_root" remote set-url origin "$repo_url"

  if ! output="$(git -C "$repo_root" ls-remote origin "refs/heads/$branch" 2>&1)"; then
    log_fail "Unable to contact live remote origin refs/heads/$branch: $output"
    return 1
  fi

  sha="$(printf '%s\n' "$output" | awk 'NF >= 2 {print $1; exit}')"
  if [ -z "$sha" ]; then
    log_fail "Live remote origin refs/heads/$branch did not return a commit SHA."
    return 1
  fi

  printf '%s\n' "$sha"
}

git_refresh_remote_branch() {
  local branch="${1:-$GIT_BRANCH}"
  local repo_root="${2:-$BACKEND_REPO_ROOT}"
  git -C "$repo_root" fetch --prune origin "+refs/heads/$branch:refs/remotes/origin/$branch"
}

git_remote_commit() {
  git_live_remote_commit "$GIT_BRANCH" "$REPO_URL" "$BACKEND_REPO_ROOT"
}

git_ahead_behind() {
  git_refresh_remote_branch "$GIT_BRANCH" "$BACKEND_REPO_ROOT"
  git -C "$BACKEND_REPO_ROOT" rev-list --left-right --count "HEAD...origin/$GIT_BRANCH"
}

git_force_sync_repo() {
  local repo_root="$1"
  local branch="$2"
  local repo_url="$3"
  local live_remote_commit live_remote_after local_after

  log_step "Force-syncing repository to origin/$branch"
  log_info "This intentionally overwrites local changes for the backend install/start workflow."

  git -C "$repo_root" remote get-url origin >/dev/null 2>&1 ||
    git -C "$repo_root" remote add origin "$repo_url"

  log_info "Running git remote set-url origin $repo_url"
  git -C "$repo_root" remote set-url origin "$repo_url"
  live_remote_commit="$(git_live_remote_commit "$branch" "$repo_url" "$repo_root")" || return 1
  log_info "Live remote commit for origin/$branch: $live_remote_commit"
  log_info "Running git fetch --prune origin +refs/heads/$branch:refs/remotes/origin/$branch"
  git_refresh_remote_branch "$branch" "$repo_root"
  log_info "Running git checkout $branch"
  git -C "$repo_root" checkout "$branch" 2>/dev/null ||
    git -C "$repo_root" checkout -B "$branch" "origin/$branch"
  log_info "Running git reset --hard origin/$branch"
  git -C "$repo_root" reset --hard "origin/$branch"
  log_info "Running git clean -fd"
  git -C "$repo_root" clean -fd

  local_after="$(git -C "$repo_root" rev-parse HEAD)"
  live_remote_after="$(git_live_remote_commit "$branch" "$repo_url" "$repo_root")" || return 1
  if [ "$local_after" != "$live_remote_after" ]; then
    log_fail "After force sync, local HEAD $local_after does not match live remote $live_remote_after"
    return 1
  fi
  log_ok "Local HEAD matches live remote $live_remote_after"
}

shell_quote() {
  printf '%q' "$1"
}

write_env_assignment() {
  local name="$1"
  local value="$2"
  printf '%s=' "$name"
  shell_quote "$value"
  printf '\n'
}

write_update_status() {
  ensure_runtime_dirs

  local status="$1"
  local update_applied="$2"
  local restart_triggered="$3"
  local message="${4:-}"
  local local_commit="${5:-unknown}"
  local remote_commit="${6:-unknown}"
  local ahead="${7:-0}"
  local behind="${8:-0}"
  local dirty="${9:-false}"
  local before_local_commit="${10:-unknown}"
  local before_remote_commit_live="${11:-unknown}"
  local after_local_commit="${12:-$local_commit}"
  local after_remote_commit_live="${13:-$remote_commit}"
  local code_changed="${14:-false}"

  {
    write_env_assignment LAST_CHECK_AT "$(backend_now_iso)"
    write_env_assignment STATUS "$status"
    write_env_assignment UPDATE_APPLIED "$update_applied"
    write_env_assignment RESTART_TRIGGERED "$restart_triggered"
    write_env_assignment BRANCH "$GIT_BRANCH"
    write_env_assignment LOCAL_COMMIT "$local_commit"
    write_env_assignment REMOTE_COMMIT "$remote_commit"
    write_env_assignment AHEAD "$ahead"
    write_env_assignment BEHIND "$behind"
    write_env_assignment DIRTY "$dirty"
    write_env_assignment BEFORE_LOCAL_COMMIT "$before_local_commit"
    write_env_assignment BEFORE_REMOTE_COMMIT_LIVE "$before_remote_commit_live"
    write_env_assignment AFTER_LOCAL_COMMIT "$after_local_commit"
    write_env_assignment AFTER_REMOTE_COMMIT_LIVE "$after_remote_commit_live"
    write_env_assignment CODE_CHANGED "$code_changed"
    write_env_assignment MESSAGE "$message"
  } >"$BACKEND_UPDATE_STATUS_FILE"

  cat >"$BACKEND_UPDATE_STATUS_JSON_FILE" <<EOF
{
  "last_check_at": "$(backend_now_iso)",
  "status": "$status",
  "update_applied": $update_applied,
  "restart_triggered": $restart_triggered,
  "branch": "$GIT_BRANCH",
  "local_commit": "$local_commit",
  "remote_commit": "$remote_commit",
  "ahead": "$ahead",
  "behind": "$behind",
  "dirty": $dirty,
  "before_local_commit": "$before_local_commit",
  "before_remote_commit_live": "$before_remote_commit_live",
  "after_local_commit": "$after_local_commit",
  "after_remote_commit_live": "$after_remote_commit_live",
  "code_changed": $code_changed,
  "message": $(node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""))' "$message" 2>/dev/null || printf '"%s"' "$message")
}
EOF
}

log_action_result() {
  ensure_runtime_dirs
  local action="$1"
  local status="$2"
  local message="${3:-}"
  local ts
  ts="$(backend_now_iso)"
  node -e 'const [ts, action, status, message] = process.argv.slice(1); console.log(JSON.stringify({ts, action, status, message}));' \
    "$ts" "$action" "$status" "$message" >>"$BACKEND_ACTION_LOG_FILE" 2>/dev/null ||
    printf '{"ts":"%s","action":"%s","status":"%s","message":"%s"}\n' "$ts" "$action" "$status" "$message" >>"$BACKEND_ACTION_LOG_FILE"
}

ensure_docker_running() {
  require_command docker

  if docker info >/dev/null 2>&1; then
    log_info "Docker daemon is already reachable"
    return
  fi

  local docker_error
  docker_error="$(docker_info_error)"
  if printf '%s' "$docker_error" | grep -qi 'permission denied'; then
    log_fail "Docker is installed but the current user cannot access the daemon. Add the user to the docker group (then sign in again) or use a user that already has Docker access."
    exit 1
  fi

  log_step "Starting Docker daemon"
  if has_command systemctl; then
    log_info "Running systemctl enable --now docker"
    sudo systemctl enable --now docker >/dev/null 2>&1 || true
  elif has_command service; then
    log_info "Running service docker start"
    sudo service docker start >/dev/null 2>&1 || true
  fi

  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if docker info >/dev/null 2>&1; then
      log_ok "Docker daemon is ready"
      return
    fi
    attempt=$((attempt + 1))
    if [ $((attempt % 5)) -eq 1 ]; then
      log_info "Waiting for Docker daemon readiness (${attempt}/60)"
    fi
    sleep 2
  done

  docker_error="$(docker_info_error)"
  if printf '%s' "$docker_error" | grep -qi 'permission denied'; then
    log_fail "Docker daemon is running, but this user still lacks permission to access it. Add the user to the docker group and sign in again before rerunning."
    exit 1
  fi

  log_fail "Docker did not become ready within the timeout window."
  exit 1
}

start_postgres() {
  log_step "Starting Postgres via docker compose"
  docker_compose up -d postgres
}

wait_for_postgres() {
  log_step "Waiting for Postgres readiness"
  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if docker_compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      log_ok "Postgres is accepting connections"
      return
    fi
    attempt=$((attempt + 1))
    if [ $((attempt % 5)) -eq 1 ]; then
      log_info "Postgres not ready yet (${attempt}/60)"
    fi
    sleep 2
  done

  log_fail "Postgres did not report ready within the timeout window."
  exit 1
}

run_migrations() {
  log_step "Running database migrations"
  (cd "$BACKEND_REPO_ROOT" && npm run db:migrate)
}

node_install_needed() {
  local stamp="$BACKEND_RUNTIME_DIR/npm-install.stamp"
  if [ ! -d "$BACKEND_REPO_ROOT/node_modules" ] || [ ! -f "$stamp" ]; then
    return 0
  fi

  if [ "$BACKEND_REPO_ROOT/package-lock.json" -nt "$stamp" ]; then
    return 0
  fi

  if find "$BACKEND_REPO_ROOT/apps" "$BACKEND_REPO_ROOT/packages" -name package.json -newer "$stamp" -print -quit | grep -q .; then
    return 0
  fi

  return 1
}

install_node_dependencies_if_needed() {
  ensure_runtime_dirs
  if node_install_needed; then
    log_step "Installing Node workspace dependencies"
    log_info "Running npm install in $BACKEND_REPO_ROOT"
    (cd "$BACKEND_REPO_ROOT" && npm install)
    touch "$BACKEND_RUNTIME_DIR/npm-install.stamp"
  else
    log_info "Node dependencies already up to date"
  fi
}

verify_node_workspace_dependencies() {
  log_step "Verifying Node workspace dependencies"
  require_command node
  require_command npm
  if [ ! -d "$BACKEND_REPO_ROOT/node_modules" ]; then
    log_fail "Node workspace dependencies are missing. Run npm install or rerun scripts/linux/install-backend.sh."
    exit 1
  fi
  log_ok "Node workspace dependencies are present"
}

ensure_python_venv() {
  if [ ! -d "$BACKEND_REPO_ROOT/.venv" ]; then
    log_step "Creating Python virtual environment"
    if python3 -m venv --help >/dev/null 2>&1; then
      python3 -m venv "$BACKEND_REPO_ROOT/.venv"
    elif has_command virtualenv; then
      virtualenv -p python3 "$BACKEND_REPO_ROOT/.venv"
    else
      log_fail "Python venv support is unavailable. Install python3-venv on Debian/Ubuntu or python3-virtualenv on Oracle/RHEL, then rerun."
      exit 1
    fi
  fi

  local py
  py="$(python_bin)"
  if "$py" -m pip --version >/dev/null 2>&1; then
    return
  fi

  log_warn "Python virtual environment exists but pip is missing; attempting to bootstrap pip."
  "$py" -m ensurepip --upgrade >/dev/null 2>&1 || true
  if "$py" -m pip --version >/dev/null 2>&1; then
    log_ok "Bootstrapped pip with ensurepip"
    return
  fi

  if has_command curl; then
    local get_pip
    get_pip="$(mktemp /tmp/tichuml-get-pip.XXXXXX.py)"
    if curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$get_pip" &&
      "$py" "$get_pip" >/dev/null 2>&1; then
      rm -f "$get_pip"
      if "$py" -m pip --version >/dev/null 2>&1; then
        log_ok "Bootstrapped pip with get-pip.py"
        return
      fi
    fi
    rm -f "$get_pip"
  fi

  log_fail "Unable to make pip available inside $BACKEND_REPO_ROOT/.venv. Install Python pip/venv support and rerun."
  exit 1
}

python_bin() {
  printf '%s\n' "$BACKEND_REPO_ROOT/.venv/bin/python"
}

ml_install_needed() {
  local stamp="$BACKEND_RUNTIME_DIR/ml-install.stamp"
  if [ ! -x "$(python_bin)" ] || [ ! -f "$stamp" ]; then
    return 0
  fi

  [ "$BACKEND_REPO_ROOT/ml/requirements.txt" -nt "$stamp" ]
}

install_ml_requirements_if_needed() {
  ensure_python_venv
  local py
  py="$(python_bin)"
  if ml_install_needed; then
    log_step "Installing ML Python requirements"
    "$py" -m pip install --upgrade pip
    "$py" -m pip install -r "$BACKEND_REPO_ROOT/ml/requirements.txt"
    touch "$BACKEND_RUNTIME_DIR/ml-install.stamp"
  else
    log_info "ML requirements already up to date"
  fi
}

build_runtime_artifacts() {
  log_step "Building workspace packages in dependency order"
  log_info "Building shared contracts"
  (cd "$BACKEND_REPO_ROOT" && npm run build:shared)
  log_info "Building engine"
  (cd "$BACKEND_REPO_ROOT" && npm run build:engine)
  log_info "Building telemetry"
  (cd "$BACKEND_REPO_ROOT" && npm run build:telemetry)
  log_info "Building AI heuristics"
  (cd "$BACKEND_REPO_ROOT" && npm run build:ai)
  log_info "Building UI kit"
  (cd "$BACKEND_REPO_ROOT" && npm run build:ui-kit)
  log_info "Building backend server"
  (cd "$BACKEND_REPO_ROOT" && npm run build:server)
  log_info "Building simulator runner"
  (cd "$BACKEND_REPO_ROOT" && npm run build:sim-runner)
  log_info "Building web/admin dashboards"
  (cd "$BACKEND_REPO_ROOT" && npm run build:web)
  log_ok "Workspace runtime artifacts built"
}

runtime_artifact_missing_paths() {
  local missing=()
  [ -f "$BACKEND_REPO_ROOT/packages/shared/dist/index.js" ] || missing+=("packages/shared/dist/index.js")
  [ -f "$BACKEND_REPO_ROOT/packages/engine/dist/index.js" ] || missing+=("packages/engine/dist/index.js")
  [ -f "$BACKEND_REPO_ROOT/packages/telemetry/dist/index.js" ] || missing+=("packages/telemetry/dist/index.js")
  [ -f "$BACKEND_REPO_ROOT/packages/ui-kit/dist/index.js" ] || missing+=("packages/ui-kit/dist/index.js")
  [ -f "$BACKEND_REPO_ROOT/apps/server/dist/index.js" ] || missing+=("apps/server/dist/index.js")
  [ -f "$BACKEND_REPO_ROOT/apps/sim-runner/dist/index.js" ] || missing+=("apps/sim-runner/dist/index.js")
  [ -f "$BACKEND_REPO_ROOT/apps/web/dist/index.html" ] || missing+=("apps/web/dist/index.html")

  if [ "${#missing[@]}" -gt 0 ]; then
    printf '%s\n' "${missing[@]}"
  fi
}

runtime_artifacts_ready() {
  [ -z "$(runtime_artifact_missing_paths)" ]
}

verify_runtime_artifacts() {
  log_step "Verifying runtime build artifacts"
  local missing
  missing="$(runtime_artifact_missing_paths)"

  if [ -n "$missing" ]; then
    log_fail "Missing runtime artifacts: $(printf '%s' "$missing" | tr '\n' ' ')"
    log_fail "Recovery: run npm run build or scripts/linux/update-backend.sh before migrations/startup."
    exit 1
  fi

  log_ok "Required runtime build artifacts exist"
}

backend_pid() {
  if [ -f "$BACKEND_PID_FILE" ]; then
    cat "$BACKEND_PID_FILE"
  fi
}

backend_listener_pids() {
  {
    if has_command lsof; then
      lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
    fi

    if has_command fuser; then
      fuser -n tcp "$PORT" 2>/dev/null | tr ' ' '\n' || true
    fi

    if has_command ss; then
      ss -ltnp "sport = :$PORT" 2>/dev/null |
        sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' || true
    fi
  } | grep -E '^[0-9]+$' | sort -u || true
}

backend_port_listening() {
  [ -n "$(backend_listener_pids)" ]
}

backend_running() {
  local pid
  pid="$(backend_pid)"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

stop_backend() {
  local pid listener_pids pids
  pid="$(backend_pid)"
  listener_pids="$(backend_listener_pids)"
  pids="$(
    {
      printf '%s\n' "$pid"
      printf '%s\n' "$listener_pids"
    } | grep -E '^[0-9]+$' | sort -u || true
  )"

  if [ -z "$pids" ]; then
    rm -f "$BACKEND_PID_FILE"
    return
  fi

  if ! backend_running && [ -n "$listener_pids" ]; then
    log_warn "Found backend listener(s) on port $PORT without a tracked pid file: $(printf '%s' "$listener_pids" | tr '\n' ' ')"
  fi

  local process_pid
  for process_pid in $pids; do
    kill "$process_pid" >/dev/null 2>&1 || true
  done

  local attempt=0
  while [ "$attempt" -lt 30 ]; do
    local any_running=false
    for process_pid in $pids; do
      if kill -0 "$process_pid" >/dev/null 2>&1; then
        any_running=true
      fi
    done

    if [ "$any_running" = false ] && ! backend_port_listening; then
      rm -f "$BACKEND_PID_FILE"
      return
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  for process_pid in $pids; do
    kill -9 "$process_pid" >/dev/null 2>&1 || true
  done
  rm -f "$BACKEND_PID_FILE"
}

sim_controller_runtime_dir() {
  printf '%s\n' "${SIM_CONTROLLER_RUNTIME_DIR:-$BACKEND_REPO_ROOT/.runtime/sim-controller}"
}

sim_controller_pids() {
  local runtime_dir state_file
  runtime_dir="$(sim_controller_runtime_dir)"
  state_file="$runtime_dir/state.json"
  if [ ! -f "$state_file" ]; then
    return
  fi

  node -e '
    const fs = require("fs");
    const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const pids = new Set();
    if (Number.isInteger(state.pid)) pids.add(state.pid);
    for (const worker of Array.isArray(state.workers) ? state.workers : []) {
      if (Number.isInteger(worker.pid)) pids.add(worker.pid);
    }
    for (const pid of pids) console.log(pid);
  ' "$state_file" 2>/dev/null || true
}

stop_sim_controller_runtime() {
  local runtime_dir pids pid
  runtime_dir="$(sim_controller_runtime_dir)"
  pids="$(sim_controller_pids)"

  if [ -z "$pids" ]; then
    log_info "Simulator controller has no tracked running processes"
    return
  fi

  log_step "Stopping simulator controller runtime"
  mkdir -p "$runtime_dir"
  printf '%s\n' "$(backend_now_iso)" >"$runtime_dir/stop"

  for pid in $pids; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      log_info "Sending TERM to simulator controller process $pid"
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done

  local attempt=0
  while [ "$attempt" -lt 20 ]; do
    local any_running=false
    for pid in $pids; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        any_running=true
      fi
    done
    if [ "$any_running" = false ]; then
      log_ok "Simulator controller processes stopped"
      return
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  for pid in $pids; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      log_warn "Escalating simulator controller process $pid with KILL"
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done
}

stop_postgres() {
  log_step "Stopping Postgres container"
  if ! has_command docker; then
    log_warn "Docker is not installed; Postgres container is already unavailable"
    return
  fi
  if ! docker_compose_available; then
    log_warn "Docker Compose is unavailable; skipping Postgres stop"
    return
  fi

  docker_compose stop postgres
  log_ok "Postgres stop requested"
}

curl_json_status() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -o /dev/null -w '%{http_code}' -X "$method" "$url" -H 'content-type: application/json' --data "$body"
  else
    curl -sS -o /dev/null -w '%{http_code}' -X "$method" "$url"
  fi
}

health_endpoint_ready() {
  local status
  status="$(curl_json_status GET "$BACKEND_LOCAL_URL/health" 2>/dev/null || true)"
  [ "$status" = "200" ]
}

sim_dashboard_routes_ready() {
  local route status
  for route in /admin/sim /sim/control; do
    status="$(curl_json_status GET "$BACKEND_LOCAL_URL$route" 2>/dev/null || true)"
    if [ "$status" != "200" ]; then
      log_warn "Simulator dashboard route $BACKEND_LOCAL_URL$route returned HTTP ${status:-unknown}"
      return 1
    fi
  done
}

api_endpoint_reachable() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local status
  status="$(curl_json_status "$method" "$url" "$body" 2>/dev/null || true)"
  case "$status" in
    200|201|202|400|409|422) return 0 ;;
    *) return 1 ;;
  esac
}

verify_backend_http_endpoints() {
  log_step "Verifying backend HTTP endpoints"
  if health_endpoint_ready; then
    log_ok "/health reachable at $BACKEND_LOCAL_URL/health"
  else
    log_fail "/health is not reachable at $BACKEND_LOCAL_URL/health"
    exit 1
  fi

  if api_endpoint_reachable POST "$BACKEND_LOCAL_URL/api/decision/request" '{}'; then
    log_ok "/api/decision/request endpoint is reachable"
  else
    log_fail "/api/decision/request endpoint is not reachable"
    exit 1
  fi

  if api_endpoint_reachable POST "$BACKEND_LOCAL_URL/api/telemetry/event" '{}'; then
    log_ok "/api/telemetry/event endpoint is reachable"
  else
    log_fail "/api/telemetry/event endpoint is not reachable"
    exit 1
  fi

  if sim_dashboard_routes_ready; then
    log_ok "Simulator dashboard routes are reachable"
  else
    log_fail "Simulator dashboard routes are not reachable"
    exit 1
  fi

  if api_endpoint_reachable GET "$BACKEND_LOCAL_URL/admin/control"; then
    log_ok "Runtime control panel is reachable"
  else
    log_warn "Runtime control panel is not reachable yet"
  fi
}

start_backend_background() {
  ensure_runtime_dirs
  if backend_running; then
    log_warn "Backend is already running with pid $(backend_pid)"
    return
  fi

  if backend_port_listening; then
    log_warn "Port $PORT is already serving a backend without the tracked pid file; replacing that listener before start."
    stop_backend
  fi

  log_step "Starting backend server"
  log_info "Streaming backend logs to $BACKEND_LOG_FILE"
  : >"$BACKEND_LOG_FILE"
  (
    cd "$BACKEND_REPO_ROOT" &&
      nohup npm run start:server >>"$BACKEND_LOG_FILE" 2>&1 &
      printf '%s\n' "$!" >"$BACKEND_PID_FILE"
  )

  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if health_endpoint_ready; then
      log_ok "Backend passed the /health check"
      if sim_dashboard_routes_ready; then
        log_ok "Simulator dashboard routes are reachable"
      else
        log_fail "Backend started, but simulator dashboard routes are not reachable. Run npm run build:web and restart the backend, or inspect $BACKEND_LOG_FILE."
        exit 1
      fi
      return
    fi
    attempt=$((attempt + 1))
    if [ $((attempt % 5)) -eq 1 ]; then
      log_info "Waiting for backend /health readiness (${attempt}/60)"
    fi
    sleep 2
  done

  log_fail "Backend failed to pass the /health check after startup."
  exit 1
}

prepare_runtime_stack() {
  log_step "Preparing Linux backend runtime stack"
  require_command git
  require_command curl
  require_command node
  require_command npm
  require_command python3

  ensure_runtime_dirs
  load_repo_env
  ensure_docker_running
  if docker_compose_available; then
    log_ok "Docker Compose is available via $(docker_compose_command)"
  else
    log_fail "Docker Compose is unavailable. Rerun scripts/linux/install-backend.sh."
    exit 1
  fi
  install_node_dependencies_if_needed
  verify_node_workspace_dependencies
  install_ml_requirements_if_needed
  start_postgres
  wait_for_postgres
}
