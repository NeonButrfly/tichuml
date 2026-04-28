#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

CLEAR_DATABASE=false
TIMEOUT_SECONDS=90
BACKEND_URL="$BACKEND_BASE_URL"

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
      BACKEND_URL="${2:?missing backend url}"
      shift
      ;;
    --help|-h)
      echo "Usage: scripts/linux/verify-sim-one-game-fixed.sh [--clear-database] [--timeout-seconds 90] [--backend-url http://127.0.0.1:4310]"
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
assert_postgres_identity
wait_for_postgres

timestamp="$(date -u +%Y%m%d-%H%M%S)"
output_dir="$BACKEND_REPO_ROOT/diagnostics/verify-one-game-linux-$timestamp"
archive="$BACKEND_REPO_ROOT/verify-one-game-linux-$timestamp.tar.gz"
mkdir -p "$output_dir"
log_file="$output_dir/verify.log"
exec > >(tee -a "$log_file") 2>&1

log_step "Linux one-game simulator verification"
print_identity
log_info "Backend URL override: $BACKEND_URL"

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
  docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE;" >"$output_dir/db-clear.txt" 2>&1
fi

docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" >"$output_dir/db-counts-before.txt" 2>&1

stdout="$output_dir/sim-stdout.log"
stderr="$output_dir/sim-stderr.log"
log_step "Running exactly one simulator game"
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
docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" >"$output_dir/db-counts-after.txt" 2>&1
docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, match_id, game_id, hand_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 20;" >"$output_dir/latest-decisions.txt" 2>&1
docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, match_id, game_id, hand_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 20;" >"$output_dir/latest-events.txt" 2>&1
docker exec "$POSTGRES_CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id AS match_id, game_id, last_hand_id, provider, telemetry_mode, strict_telemetry, sim_version, engine_version, status, started_at, completed_at, created_at, updated_at FROM matches ORDER BY created_at DESC LIMIT 20;" >"$output_dir/latest-matches.txt" 2>&1

(cd "$BACKEND_REPO_ROOT" && npm run telemetry:truth -- --backend-url "$BACKEND_URL" --require-rows) >"$output_dir/telemetry-truth.json" 2>&1 || true
ps -eo pid,ppid,comm,args >"$output_dir/processes-after.txt" 2>&1 || true
remaining="$(pgrep -f 'sim-runner|npm run sim|sim-controller' || true)"
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
