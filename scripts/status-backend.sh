#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/status-backend.sh [--help|-h]

Prints runtime, dependency, Git, and HTTP health status for the canonical Linux
backend host flow.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

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

http_status_ok() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local status
  status="$(curl_json_status "$method" "$url" "$body" 2>/dev/null || true)"
  [ "$status" = "200" ]
}

model_sha256() {
  local file_path="$1"
  if has_command sha256sum; then
    sha256sum "$file_path" | awk '{print $1}'
    return 0
  fi

  if has_command shasum; then
    shasum -a 256 "$file_path" | awk '{print $1}'
    return 0
  fi

  return 1
}

print_model_status() {
  local model_file="$BACKEND_REPO_ROOT/ml/model_registry/lightgbm_action_model.txt"
  local meta_file="$BACKEND_REPO_ROOT/ml/model_registry/lightgbm_action_model.meta.json"
  local manifest_file="$BACKEND_REPO_ROOT/ml/model_registry/promoted-model.json"

  if [ -f "$model_file" ]; then
    status_line "[OK]" "LightGBM model file exists"
  else
    status_line "[WARN]" "LightGBM model file is missing"
    return
  fi

  if [ -f "$meta_file" ]; then
    status_line "[OK]" "LightGBM model metadata exists"
  else
    status_line "[WARN]" "LightGBM model metadata is missing"
  fi

  if model_hash="$(model_sha256 "$model_file" 2>/dev/null)"; then
    status_line "[OK]" "LightGBM model sha256: $model_hash"
  else
    status_line "[WARN]" "LightGBM model sha256 unavailable because no sha256 helper is installed"
  fi

  if [ -f "$meta_file" ] && meta_hash="$(model_sha256 "$meta_file" 2>/dev/null)"; then
    status_line "[OK]" "LightGBM meta sha256: $meta_hash"
  fi

  if [ -f "$meta_file" ] && has_command node; then
    local meta_summary
    meta_summary="$(node -e 'const fs=require("node:fs"); const meta=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const summary={version: meta.model_version ?? "unknown", created_at: meta.created_at ?? "unknown", objective: meta.objective ?? "unknown", label_mode: meta.label_mode ?? "unknown", feature_profile: meta.feature_profile ?? "unknown"}; process.stdout.write(JSON.stringify(summary));' "$meta_file" 2>/dev/null || true)"
    if [ -n "$meta_summary" ]; then
      status_line "[OK]" "LightGBM meta summary: $meta_summary"
    fi
  fi

  if [ -f "$manifest_file" ] && [ -f "$meta_file" ] && has_command node; then
    local manifest_status
    manifest_status="$(node -e 'const fs=require("node:fs"); const crypto=require("node:crypto"); const [manifestPath, modelPath, metaPath] = process.argv.slice(1); const hash = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); const actualModel = hash(modelPath); const actualMeta = hash(metaPath); const expectedModel = String(manifest?.model?.model_sha256 ?? ""); const expectedMeta = String(manifest?.model?.meta_sha256 ?? ""); const payload = { match: actualModel === expectedModel && actualMeta === expectedMeta, expected_model: expectedModel, expected_meta: expectedMeta, actual_model: actualModel, actual_meta: actualMeta, model_version: String(manifest?.model?.model_version ?? "") }; process.stdout.write(JSON.stringify(payload));' "$manifest_file" "$model_file" "$meta_file" 2>/dev/null || true)"
    if [ -n "$manifest_status" ]; then
      if printf '%s' "$manifest_status" | grep -q '"match":true'; then
        status_line "[OK]" "Promoted model manifest matches the active LightGBM artifact: $manifest_status"
      else
        status_line "[FAIL]" "Promoted model manifest does not match the active LightGBM artifact: $manifest_status"
      fi
    fi
  fi
}

print_update_status() {
  if [ ! -f "$BACKEND_UPDATE_STATUS_FILE" ]; then
    status_line "[WARN]" "No update status has been recorded yet."
    return
  fi

  read_status_field() {
    local key="$1"
    local raw
    raw="$(grep -E "^${key}=" "$BACKEND_UPDATE_STATUS_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
    raw="${raw%\"}"
    raw="${raw#\"}"
    printf '%s' "${raw:-}"
  }

  local last_check status update_applied restart_triggered message legacy_status
  last_check="$(read_status_field LAST_CHECK_AT)"
  status="$(read_status_field STATUS)"
  update_applied="$(read_status_field UPDATE_APPLIED)"
  restart_triggered="$(read_status_field RESTART_TRIGGERED)"
  message="$(read_status_field MESSAGE)"
  legacy_status="$(read_status_field LAST_UPDATE_STATUS)"

  status_line "[OK]" "Last update check: ${last_check:-unknown}"
  status_line "[OK]" "Last update status: ${status:-${legacy_status:-unknown}} (applied=${update_applied:-false}, restart=${restart_triggered:-false})"
  status_line "[OK]" "Last update message: ${message:-n/a}"
}

