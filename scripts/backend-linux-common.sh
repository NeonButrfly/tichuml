#!/usr/bin/env bash

backend_script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

backend_repo_root_default() {
  CDPATH= cd -- "$(backend_script_dir)/.." && pwd
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
BACKEND_LAST_EVAL_FILE="${BACKEND_LAST_EVAL_FILE:-$BACKEND_REPO_ROOT/eval/results/latest_summary.json}"

backend_now_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

backend_log() {
  printf '%s %s\n' "$1" "$2"
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

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_fail "Required command '$1' was not found in PATH."
    exit 1
  fi
}

ensure_runtime_dirs() {
  mkdir -p "$BACKEND_RUNTIME_DIR" "$BACKEND_REPO_ROOT/eval/results"
}

ensure_env_file() {
  if [ ! -f "$BACKEND_REPO_ROOT/.env" ]; then
    cp "$BACKEND_REPO_ROOT/.env.example" "$BACKEND_REPO_ROOT/.env"
  fi
}

load_repo_env() {
  ensure_env_file

  set -a
  # shellcheck disable=SC1091
  . "$BACKEND_REPO_ROOT/.env"
  set +a

  export REPO_URL="${REPO_URL:-https://github.com/NeonButrfly/tichuml.git}"
  export GIT_BRANCH="${GIT_BRANCH:-main}"
  export AUTO_UPDATE_ON_START="${AUTO_UPDATE_ON_START:-true}"
  export PORT="${PORT:-4310}"
  export HOST="${HOST:-0.0.0.0}"
  export BACKEND_HOST_IP="${BACKEND_HOST_IP:-192.168.50.36}"
  export BACKEND_PUBLIC_URL="${BACKEND_PUBLIC_URL:-http://$BACKEND_HOST_IP:$PORT}"
  export BACKEND_LOCAL_URL="${BACKEND_LOCAL_URL:-http://127.0.0.1:$PORT}"
  export POSTGRES_USER="${POSTGRES_USER:-tichu}"
  export POSTGRES_DB="${POSTGRES_DB:-tichu}"
  export POSTGRES_PORT="${POSTGRES_PORT:-54329}"
}

docker_compose() {
  docker compose --env-file "$BACKEND_REPO_ROOT/.env" "$@"
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

git_remote_commit() {
  git -C "$BACKEND_REPO_ROOT" rev-parse "origin/$GIT_BRANCH"
}

git_ahead_behind() {
  git -C "$BACKEND_REPO_ROOT" rev-list --left-right --count "HEAD...origin/$GIT_BRANCH"
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

  cat >"$BACKEND_UPDATE_STATUS_FILE" <<EOF
LAST_CHECK_AT=$(backend_now_iso)
STATUS=$status
UPDATE_APPLIED=$update_applied
RESTART_TRIGGERED=$restart_triggered
BRANCH=${GIT_BRANCH}
LOCAL_COMMIT=$local_commit
REMOTE_COMMIT=$remote_commit
AHEAD=$ahead
BEHIND=$behind
DIRTY=$dirty
MESSAGE=$message
EOF
}

ensure_docker_running() {
  require_command docker

  if docker info >/dev/null 2>&1; then
    return
  fi

  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    sudo service docker start >/dev/null 2>&1 || true
  fi

  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if docker info >/dev/null 2>&1; then
      return
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  log_fail "Docker did not become ready within the timeout window."
  exit 1
}

start_postgres() {
  docker_compose up -d postgres
}

wait_for_postgres() {
  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if docker_compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  log_fail "Postgres did not report ready within the timeout window."
  exit 1
}

run_migrations() {
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
    log_info "Installing workspace dependencies"
    (cd "$BACKEND_REPO_ROOT" && npm install)
    touch "$BACKEND_RUNTIME_DIR/npm-install.stamp"
  else
    log_info "Node dependencies already up to date"
  fi
}

ensure_python_venv() {
  if [ ! -d "$BACKEND_REPO_ROOT/.venv" ]; then
    python3 -m venv "$BACKEND_REPO_ROOT/.venv"
  fi
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
    log_info "Installing ML requirements"
    "$py" -m pip install --upgrade pip
    "$py" -m pip install -r "$BACKEND_REPO_ROOT/ml/requirements.txt"
    touch "$BACKEND_RUNTIME_DIR/ml-install.stamp"
  else
    log_info "ML requirements already up to date"
  fi
}

build_runtime_artifacts() {
  (cd "$BACKEND_REPO_ROOT" && npm run build:shared && npm run build:engine && npm run build:telemetry && npm run build:ai && npm run build:server && npm run build:sim-runner)
}

backend_pid() {
  if [ -f "$BACKEND_PID_FILE" ]; then
    cat "$BACKEND_PID_FILE"
  fi
}

backend_running() {
  local pid
  pid="$(backend_pid)"
  [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1
}

stop_backend() {
  if ! backend_running; then
    rm -f "$BACKEND_PID_FILE"
    return
  fi

  local pid
  pid="$(backend_pid)"
  kill "$pid" >/dev/null 2>&1 || true

  local attempt=0
  while [ "$attempt" -lt 30 ]; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      rm -f "$BACKEND_PID_FILE"
      return
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$BACKEND_PID_FILE"
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

start_backend_background() {
  ensure_runtime_dirs
  if backend_running; then
    log_warn "Backend is already running with pid $(backend_pid)"
    return
  fi

  : >"$BACKEND_LOG_FILE"
  (
    cd "$BACKEND_REPO_ROOT" &&
      nohup npm run start:server >>"$BACKEND_LOG_FILE" 2>&1 &
      printf '%s\n' "$!" >"$BACKEND_PID_FILE"
  )

  local attempt=0
  while [ "$attempt" -lt 60 ]; do
    if health_endpoint_ready; then
      return
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  log_fail "Backend failed to pass the /health check after startup."
  exit 1
}

prepare_runtime_stack() {
  require_command git
  require_command curl
  require_command node
  require_command npm
  require_command python3

  ensure_runtime_dirs
  load_repo_env
  ensure_docker_running
  install_node_dependencies_if_needed
  install_ml_requirements_if_needed
  start_postgres
  wait_for_postgres
  run_migrations
}
