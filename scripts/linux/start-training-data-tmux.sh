#!/usr/bin/env bash
set -Eeuo pipefail

# Starts an isolated training-data self-play session inside tmux.
# Default mode clears events/decisions/matches in the training database,
# runs repeated full-telemetry self-play batches, verifies scoped Postgres
# growth, validates ml:export compatibility without running a full export,
# and packages current-run-only CSV/log artifacts into /tmp on finalize.

print_help() {
  cat <<'EOF'
Usage:
  scripts/linux/start-training-data-tmux.sh [options]

Starts an isolated training-data self-play session inside tmux.

Modes:
  Default: CLEAR DATABASE MODE
  -noclear, --no-clear: NO-CLEAR APPEND MODE

Help:
  --help, -h, -help
      Show this help text and exit.

Session control:
  --session <name>
      Use an explicit tmux session name instead of the auto-generated
      tichuml-<run_id> value.
  --replace-session
      Kill and recreate an existing tmux session with the same name.
  --attach
      Attach to the tmux session after launch.
  --detach-only
      Start the tmux session without attaching. This is the default.

Simulation:
  --games <count>
      Games per batch. Default: 1000
  --provider <local|server_heuristic|lightgbm_model>
      Decision provider. Default: server_heuristic
  --backend-url <url>
      Backend base URL. Default: http://127.0.0.1:4310
  --strict-telemetry <true|false>
      Whether telemetry failures should be strict. Default: false
  --decision-timeout-ms <milliseconds>
      Diagnostic escape hatch for backend decision timeouts. Default: 500
  --interval-seconds <seconds>
      Seconds between scoped verification snapshots. Default: 15

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
  -noclear, --no-clear
      Preserve existing rows and append new scoped training data.

Validation and export:
  --dry-run
      Print the resolved run/session/export plan without launching tmux.
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
  CDPATH= cd -- "$(script_dir)/../.." && pwd
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
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
Attach:
tmux attach -t $session_name

Stop:
tmux kill-session -t $session_name

Watch runner:
tail -f training-runs/$run_id/run.log

Watch verifier:
tail -f training-runs/$run_id/verification.log

Watch ML export compatibility check:
tail -f training-runs/$run_id/ml_export_check.log

Suggested manual ml:export command:
npm run ml:export -- --run-id $run_id --game-id-prefix $game_id_prefix --output-dir training-runs/$run_id/ml

Expected export:
ls -lh $archive_path
EOF
}

REPO_ROOT="${BACKEND_REPO_ROOT:-$(repo_root_default)}"
TRAINING_CLEAR_SQL="TRUNCATE TABLE events, decisions, matches RESTART IDENTITY CASCADE;"
GAMES=1000
PROVIDER="server_heuristic"
BACKEND_URL="http://127.0.0.1:4310"
STRICT_TELEMETRY="false"
DECISION_TIMEOUT_MS="500"
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
ML_EXPORT_COMMAND="npm run ml:export"
SESSION_NAME=""

while (($#)); do
  case "$1" in
    --help|-h|-help)
      print_help
      exit 0
      ;;
    --session)
      SESSION_NAME="${2:?missing value for --session}"
      shift 2
      ;;
    --games)
      GAMES="${2:?missing value for --games}"
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
if [[ "$DRY_RUN" != "true" ]]; then
  require_command tmux
elif ! command -v tmux >/dev/null 2>&1; then
  echo "Warning: tmux is not installed in this environment; live Linux launch would currently fail." >&2
fi

tmp_metadata="$(mktemp)"
cleanup() {
  rm -f "$tmp_metadata"
}
trap cleanup EXIT

