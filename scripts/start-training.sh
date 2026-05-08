#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

# Starts an isolated training-data self-play session with detached background
# runner semantics shared with the Windows launcher.
# Default mode clears events/decisions/matches in the training database,
# runs repeated full-telemetry self-play batches, verifies scoped Postgres
# growth, validates ml:export compatibility without running a full export,
# and packages current-run-only CSV/log artifacts into /tmp on finalize.

print_help() {
  cat <<'EOF'
Usage:
  scripts/start-training.sh [options]

Starts an isolated training-data self-play session with detached background
runner semantics shared with the Windows launcher.

Modes:
  Default: CLEAR DATABASE MODE
  -noclear, --no-clear: NO-CLEAR APPEND MODE

Help:
  --help, -h, -help
      Show this help text and exit.

Session control:
  --session <name>
      Use an explicit session name instead of the auto-generated
      tichuml-training-<run_id> value.
  --run-name <name>
      Alias for --session.
  --replace-session
      Stop and replace an existing session with the same name.
  --attach
      Tail the run log after launch.
  --detach-only
      Start the background runner without attaching. This is the default.

Simulation:
  --games <count>
      Games per batch. Default: 1000
  --batch-size <count>
      Alias for --games when using training terminology.
  --seed <value>
      Optional manual run seed. Defaults to the authoritative tichuml seed provider.
  --provider <local|server_heuristic|lightgbm_model>
      Decision provider. Default: server_heuristic
  --backend-url <url>
      Backend base URL. Default: http://127.0.0.1:4310
  --strict-telemetry <true|false>
      Whether telemetry failures should be strict. Default: false
  --decision-timeout-ms <milliseconds>
      Diagnostic escape hatch for backend decision timeouts. Default: 2000
  --interval-seconds <seconds>
      Seconds between scoped verification snapshots. Default: 15
  --exploration-profile <off|conservative|training_diversity>
      Exploration profile for explicit diversity runs. Default: off
  --exploration-rate <number>
      Optional near-policy exploration rate. Ignored when profile is off.
  --exploration-top-n <count>
      Optional bounded top-N pool for exploration. Ignored when profile is off.
  --exploration-max-score-gap <number>
      Optional score-gap cap for exploration. Ignored when profile is off.

Database:
  --pg-host <host>
      Postgres host. Default: 127.0.0.1
  --pg-port <port>
      Postgres port. Default: 54329
  --pg-user <user>
      Postgres user. Default: tichu
  --pg-db <database>
      Postgres database name. Default: tichu
  --pg-password <password>
      Postgres password used for this run only. Default: tichu_dev_password
  --allow-clear-db-name <name>
      Allow destructive clear only when current_database() matches this name.
      Default expected name is tichu.
  --allow-unhealthy-backend
      Continue even if the backend health check fails.
  --allow-conflicting-writers
      Permit startup even when another live training writer is already targeting
      the same backend/database.
  -noclear, --no-clear
      Preserve existing rows and append new scoped training data.

Validation and export:
  --dry-run
      Print the resolved run/session/export plan without launching the runner.
  --validate-only
      Alias for --dry-run; validates parsing and prerequisites without launching the runner.
  --output-dir <path>
      Training run artifact root. Default: training-runs under the repo root.
  --startup-timeout-seconds <seconds>
      Maximum time to wait for verified scoped row production before reporting
      startup success. Default: 120
  --startup-poll-milliseconds <ms>
      Poll interval for startup verification. Default: 1000
  --skip-ml-export-check
      Skip the validation-only ml:export compatibility check.
  --ml-export-command <command>
      Command label recorded in metadata and logs. Default: npm run ml:export

Artifacts created per run:
  training-runs/<run_id>/metadata.json
  training-runs/<run_id>/run.log
  training-runs/<run_id>/verification.log
  training-runs/<run_id>/commands.txt
  training-runs/<run_id>/last_10_games.txt
  training-runs/<run_id>/database_counts.txt
  training-runs/<run_id>/ml_export_check.log
  training-runs/<run_id>/ml_export_check_summary.json
  /tmp/tichuml-training-export-<run_id>/
  /tmp/tichuml-training-export-<run_id>.tar.gz
EOF
}

script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

