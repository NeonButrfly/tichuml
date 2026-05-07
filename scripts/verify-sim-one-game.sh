#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

CLEAR_DATABASE=false
TIMEOUT_SECONDS=90
START_BACKEND_IF_DOWN=true
BACKEND_URL_OVERRIDE=""

backend_url_targets_local_machine() {
  case "$1" in
    http://127.0.0.1|http://127.0.0.1:*|https://127.0.0.1|https://127.0.0.1:*|\
    http://localhost|http://localhost:*|https://localhost|https://localhost:*|\
    http://[::1]|http://[::1]:*|https://[::1]|https://[::1]:*)
      return 0
      ;;
  esac

  return 1
}

backend_health_ready_for_url() {
  local url="$1"
  local status
  status="$(curl_json_status GET "$url/health" 2>/dev/null || true)"
  [ "$status" = "200" ]
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --clear-database)
      CLEAR_DATABASE=true
      ;;
    --timeout-seconds)
      TIMEOUT_SECONDS="${2:?missing timeout seconds}"
      shift
      ;;
    --backend-url)
      BACKEND_URL_OVERRIDE="${2:?missing backend url}"
      shift
      ;;
    --no-start-backend)
      START_BACKEND_IF_DOWN=false
      ;;
    --help|-h)
      cat <<'EOF'
Usage:
  scripts/verify-sim-one-game.sh [options]

Purpose:
  Runs exactly one Linux simulator game, verifies telemetry persistence, and
  captures backend/runtime diagnostics.

Options:
  --clear-database                Destructive: truncate telemetry tables before running.
  --timeout-seconds <seconds>     Simulator timeout. Default: 90
  --backend-url <url>             Backend base URL. Must still target the local machine.
  --no-start-backend              Require the backend to already be healthy instead of starting it when down.
  --help, -h                      Show this help text.

Examples:
  scripts/verify-sim-one-game.sh --timeout-seconds 90
  scripts/verify-sim-one-game.sh --clear-database --backend-url http://127.0.0.1:4310

Environment:
  Auto-detects the repo root from the script location and loads backend .env before execution.

Safety:
  --clear-database is destructive and must be explicitly provided.
EOF
      exit 0
      ;;
    *)
      log_fail "Unknown verify option: $1"
      exit 2
      ;;
  esac
  shift
done

ensure_repo_root
ensure_runtime_dirs
load_repo_env
assert_postgres_identity

BACKEND_LOCAL_DEFAULT="${BACKEND_LOCAL_URL:-${BACKEND_BASE_URL:-http://127.0.0.1:${PORT:-4310}}}"
if [ -n "$BACKEND_URL_OVERRIDE" ]; then
  BACKEND_URL="$BACKEND_URL_OVERRIDE"
  BACKEND_URL_SOURCE="argument"
else
  BACKEND_URL="$BACKEND_LOCAL_DEFAULT"
  if [ -n "${BACKEND_LOCAL_URL:-}" ]; then
    BACKEND_URL_SOURCE=".env BACKEND_LOCAL_URL"
  elif [ -n "${BACKEND_BASE_URL:-}" ]; then
    BACKEND_URL_SOURCE=".env BACKEND_BASE_URL"
  else
    BACKEND_URL_SOURCE="default http://127.0.0.1:${PORT:-4310}"
  fi
fi

if ! backend_url_targets_local_machine "$BACKEND_URL"; then
  die "verify-sim-one-game.sh only supports local backend URLs because it validates against the local Postgres truth set. Received: $BACKEND_URL"
fi

prepare_runtime_stack

if backend_health_ready_for_url "$BACKEND_URL"; then
  log_ok "Backend already healthy at $BACKEND_URL"
else
  if [ "$START_BACKEND_IF_DOWN" != true ]; then
    die "Backend is not healthy at $BACKEND_URL and --no-start-backend was provided."
  fi

  log_warn "Backend is not healthy at $BACKEND_URL; starting the local backend stack."
  build_runtime_artifacts
  verify_runtime_artifacts
  run_migrations
  start_backend_background
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
output_dir="$BACKEND_REPO_ROOT/diagnostics/verify-one-game-linux-$timestamp"
archive="$BACKEND_REPO_ROOT/verify-one-game-linux-$timestamp.tar.gz"
mkdir -p "$output_dir"
log_file="$output_dir/verify.log"
exec > >(tee -a "$log_file") 2>&1

log_step "Linux one-game simulator verification"
print_identity
log_info "Backend URL: $BACKEND_URL (source: $BACKEND_URL_SOURCE)"

kill_sim_processes
rm -rf "$BACKEND_REPO_ROOT/.runtime/sim-controller"
mkdir -p "$BACKEND_REPO_ROOT/.runtime/sim-controller"