print_runtime_layout() {
  status_line "[OK]" "Runtime dir: $BACKEND_RUNTIME_DIR"
  status_line "[OK]" "Backend pid file: $BACKEND_PID_FILE"
  status_line "[OK]" "Backend log file: $BACKEND_LOG_FILE"
  status_line "[OK]" "Action log file: $BACKEND_ACTION_LOG_FILE"
  status_line "[OK]" "Update status file: $BACKEND_UPDATE_STATUS_JSON_FILE"
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
      status_line "[FAIL]" "Docker Compose is unavailable; rerun scripts/install-backend.sh to install a distro package or manual CLI plugin"
      prerequisites_missing=true
    fi
  else
    status_line "[WARN]" "Skipping Compose check because docker is missing"
  fi

  if [ "$prerequisites_missing" = true ]; then
    status_line "[WARN]" "Install prerequisites are incomplete. Recovery: rerun bash scripts/install-backend.sh after fixing the missing packages."
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
      if docker_compose ps --status running postgres 2>/dev/null | grep -q postgres; then
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
  elif backend_port_listening; then
    status_line "[WARN]" "Backend port $PORT is listening without a tracked pid file; recovery: run scripts/update-backend.sh to replace the unmanaged listener"
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

    if http_status_ok GET "$BACKEND_LOCAL_URL/admin/sim"; then
      status_line "[OK]" "/admin/sim dashboard route is reachable"
    else
      status_line "[FAIL]" "/admin/sim dashboard route is not reachable"
    fi

    if http_status_ok GET "$BACKEND_LOCAL_URL/sim/control"; then
      status_line "[OK]" "/sim/control dashboard route is reachable"
    else
      status_line "[FAIL]" "/sim/control dashboard route is not reachable"
    fi

    if http_status_ok GET "$BACKEND_LOCAL_URL/admin/control"; then
      status_line "[OK]" "Control panel reachable at $BACKEND_PUBLIC_URL/admin/control"
    else
      status_line "[FAIL]" "Control panel is not reachable at $BACKEND_LOCAL_URL/admin/control"
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

  if [ -f "$BACKEND_REPO_ROOT/apps/web/dist/index.html" ]; then
    status_line "[OK]" "Web dashboard bundle exists"
  else
    status_line "[FAIL]" "Web dashboard bundle is missing; recovery: run scripts/update-backend.sh or npm run build:web"
  fi

  if runtime_artifacts_ready; then
    status_line "[OK]" "Runtime build artifacts are ready for migrations/startup"
  else
    status_line "[FAIL]" "Runtime build artifacts are incomplete"
  fi

  print_model_status

  if has_command git; then
    local branch local_commit remote_commit ahead behind
    branch="$(git_current_branch)"
    local_commit="$(git_local_commit)"

    status_line "[OK]" "Git branch: $branch"
    status_line "[OK]" "Local commit: $local_commit"
    if remote_commit="$(git_remote_commit 2>/dev/null)"; then
      set -- $(git_ahead_behind 2>/dev/null || printf '0 0')
      ahead="$1"
      behind="$2"
      status_line "[OK]" "Remote commit live: $remote_commit"
      status_line "[OK]" "Ahead/behind: $ahead/$behind"
    else
      status_line "[FAIL]" "Remote commit live: unknown; unable to contact origin refs/heads/$GIT_BRANCH"
      status_line "[WARN]" "Ahead/behind: unknown because live remote refresh failed"
    fi

    if repo_dirty; then
      status_line "[WARN]" "Repository has uncommitted changes; install/update/start workflows will force remote state over them"
    else
      status_line "[OK]" "Repository worktree is clean"
    fi
  else
    status_line "[WARN]" "Skipping Git state checks because git is missing"
  fi

  print_update_status
  print_runtime_layout
}

main "$@"