repo_root_default() {
  CDPATH= cd -- "$(script_dir)/.." && pwd
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_workspace_builds() {
  local missing="false"
  local required_file
  for required_file in \
    "$REPO_ROOT/packages/shared/dist/index.js" \
    "$REPO_ROOT/packages/engine/dist/index.js" \
    "$REPO_ROOT/packages/telemetry/dist/index.js" \
    "$REPO_ROOT/packages/ai-heuristics/dist/index.js" \
    "$REPO_ROOT/apps/sim-runner/dist/cli.js"; do
    if [[ ! -f "$required_file" ]]; then
      missing="true"
      break
    fi
  done

  if [[ "$missing" != "true" ]]; then
    return 0
  fi

  echo "Workspace package builds are missing; building required packages before training launch."
  echo "Underlying build command: npm run build:shared && npm run build:engine && npm run build:telemetry && npm run build:ai && npm run build:sim-runner"
  npm run build:shared
  npm run build:engine
  npm run build:telemetry
  npm run build:ai
  npm run build:sim-runner
}

json_field() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const key=process.argv[2]; const value=data[key]; if (value===undefined||value===null) process.exit(1); process.stdout.write(String(value));" "$1" "$2"
}

write_commands_file() {
  local file="$1"
  local session_name="$2"
  local run_id="$3"
  local game_id_prefix="$4"
  local run_dir="$5"
  local archive_path="$6"
  cat >"$file" <<EOF
Stop:
scripts/stop-training.sh --session $session_name

Watch runner:
tail -f "$run_dir/run.log"

Watch verifier:
tail -f "$run_dir/verification.log"

Watch ML export compatibility check:
tail -f "$run_dir/ml_export_check.log"

Suggested manual ml:export command:
npm run ml:export -- --run-id $run_id --game-id-prefix $game_id_prefix --output-dir "$run_dir/ml"

Expected export:
ls -lh $archive_path
EOF
}

REPO_ROOT="${BACKEND_REPO_ROOT:-$(repo_root_default)}"
common_require_repo_root "$REPO_ROOT"
TRAINING_DATA_SCRIPT="$(common_require_repo_file "$REPO_ROOT" "scripts/training-data.ts" "Training data entrypoint")"
TRAINING_CLEAR_SQL="TRUNCATE TABLE events, decisions, matches RESTART IDENTITY CASCADE;"
GAMES=1000
PROVIDER="server_heuristic"
BACKEND_URL="http://127.0.0.1:4310"
STRICT_TELEMETRY="false"
DECISION_TIMEOUT_MS="2000"
EXPLORATION_PROFILE="off"
EXPLORATION_RATE="0"
EXPLORATION_TOP_N="0"
EXPLORATION_MAX_SCORE_GAP="0"
PG_HOST="127.0.0.1"
PG_PORT="54329"
PG_USER="tichu"
PG_DB="tichu"
PG_PASSWORD="${PGPASSWORD:-tichu_dev_password}"
INTERVAL_SECONDS=15
DETACH_ONLY="true"
ATTACH_AFTER="false"
DRY_RUN="false"
REPLACE_SESSION="false"
ALLOW_UNHEALTHY_BACKEND="false"
ALLOW_CLEAR_DB_NAME=""
CLEAR_DATABASE="true"
ML_EXPORT_CHECK_ENABLED="true"
ALLOW_CONFLICTING_WRITERS="false"
ML_EXPORT_COMMAND="npm run ml:export"
SESSION_NAME=""
OUTPUT_DIR=""
SEED_OVERRIDE=""
STARTUP_TIMEOUT_SECONDS=120
STARTUP_POLL_MILLISECONDS=1000