git -C "$BACKEND_REPO_ROOT" rev-parse HEAD >"$output_dir/git-head.txt" 2>&1 || true
git -C "$BACKEND_REPO_ROOT" status --short >"$output_dir/git-status.txt" 2>&1 || true
ps -eo pid,ppid,comm,args >"$output_dir/processes-before.txt" 2>&1 || true
curl -fsS "$BACKEND_URL/health" >"$output_dir/backend-health-before.json" 2>&1 || true
curl -fsS "$BACKEND_URL/api/telemetry/health" >"$output_dir/telemetry-before.json" 2>&1 || true

if [ "$CLEAR_DATABASE" = true ]; then
  log_step "Clearing telemetry database tables"
  db_exec "TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE;" >"$output_dir/db-clear.txt" 2>&1
fi

db_exec "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" >"$output_dir/db-counts-before.txt" 2>&1

stdout="$output_dir/sim-stdout.log"
stderr="$output_dir/sim-stderr.log"
log_step "Running exactly one simulator game"
require_command timeout
set +e
(
  cd "$BACKEND_REPO_ROOT"
  timeout --kill-after=5s "${TIMEOUT_SECONDS}s" npm run sim -- --games 1 --provider local --telemetry true --strict-telemetry true --trace-backend true --backend-url "$BACKEND_URL" >"$stdout" 2>"$stderr"
)
sim_exit=$?
set -e
log_info "Simulator exit code: $sim_exit"

curl -fsS "$BACKEND_URL/health" >"$output_dir/backend-health-after.json" 2>&1 || true
curl -fsS "$BACKEND_URL/api/telemetry/health" >"$output_dir/telemetry-after.json" 2>&1 || true
db_exec "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" >"$output_dir/db-counts-after.txt" 2>&1
db_exec "SELECT id, match_id, game_id, hand_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 20;" >"$output_dir/latest-decisions.txt" 2>&1
db_exec "SELECT id, match_id, game_id, hand_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 20;" >"$output_dir/latest-events.txt" 2>&1
db_exec "SELECT id AS match_id, game_id, last_hand_id, provider, requested_provider, telemetry_mode, strict_telemetry, sim_version, engine_version, status, started_at, completed_at, created_at, updated_at FROM matches ORDER BY created_at DESC LIMIT 20;" >"$output_dir/latest-matches.txt" 2>&1

(cd "$BACKEND_REPO_ROOT" && ./node_modules/.bin/tsx scripts/telemetry-truth.ts --backend-url "$BACKEND_URL" --require-rows) >"$output_dir/telemetry-truth.json" 2>&1 || true
ps -eo pid,ppid,comm,args >"$output_dir/processes-after.txt" 2>&1 || true
remaining=""
if has_command pgrep; then
  remaining="$(pgrep -f 'sim-runner|npm run sim|sim-controller' || true)"
fi
if [ -n "$remaining" ]; then
  printf '%s\n' "$remaining" >"$output_dir/orphan-sim-pids.txt"
  kill_sim_processes
fi

decisions="$(db_count decisions)"
events="$(db_count events)"
matches="$(db_count matches)"
queue_pending="$(node -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(p.queue_pending ?? "unknown"); } catch { console.log("unknown"); }' "$output_dir/telemetry-after.json")"
persistence_failures="$(node -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(p.persistence_failures ?? "unknown"); } catch { console.log("unknown"); }' "$output_dir/telemetry-after.json")"
truth_ok="$(node -e 'const fs=require("fs"); try { const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(p.ok === true ? "true" : "false"); } catch { console.log("false"); }' "$output_dir/telemetry-truth.json")"

failures=()
[ "$sim_exit" -eq 0 ] || failures+=("sim_exit_$sim_exit")
[ "$decisions" -gt 0 ] || failures+=("decisions_zero")
[ "$events" -gt 0 ] || failures+=("events_zero")
[ "$matches" -gt 0 ] || failures+=("matches_zero")
[ "$queue_pending" = "0" ] || failures+=("queue_pending_$queue_pending")
[ "$persistence_failures" = "0" ] || failures+=("persistence_failures_$persistence_failures")
[ "$truth_ok" = "true" ] || failures+=("join_validation_failed")
[ -z "$remaining" ] || failures+=("orphan_sim_process")

node -e 'const fs=require("fs"); const [out, ok, failures, decisions, events, matches, queuePending, persistenceFailures, archive]=process.argv.slice(1); fs.writeFileSync(out, JSON.stringify({ok: ok==="true", failures: failures ? failures.split(",") : [], decisions: Number(decisions), events: Number(events), matches: Number(matches), queue_pending: queuePending, persistence_failures: persistenceFailures, archive}, null, 2));' \
  "$output_dir/summary.json" "$([ "${#failures[@]}" -eq 0 ] && echo true || echo false)" "$(IFS=,; echo "${failures[*]}")" "$decisions" "$events" "$matches" "$queue_pending" "$persistence_failures" "$archive"

tar -czf "$archive" -C "$output_dir" .

if [ "${#failures[@]}" -eq 0 ]; then
  log_ok "PASS"
  log_ok "$archive"
  exit 0
fi

log_fail "FAIL: ${failures[*]}"
log_fail "$archive"
exit 1