prepare_args=(
  tsx scripts/training-data.ts prepare-run
  --repo-root "$REPO_ROOT"
  --training-runs-root "$REPO_ROOT/training-runs"
  --export-root "/tmp"
  --archive-root "/tmp"
  --provider "$PROVIDER"
  --games-per-batch "$GAMES"
  --backend-url "$BACKEND_URL"
  --strict-telemetry "$STRICT_TELEMETRY"
  --telemetry-mode "full"
  --decision-timeout-ms "$DECISION_TIMEOUT_MS"
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

if tmux has-session -t "$SESSION_NAME_RESOLVED" 2>/dev/null; then
  if [[ "$REPLACE_SESSION" == "true" ]]; then
    tmux kill-session -t "$SESSION_NAME_RESOLVED"
  else
    echo "Session already exists: $SESSION_NAME_RESOLVED" >&2
    echo "Attach: tmux attach -t $SESSION_NAME_RESOLVED" >&2
    echo "Stop: tmux kill-session -t $SESSION_NAME_RESOLVED" >&2
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
  echo "Decision request mode: fast_path_default"
  echo "Clear SQL: $TRAINING_CLEAR_SQL"
  echo "Scoped export filter: game_id LIKE '${GAME_ID_PREFIX}%'"
  echo "ML export validation command: npm run ml:export -- --validate-only --run-id $RUN_ID --game-id-prefix $GAME_ID_PREFIX --output-dir training-runs/$RUN_ID/ml"
  echo "Suggested manual ml:export command: npm run ml:export -- --run-id $RUN_ID --game-id-prefix $GAME_ID_PREFIX --output-dir training-runs/$RUN_ID/ml"
  echo "Expected LightGBM files: train.parquet|train.csv.gz, dataset_metadata.json, feature_schema.json, feature_columns.json, label_columns.json"
  echo "Attach command: tmux attach -t $SESSION_NAME_RESOLVED"
  echo "Stop command: tmux kill-session -t $SESSION_NAME_RESOLVED"
  if ! (
    cd "$REPO_ROOT" &&
      prepare_db_args=(
        tsx scripts/training-data.ts prepare-database
        --metadata-file "$tmp_metadata"
        --pg-password "$PG_PASSWORD"
        --dry-run
        --allow-unhealthy-backend "$ALLOW_UNHEALTHY_BACKEND"
      )
      if [[ -n "$ALLOW_CLEAR_DB_NAME" ]]; then
        prepare_db_args+=(--allow-clear-db-name "$ALLOW_CLEAR_DB_NAME")
      fi
      npx "${prepare_db_args[@]}"
  ); then
    echo "Warning: dry-run database validation could not complete with current backend/Postgres state." >&2
  fi
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
  tsx scripts/training-data.ts prepare-database
  --metadata-file "$METADATA_FILE"
  --pg-password-file "$(dirname "$STOP_FILE")/pg-password.txt"
  --allow-unhealthy-backend "$ALLOW_UNHEALTHY_BACKEND"
)
if [[ -n "$ALLOW_CLEAR_DB_NAME" ]]; then
  prepare_db_args+=(--allow-clear-db-name "$ALLOW_CLEAR_DB_NAME")
fi
(
  cd "$REPO_ROOT"
  npx "${prepare_db_args[@]}"
)

RUNNER_CMD="cd \"$REPO_ROOT\" && bash -lc 'trap \"npx tsx scripts/training-data.ts finalize-run --metadata-file \\\"$METADATA_FILE\\\" --pg-password-file \\\"$(dirname "$STOP_FILE")/pg-password.txt\\\" >/dev/null 2>&1 || true\" EXIT HUP INT TERM; npx tsx scripts/training-data.ts run-loop --metadata-file \"$METADATA_FILE\" --pg-password-file \"$(dirname "$STOP_FILE")/pg-password.txt\"'"
VERIFIER_CMD="cd \"$REPO_ROOT\" && bash -lc 'while true; do npx tsx scripts/training-data.ts verify-run --metadata-file \"$METADATA_FILE\" --pg-password-file \"$(dirname "$STOP_FILE")/pg-password.txt\" || true; sleep $INTERVAL_SECONDS; done'"
MONITOR_CMD="cd \"$REPO_ROOT\" && bash -lc 'echo Session: $SESSION_NAME_RESOLVED; echo Run: $RUN_ID; tail -n 20 -f \"$RUN_DIR/run.log\" \"$RUN_DIR/verification.log\" \"$RUN_DIR/ml_export_check.log\"'"

tmux new-session -d -s "$SESSION_NAME_RESOLVED" -n runner "$RUNNER_CMD"
tmux new-window -t "$SESSION_NAME_RESOLVED" -n verifier "$VERIFIER_CMD"
tmux new-window -t "$SESSION_NAME_RESOLVED" -n monitor "$MONITOR_CMD"

echo "$MODE_LABEL"
echo "Training session started: $SESSION_NAME_RESOLVED"
echo "Run ID: $RUN_ID"
echo "Game ID prefix: $GAME_ID_PREFIX"
echo "Attach: tmux attach -t $SESSION_NAME_RESOLVED"
echo "Stop: tmux kill-session -t $SESSION_NAME_RESOLVED"
echo "Watch runner: tail -f training-runs/$RUN_ID/run.log"
echo "Watch verifier: tail -f training-runs/$RUN_ID/verification.log"
echo "Watch ML export compatibility check: tail -f training-runs/$RUN_ID/ml_export_check.log"
echo "Export path: $ARCHIVE_PATH"

if [[ "$ATTACH_AFTER" == "true" ]]; then
  exec tmux attach -t "$SESSION_NAME_RESOLVED"
fi