while (($#)); do
  case "$1" in
    --help|-h|-help|help)
      print_help
      exit 0
      ;;
    --session)
      SESSION_NAME="${2:?missing value for --session}"
      shift 2
      ;;
    --run-name)
      SESSION_NAME="${2:?missing value for --run-name}"
      shift 2
      ;;
    --games)
      GAMES="${2:?missing value for --games}"
      shift 2
      ;;
    --batch-size)
      GAMES="${2:?missing value for --batch-size}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:?missing value for --output-dir}"
      shift 2
      ;;
    --startup-timeout-seconds)
      STARTUP_TIMEOUT_SECONDS="${2:?missing value for --startup-timeout-seconds}"
      shift 2
      ;;
    --startup-poll-milliseconds)
      STARTUP_POLL_MILLISECONDS="${2:?missing value for --startup-poll-milliseconds}"
      shift 2
      ;;
    --validate-only)
      DRY_RUN="true"
      shift
      ;;
    --seed)
      SEED_OVERRIDE="${2:?missing value for --seed}"
      shift 2
      ;;
    --provider)
      PROVIDER="${2:?missing value for --provider}"
      shift 2
      ;;
    --backend-url)
      BACKEND_URL="${2:?missing value for --backend-url}"
      shift 2
      ;;
    --strict-telemetry)
      STRICT_TELEMETRY="${2:?missing value for --strict-telemetry}"
      shift 2
      ;;
    --decision-timeout-ms)
      DECISION_TIMEOUT_MS="${2:?missing value for --decision-timeout-ms}"
      shift 2
      ;;
    --exploration-profile)
      EXPLORATION_PROFILE="${2:?missing value for --exploration-profile}"
      shift 2
      ;;
    --exploration-rate)
      EXPLORATION_RATE="${2:?missing value for --exploration-rate}"
      shift 2
      ;;
    --exploration-top-n)
      EXPLORATION_TOP_N="${2:?missing value for --exploration-top-n}"
      shift 2
      ;;
    --exploration-max-score-gap)
      EXPLORATION_MAX_SCORE_GAP="${2:?missing value for --exploration-max-score-gap}"
      shift 2
      ;;
    --pg-host)
      PG_HOST="${2:?missing value for --pg-host}"
      shift 2
      ;;
    --pg-port)
      PG_PORT="${2:?missing value for --pg-port}"
      shift 2
      ;;
    --pg-user)
      PG_USER="${2:?missing value for --pg-user}"
      shift 2
      ;;
    --pg-db)
      PG_DB="${2:?missing value for --pg-db}"
      shift 2
      ;;
    --pg-password)
      PG_PASSWORD="${2:?missing value for --pg-password}"
      shift 2
      ;;
    --interval-seconds)
      INTERVAL_SECONDS="${2:?missing value for --interval-seconds}"
      shift 2
      ;;
    --detach-only)
      DETACH_ONLY="true"
      ATTACH_AFTER="false"
      shift
      ;;
    --attach)
      ATTACH_AFTER="true"
      DETACH_ONLY="false"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --replace-session)
      REPLACE_SESSION="true"
      shift
      ;;
    --allow-unhealthy-backend)
      ALLOW_UNHEALTHY_BACKEND="true"
      shift
      ;;
    --allow-conflicting-writers)
      ALLOW_CONFLICTING_WRITERS="true"
      shift
      ;;
    --allow-clear-db-name)
      ALLOW_CLEAR_DB_NAME="${2:?missing value for --allow-clear-db-name}"
      shift 2
      ;;
    -noclear|--no-clear)
      CLEAR_DATABASE="false"
      shift
      ;;
    --skip-ml-export-check)
      ML_EXPORT_CHECK_ENABLED="false"
      shift
      ;;
    --ml-export-command)
      ML_EXPORT_COMMAND="${2:?missing value for --ml-export-command}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

require_command bash
require_command npm
require_command node
require_command psql
require_command curl
require_command tar
require_command git
require_command npx

cd "$REPO_ROOT"
ensure_workspace_builds

tmp_metadata="$(mktemp)"
cleanup() {
  rm -f "$tmp_metadata"
}
trap cleanup EXIT

prepare_args=(
  tsx "$TRAINING_DATA_SCRIPT" prepare-run
  --repo-root "$REPO_ROOT"
  --training-runs-root "${OUTPUT_DIR:-$REPO_ROOT/training-runs}"
  --export-root "/tmp"
  --archive-root "/tmp"
  --provider "$PROVIDER"
  --games-per-batch "$GAMES"
  --backend-url "$BACKEND_URL"
  --strict-telemetry "$STRICT_TELEMETRY"
  --telemetry-mode "full"
  --decision-timeout-ms "$DECISION_TIMEOUT_MS"
  --exploration-profile "$EXPLORATION_PROFILE"
  --exploration-rate "$EXPLORATION_RATE"
  --exploration-top-n "$EXPLORATION_TOP_N"
  --exploration-max-score-gap "$EXPLORATION_MAX_SCORE_GAP"
  --pg-host "$PG_HOST"
  --pg-port "$PG_PORT"
  --pg-user "$PG_USER"
  --pg-db "$PG_DB"
  --clear-database "$CLEAR_DATABASE"
  --ml-export-check-enabled "$ML_EXPORT_CHECK_ENABLED"
  --ml-export-command "$ML_EXPORT_COMMAND"
)
if [[ -n "$SESSION_NAME" ]]; then
  prepare_args+=(--session-name "$SESSION_NAME")
