#!/usr/bin/env bash
set -Eeuo pipefail

# reset_tichuml_state.sh
# Purpose:
#   Start Postgres/backend if needed, clear the Tichu database through the backend admin endpoint,
#   stop the backend, then clear runtime/log/diagnostic artifacts.
#
# Safety:
#   - Does NOT delete node_modules.
#   - Does NOT delete docker volumes/Postgres data.
#   - Does NOT run git clean.
#   - Does NOT touch source files.
#
# Usage:
#   cd /opt/tichuml
#   ./scripts/linux/reset_tichuml_state.sh
#
# Optional:
#   ./scripts/linux/reset_tichuml_state.sh --repo-root /opt/tichuml --backend-url http://127.0.0.1:4310

REPO_ROOT=""
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:4310}"
ADMIN_CONFIRM="${ADMIN_CONFIRM:-CLEAR_TICHU_DB}"
SKIP_BACKEND_STOP="false"

log() { printf '%s [INFO] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
ok() { printf '%s [OK] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { printf '%s [WARN] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
fail() { printf '%s [FAIL] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  reset_tichuml_state.sh [options]

Options:
  --repo-root PATH       Repository root. Defaults to script-relative detection.
  --backend-url URL      Backend URL. Defaults to http://127.0.0.1:4310.
  --skip-backend-stop    Leave backend running after reset/cleanup.
  -h, --help             Show help.

What this does:
  1. Starts Postgres with npm run db:up.
  2. Starts backend if /health is not reachable.
  3. Clears DB through /api/admin/database/reset.
  4. Stops backend unless --skip-backend-stop is set.
  5. Removes .runtime, logs, and diagnostic archives from safe repo-local locations.

What this does NOT do:
  - It does not delete node_modules.
  - It does not delete Docker volumes.
  - It does not run git clean.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      REPO_ROOT="${2:-}"
      shift 2
      ;;
    --backend-url)
      BACKEND_URL="${2:-}"
      shift 2
      ;;
    --skip-backend-stop)
      SKIP_BACKEND_STOP="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$REPO_ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
    REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
  elif [[ -f "$SCRIPT_DIR/../package.json" ]]; then
    REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
  elif [[ -f "./package.json" ]]; then
    REPO_ROOT="$(pwd)"
  else
    fail "Could not detect repo root. Pass --repo-root /opt/tichuml"
  fi
fi

[[ -f "$REPO_ROOT/package.json" ]] || fail "Repo root does not contain package.json: $REPO_ROOT"
cd "$REPO_ROOT"

log "Repo root: $REPO_ROOT"
log "Backend URL: $BACKEND_URL"

health_ok() {
  curl -fsS "$BACKEND_URL/health" >/dev/null 2>&1
}

log "Starting Postgres if required"
if npm run db:up >/tmp/tichuml-reset-db-up.log 2>&1; then
  ok "Postgres startup command completed"
else
  cat /tmp/tichuml-reset-db-up.log >&2 || true
  fail "npm run db:up failed"
fi

BACKEND_WAS_RUNNING="false"
if health_ok; then
  BACKEND_WAS_RUNNING="true"
  ok "Backend already healthy"
else
  log "Backend not healthy; starting backend"
  if [[ -x "$REPO_ROOT/scripts/linux/start_backend_linux.sh" ]]; then
    "$REPO_ROOT/scripts/linux/start_backend_linux.sh"
  elif [[ -x "$REPO_ROOT/scripts/start_backend_linux.sh" ]]; then
    "$REPO_ROOT/scripts/start_backend_linux.sh"
  elif [[ -f "$REPO_ROOT/scripts/linux/start_backend_linux.sh" ]]; then
    bash "$REPO_ROOT/scripts/linux/start_backend_linux.sh"
  elif [[ -f "$REPO_ROOT/scripts/start_backend_linux.sh" ]]; then
    bash "$REPO_ROOT/scripts/start_backend_linux.sh"
  else
    fail "No Linux backend start script found"
  fi

  for i in $(seq 1 60); do
    if health_ok; then
      ok "Backend became healthy"
      break
    fi
    sleep 1
  done

  health_ok || fail "Backend did not become healthy"
fi

log "Clearing database through backend admin endpoint"
RESET_RESPONSE="$(curl -fsS -X POST "$BACKEND_URL/api/admin/database/reset" -H 'content-type: application/json' -H "x-admin-confirm: $ADMIN_CONFIRM" --data "{\"confirm\":\"$ADMIN_CONFIRM\"}")" || fail "Database reset endpoint failed"
printf '%s\n' "$RESET_RESPONSE"
ok "Database reset accepted"

if [[ "$SKIP_BACKEND_STOP" == "true" ]]; then
  warn "Skipping backend stop because --skip-backend-stop was passed"
else
  log "Stopping backend"
  if [[ -x "$REPO_ROOT/scripts/linux/stop_backend_linux.sh" ]]; then
    "$REPO_ROOT/scripts/linux/stop_backend_linux.sh" || true
  elif [[ -x "$REPO_ROOT/scripts/stop_backend_linux.sh" ]]; then
    "$REPO_ROOT/scripts/stop_backend_linux.sh" || true
  elif [[ -f "$REPO_ROOT/scripts/linux/stop_backend_linux.sh" ]]; then
    bash "$REPO_ROOT/scripts/linux/stop_backend_linux.sh" || true
  elif [[ -f "$REPO_ROOT/scripts/stop_backend_linux.sh" ]]; then
    bash "$REPO_ROOT/scripts/stop_backend_linux.sh" || true
  else
    warn "No Linux backend stop script found; attempting process cleanup by port is intentionally skipped"
  fi
  ok "Backend stop attempted"
fi

safe_remove_path() {
  local target="$1"
  [[ -e "$target" ]] || return 0

  local resolved_parent
  resolved_parent="$(CDPATH= cd -- "$(dirname -- "$target")" && pwd)"
  case "$resolved_parent" in
    "$REPO_ROOT"|"$REPO_ROOT"/*)
      rm -rf -- "$target"
      ok "Removed $target"
      ;;
    *)
      fail "Refusing to remove path outside repo: $target"
      ;;
  esac
}

log "Clearing runtime/log/diagnostic artifacts"

safe_remove_path "$REPO_ROOT/.runtime"
safe_remove_path "$REPO_ROOT/logs"

find "$REPO_ROOT" -maxdepth 4 -type f \( \
  -name '*diagnostic*.zip' -o \
  -name '*diagnostics*.zip' -o \
  -name 'verify-*.zip' -o \
  -name 'verify-*.tar.gz' -o \
  -name '*full-sim-verify*.zip' -o \
  -name '*full-sim-verify*.tar.gz' -o \
  -name '*.diag.zip' \
\) -print -delete | sed 's/^/[deleted] /' || true

find "$REPO_ROOT" -maxdepth 4 -type f \( \
  -path "$REPO_ROOT/.runtime/*" -o \
  -path "$REPO_ROOT/logs/*" \
\) -print -delete 2>/dev/null | sed 's/^/[deleted] /' || true

mkdir -p "$REPO_ROOT/.runtime/logs"
ok "Recreated $REPO_ROOT/.runtime/logs"

log "Final database counts"
if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="${POSTGRES_PASSWORD:-tichu_dev_password}" psql -h 127.0.0.1 -p "${POSTGRES_PORT:-54329}" -U "${POSTGRES_USER:-tichu}" -d "${POSTGRES_DB:-tichu}" -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" || warn "Could not query DB counts"
else
  warn "psql not found; skipping DB count verification"
fi

ok "Reset state complete"
