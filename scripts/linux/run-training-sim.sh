#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

PROVIDER="local"
TELEMETRY="true"
STRICT_TELEMETRY="false"
BACKEND_URL="$BACKEND_BASE_URL"
GAMES_PER_LOOP=100
LOG_DIR="$SIM_LOG_DIR"
TRUTH_EVERY_LOOPS=5

while [ "$#" -gt 0 ]; do
  case "$1" in
    --provider) PROVIDER="${2:?missing provider}"; shift ;;
    --telemetry) TELEMETRY="${2:?missing telemetry value}"; shift ;;
    --strict-telemetry) STRICT_TELEMETRY="${2:?missing strict telemetry value}"; shift ;;
    --backend-url) BACKEND_URL="${2:?missing backend url}"; shift ;;
    --games-per-loop|--batch-size) GAMES_PER_LOOP="${2:?missing games per loop}"; shift ;;
    --log-dir) LOG_DIR="${2:?missing log dir}"; shift ;;
    --truth-every-loops) TRUTH_EVERY_LOOPS="${2:?missing truth interval}"; shift ;;
    --help|-h)
      echo "Usage: scripts/linux/run-training-sim.sh --provider local --telemetry true --strict-telemetry false --backend-url http://127.0.0.1:4310 --games-per-loop 100 --log-dir /opt/tichuml/logs/sim-training"
      exit 0
      ;;
    *) log_fail "Unknown training option: $1"; exit 2 ;;
  esac
  shift
done

ensure_repo_root
ensure_runtime_dirs
mkdir -p "$LOG_DIR"
assert_postgres_identity
wait_for_postgres

stop_requested=false
child_pid=""
on_stop() {
  stop_requested=true
  if [ -n "$child_pid" ] && kill -0 "$child_pid" >/dev/null 2>&1; then
    log_warn "Stopping simulator child $child_pid"
    kill "$child_pid" >/dev/null 2>&1 || true
    wait "$child_pid" >/dev/null 2>&1 || true
  fi
}
trap on_stop INT TERM

loop=0
total_games=0
log_step "Starting continuous simulator training"
print_identity
log_info "Provider=$PROVIDER telemetry=$TELEMETRY strict=$STRICT_TELEMETRY games_per_loop=$GAMES_PER_LOOP log_dir=$LOG_DIR"

while [ "$stop_requested" = false ]; do
  loop=$((loop + 1))
  total_games=$((total_games + GAMES_PER_LOOP))
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  log_file="$LOG_DIR/training-loop-$(printf '%06d' "$loop")-$stamp.log"
  log_step "Training loop $loop starting"
  (
    cd "$BACKEND_REPO_ROOT"
    npm run sim -- --games "$GAMES_PER_LOOP" --provider "$PROVIDER" --telemetry "$TELEMETRY" --strict-telemetry "$STRICT_TELEMETRY" --backend-url "$BACKEND_URL"
  ) >>"$log_file" 2>&1 &
  child_pid="$!"
  set +e
  wait "$child_pid"
  exit_code=$?
  set -e
  child_pid=""
  log_info "Training loop $loop exit code: $exit_code"
  log_info "Log: $log_file"
  if [ "$exit_code" -ne 0 ] && [ "$stop_requested" = false ]; then
    log_fail "Simulator loop failed with exit code $exit_code. Inspect $log_file."
    exit "$exit_code"
  fi
  if [ "$TRUTH_EVERY_LOOPS" -gt 0 ] && [ $((loop % TRUTH_EVERY_LOOPS)) -eq 0 ]; then
    log_step "DB truth after $total_games requested games"
    (cd "$BACKEND_REPO_ROOT" && npm run telemetry:truth -- --backend-url "$BACKEND_URL" || true)
  else
    log_info "DB counts: decisions=$(db_count decisions) events=$(db_count events) matches=$(db_count matches)"
  fi
done

kill_sim_processes
log_ok "Training simulator stopped cleanly"