fi
if [[ -n "$SEED_OVERRIDE" ]]; then
  prepare_args+=(--seed "$SEED_OVERRIDE")
fi
(
  cd "$REPO_ROOT"
  npx "${prepare_args[@]}" >"$tmp_metadata"
)

RUN_ID="$(json_field "$tmp_metadata" "run_id")"
SESSION_NAME_RESOLVED="$(json_field "$tmp_metadata" "session_name")"
GAME_ID_PREFIX="$(json_field "$tmp_metadata" "game_id_prefix")"
RUN_DIR="$(json_field "$tmp_metadata" "run_directory")"
ARCHIVE_PATH="$(json_field "$tmp_metadata" "archive_path")"
METADATA_FILE="$(json_field "$tmp_metadata" "metadata_file")"
COMMANDS_FILE="$(json_field "$tmp_metadata" "commands_file")"
STOP_FILE="$(json_field "$tmp_metadata" "stop_file")"
PID_FILE="$(json_field "$tmp_metadata" "pid_file")"

MODE_LABEL="CLEAR DATABASE MODE"
if [[ "$CLEAR_DATABASE" != "true" ]]; then
  MODE_LABEL="NO-CLEAR APPEND MODE"
fi

existing_metadata_file="$(
  (
    cd "$REPO_ROOT" &&
      npx tsx "$TRAINING_DATA_SCRIPT" locate-run --repo-root "$REPO_ROOT" --session-name "$SESSION_NAME_RESOLVED"
  ) 2>/dev/null || true
)"
if [[ -n "$existing_metadata_file" ]]; then
  if [[ "$REPLACE_SESSION" == "true" ]]; then
    "$SCRIPT_DIR/stop-training.sh" --session "$SESSION_NAME_RESOLVED" --force >/dev/null 2>&1 || true
  else
    echo "Session already exists: $SESSION_NAME_RESOLVED" >&2
    echo "Stop: scripts/stop-training.sh --session $SESSION_NAME_RESOLVED" >&2
    exit 1
  fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "$MODE_LABEL"
  echo "Resolved repo root: $REPO_ROOT"
  echo "Session name: $SESSION_NAME_RESOLVED"
  echo "Run ID: $RUN_ID"
  echo "Game ID prefix: $GAME_ID_PREFIX"
  echo "Run directory: $RUN_DIR"
  echo "Archive path: $ARCHIVE_PATH"
  echo "Decision timeout ms: $DECISION_TIMEOUT_MS"
  echo "Exploration profile: $EXPLORATION_PROFILE"
  echo "Exploration rate: $EXPLORATION_RATE"
  echo "Exploration top-N: $EXPLORATION_TOP_N"
  echo "Exploration max score gap: $EXPLORATION_MAX_SCORE_GAP"
  echo "Decision request mode: fast_path_default"
  echo "Clear SQL: $TRAINING_CLEAR_SQL"
  echo "Scoped export filter: game_id LIKE '${GAME_ID_PREFIX}%'"
  echo "ML export validation command: npm run ml:export -- --validate-only --run-id $RUN_ID --game-id-prefix $GAME_ID_PREFIX --output-dir \"$RUN_DIR/ml\""
  echo "Suggested manual ml:export command: npm run ml:export -- --run-id $RUN_ID --game-id-prefix $GAME_ID_PREFIX --output-dir \"$RUN_DIR/ml\""
  echo "Expected LightGBM files: train.parquet|train.csv.gz, dataset_metadata.json, feature_schema.json, feature_columns.json, label_columns.json"
  echo "Watch runner: tail -f \"$RUN_DIR/run.log\""
  echo "Stop command: scripts/stop-training.sh --session $SESSION_NAME_RESOLVED"
  (
    cd "$REPO_ROOT" &&
      prepare_db_args=(
        tsx "$TRAINING_DATA_SCRIPT" prepare-database
        --metadata-file "$tmp_metadata"
        --pg-password "$PG_PASSWORD"
        --dry-run
        --allow-unhealthy-backend "$ALLOW_UNHEALTHY_BACKEND"
        --allow-conflicting-writers "$ALLOW_CONFLICTING_WRITERS"
      )
      if [[ -n "$ALLOW_CLEAR_DB_NAME" ]]; then
        prepare_db_args+=(--allow-clear-db-name "$ALLOW_CLEAR_DB_NAME")
      fi
      npx "${prepare_db_args[@]}"
  )
  exit 0
fi

mkdir -p "$RUN_DIR" "$(dirname "$STOP_FILE")"
printf '%s\n' "$PG_PASSWORD" >"$(dirname "$STOP_FILE")/pg-password.txt"
chmod 600 "$(dirname "$STOP_FILE")/pg-password.txt"
cp "$tmp_metadata" "$METADATA_FILE"
: >"$RUN_DIR/run.log"
: >"$RUN_DIR/verification.log"
: >"$RUN_DIR/ml_export_check.log"
write_commands_file "$COMMANDS_FILE" "$SESSION_NAME_RESOLVED" "$RUN_ID" "$GAME_ID_PREFIX" "$RUN_DIR" "$ARCHIVE_PATH"

prepare_db_args=(
  tsx "$TRAINING_DATA_SCRIPT" prepare-database
  --metadata-file "$METADATA_FILE"
  --pg-password-file "$(dirname "$STOP_FILE")/pg-password.txt"
  --allow-unhealthy-backend "$ALLOW_UNHEALTHY_BACKEND"
  --allow-conflicting-writers "$ALLOW_CONFLICTING_WRITERS"
)
if [[ -n "$ALLOW_CLEAR_DB_NAME" ]]; then
  prepare_db_args+=(--allow-clear-db-name "$ALLOW_CLEAR_DB_NAME")
fi
(
  cd "$REPO_ROOT"
  npx "${prepare_db_args[@]}"
)

RUNNER_PASSWORD_FILE="$(dirname "$STOP_FILE")/pg-password.txt"
REPO_ROOT_ESCAPED="$(printf '%q' "$REPO_ROOT")"
TRAINING_DATA_SCRIPT_ESCAPED="$(printf '%q' "$TRAINING_DATA_SCRIPT")"
METADATA_FILE_ESCAPED="$(printf '%q' "$METADATA_FILE")"
RUNNER_PASSWORD_FILE_ESCAPED="$(printf '%q' "$RUNNER_PASSWORD_FILE")"
RUNNER_CMD="cd \"$REPO_ROOT\" && bash -lc 'trap \"npx tsx $TRAINING_DATA_SCRIPT_ESCAPED finalize-run --metadata-file $METADATA_FILE_ESCAPED --pg-password-file $RUNNER_PASSWORD_FILE_ESCAPED >/dev/null 2>&1 || true\" EXIT HUP INT TERM; npx tsx $TRAINING_DATA_SCRIPT_ESCAPED run-loop --metadata-file $METADATA_FILE_ESCAPED --pg-password-file $RUNNER_PASSWORD_FILE_ESCAPED'"
nohup bash -lc "$RUNNER_CMD" >/dev/null 2>&1 &
runner_pid="$!"
printf '%s\n' "$runner_pid" >"$PID_FILE"

wait_output_file="$(mktemp)"
wait_error_file="$(mktemp)"
if ! (
  cd "$REPO_ROOT" &&
    npx tsx "$TRAINING_DATA_SCRIPT" wait-for-start \
      --metadata-file "$METADATA_FILE" \
      --pg-password-file "$RUNNER_PASSWORD_FILE" \
      --timeout-seconds "$STARTUP_TIMEOUT_SECONDS" \
      --poll-interval-ms "$STARTUP_POLL_MILLISECONDS" \
      --tail-lines 80
) >"$wait_output_file" 2>"$wait_error_file"; then
  date -Iseconds >"$STOP_FILE"
  if [[ -n "$runner_pid" ]] && kill -0 "$runner_pid" >/dev/null 2>&1; then
    kill "$runner_pid" >/dev/null 2>&1 || true
    wait "$runner_pid" >/dev/null 2>&1 || true
  fi
  wait_stdout="$(cat "$wait_output_file" 2>/dev/null || true)"
  wait_stderr="$(cat "$wait_error_file" 2>/dev/null || true)"
  report_file="$(mktemp)"
  printf '%s' "$wait_stdout" >"$report_file"
  reason="$(
    node - "$report_file" <<'NODE'
const fs = require('fs');
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(String(parsed.message || 'training start verification failed'));
} catch {
  process.stdout.write('training start verification failed');
}
NODE
  )"
  global_counts="$(
    node - "$report_file" <<'NODE'
const fs = require('fs');
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const global = parsed.scoped_snapshot?.global_counts;
  process.stdout.write(global ? `matches=${global.matches} decisions=${global.decisions} events=${global.events}` : 'unavailable');
} catch {
  process.stdout.write('unavailable');
}
NODE
  )"
  scoped_counts="$(
    node - "$report_file" <<'NODE'
const fs = require('fs');
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const scoped = parsed.scoped_snapshot?.scoped_counts;
  process.stdout.write(scoped ? `matches=${scoped.matches} decisions=${scoped.decisions} events=${scoped.events}` : 'unavailable');
} catch {
  process.stdout.write('unavailable');
}
NODE
  )"
  attempted_command="$(
    node - "$report_file" <<'NODE'
const fs = require('fs');
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(String(parsed.latest_batch_command || 'nohup bash -lc <training run-loop>'));
} catch {
  process.stdout.write('nohup bash -lc <training run-loop>');
}
NODE
  )"
  suggested_debug_command="$(
    node - "$report_file" <<'NODE'
const fs = require('fs');
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(String(parsed.suggested_debug_command || 'npx tsx scripts/training-data.ts status-run'));
} catch {
  process.stdout.write('npx tsx scripts/training-data.ts status-run');
}
NODE
  )"
  echo "Training start verification failed." >&2
  echo "Reason: $reason" >&2
  echo "Exact command attempted: $attempted_command" >&2
  echo "Working directory: $REPO_ROOT" >&2
  echo "Backend URL: $BACKEND_URL" >&2
  echo "Database target: $PG_HOST:$PG_PORT/$PG_DB" >&2
  echo "PID/process status: pid=$runner_pid running=$(kill -0 "$runner_pid" >/dev/null 2>&1 && echo true || echo false)" >&2
  echo "Global counts: $global_counts" >&2
  echo "Scoped counts: $scoped_counts" >&2
  echo "Suggested next command: $suggested_debug_command" >&2
  echo "Last 80 log lines:" >&2
  node - "$report_file" <<'NODE'
const fs = require('fs');
try {
  const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (const line of parsed.latest_log_lines || ['(no run log output captured)']) {
    process.stderr.write(`${line}\n`);
  }
  process.stderr.write('Last verification lines:\n');
  for (const line of parsed.latest_verification_lines || ['(no verification log output captured)']) {
    process.stderr.write(`${line}\n`);
  }
} catch {
  process.stderr.write('(unable to parse wait-for-start report)\n');
}
NODE
  if [[ -n "$wait_stderr" ]]; then
    printf '%s\n' "$wait_stderr" >&2
  fi
  rm -f "$report_file" "$wait_output_file" "$wait_error_file"
  exit 1
fi

wait_report_file="$(mktemp)"
cat "$wait_output_file" >"$wait_report_file"
echo "$MODE_LABEL"
echo "Training job verified: $SESSION_NAME_RESOLVED"
echo "Run ID: $RUN_ID"
echo "Game ID prefix: $GAME_ID_PREFIX"
echo "Run directory: $RUN_DIR"
node - "$wait_report_file" <<'NODE'
const fs = require('fs');
const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const scoped = parsed.scoped_snapshot?.scoped_counts;
if (scoped) {
  console.log(`Scoped rows: matches=${scoped.matches} decisions=${scoped.decisions} events=${scoped.events}`);
}
console.log(`Backend URL: ${parsed.backend_url}`);
console.log(`Process state: pid=${parsed.process_id} running=${parsed.process_running} exit_code=${parsed.sim_exit_code}`);
NODE
echo "Watch runner: tail -f \"$RUN_DIR/run.log\""
echo "Watch verifier: tail -f \"$RUN_DIR/verification.log\""
echo "Watch ML export compatibility check: tail -f \"$RUN_DIR/ml_export_check.log\""
echo "Stop: scripts/stop-training.sh --session $SESSION_NAME_RESOLVED"
echo "Export path: $ARCHIVE_PATH"
rm -f "$wait_report_file" "$wait_output_file" "$wait_error_file"

if [[ "$ATTACH_AFTER" == "true" ]]; then
  exec tail -f "$RUN_DIR/run.log"
fi
