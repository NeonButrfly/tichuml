#!/usr/bin/env bash
set -Eeuo pipefail

# verify-full-sim-backend.sh
# Full backend + simulator + telemetry DB verification for tichuml.
#
# Goals:
# - verify Docker/Postgres
# - run migrations
# - verify backend health
# - optionally clear DB through the backend admin endpoint
# - run a simulator batch
# - wait for telemetry queue drain
# - capture DB truth
# - assert decisions/events are useful
# - optionally fail if matches/state_raw are not populated yet
# - package artifacts for review

REPO_ROOT=""
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:4310}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-tichu-postgres}"
POSTGRES_DB="${POSTGRES_DB:-tichu}"
POSTGRES_USER="${POSTGRES_USER:-tichu}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-tichu_dev_password}"
POSTGRES_PORT="${POSTGRES_PORT:-54329}"

GAMES=100
PROVIDER="local"
TELEMETRY="true"
STRICT_TELEMETRY="false"
TELEMETRY_MODE="minimal"
FULL_STATE="false"
CLEAR_DATABASE="false"
SKIP_BUILD="false"
SKIP_MIGRATE="false"
START_BACKEND_IF_DOWN="true"
REQUIRE_MATCHES="false"
REQUIRE_FULL_STATE_RAW="false"
MIN_DECISIONS=1
MIN_EVENTS=1
QUEUE_DRAIN_TIMEOUT_SECONDS=60
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_DIR=""

ADMIN_CONFIRMATION_VALUE="CLEAR_TICHU_DB"

usage() {
  cat <<'EOF'
Usage:
  scripts/linux/verify-full-sim-backend.sh [options]

Options:
  --repo-root PATH
  --backend-url URL
  --postgres-container NAME
  --postgres-db NAME
  --postgres-user NAME
  --postgres-password PASSWORD
  --games N
  --provider local|server_heuristic|lightgbm_model
  --telemetry true|false
  --strict-telemetry true|false
  --telemetry-mode minimal|full
  --full-state true|false
  --clear-database
  --skip-build
  --skip-migrate
  --no-start-backend
  --require-matches
  --require-full-state-raw
  --min-decisions N
  --min-events N
  --queue-drain-timeout-seconds N

Examples:
  ./scripts/linux/verify-full-sim-backend.sh --clear-database --games 100 --provider local
  ./scripts/linux/verify-full-sim-backend.sh --clear-database --games 25 --provider server_heuristic --telemetry-mode full --full-state true --require-full-state-raw
  ./scripts/linux/verify-full-sim-backend.sh --games 1000 --provider local --strict-telemetry false
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --backend-url) BACKEND_URL="$2"; shift 2 ;;
    --postgres-container) POSTGRES_CONTAINER="$2"; shift 2 ;;
    --postgres-db) POSTGRES_DB="$2"; shift 2 ;;
    --postgres-user) POSTGRES_USER="$2"; shift 2 ;;
    --postgres-password) POSTGRES_PASSWORD="$2"; shift 2 ;;
    --games) GAMES="$2"; shift 2 ;;
    --provider) PROVIDER="$2"; shift 2 ;;
    --telemetry) TELEMETRY="$2"; shift 2 ;;
    --strict-telemetry) STRICT_TELEMETRY="$2"; shift 2 ;;
    --telemetry-mode) TELEMETRY_MODE="$2"; shift 2 ;;
    --full-state) FULL_STATE="$2"; shift 2 ;;
    --clear-database) CLEAR_DATABASE="true"; shift ;;
    --skip-build) SKIP_BUILD="true"; shift ;;
    --skip-migrate) SKIP_MIGRATE="true"; shift ;;
    --no-start-backend) START_BACKEND_IF_DOWN="false"; shift ;;
    --require-matches) REQUIRE_MATCHES="true"; shift ;;
    --require-full-state-raw) REQUIRE_FULL_STATE_RAW="true"; shift ;;
    --min-decisions) MIN_DECISIONS="$2"; shift 2 ;;
    --min-events) MIN_EVENTS="$2"; shift 2 ;;
    --queue-drain-timeout-seconds) QUEUE_DRAIN_TIMEOUT_SECONDS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[FAIL] Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "$REPO_ROOT" ]]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
fi

ARTIFACT_DIR="$REPO_ROOT/.runtime/full-sim-verify/$RUN_ID"
mkdir -p "$ARTIFACT_DIR"

LOG_FILE="$ARTIFACT_DIR/verify.log"
SUMMARY_JSON="$ARTIFACT_DIR/summary.json"
DB_REPORT_JSON="$ARTIFACT_DIR/db-report.json"
SIM_OUTPUT="$ARTIFACT_DIR/sim-output.log"
HEALTH_JSON="$ARTIFACT_DIR/health.json"
TELEMETRY_HEALTH_JSON="$ARTIFACT_DIR/telemetry-health.json"
FAILURES=0

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"
}

fail() {
  FAILURES=$((FAILURES + 1))
  log "[FAIL] $*"
}

ok() {
  log "[OK] $*"
}

info() {
  log "[INFO] $*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
    exit 1
  fi
}

curl_json() {
  local method="$1"
  local url="$2"
  local output="$3"
  local body="${4:-}"
  local status

  if [[ -n "$body" ]]; then
    status="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H 'content-type: application/json' --data "$body" || true)"
  else
    status="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" || true)"
  fi

  printf '%s' "$status"
}

json_get() {
  local file="$1"
  local expr="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const expr = process.argv[2];
    let data = {};
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(3); }
    const value = expr.split(".").reduce((acc, key) => acc == null ? undefined : acc[key], data);
    if (value === undefined || value === null) process.exit(4);
    if (typeof value === "object") process.stdout.write(JSON.stringify(value));
    else process.stdout.write(String(value));
  ' "$file" "$expr"
}

psql_scalar() {
  local sql="$1"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "$sql"
}

psql_file() {
  local sql="$1"
  local out="$2"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtc "$sql" > "$out"
}

write_summary() {
  local status="$1"
  node -e '
    const fs = require("fs");
    const payload = {
      status: process.argv[1],
      run_id: process.argv[2],
      artifact_dir: process.argv[3],
      backend_url: process.argv[4],
      postgres_container: process.argv[5],
      postgres_db: process.argv[6],
      postgres_user: process.argv[7],
      games: Number(process.argv[8]),
      provider: process.argv[9],
      telemetry: process.argv[10],
      strict_telemetry: process.argv[11],
      telemetry_mode: process.argv[12],
      full_state: process.argv[13],
      clear_database: process.argv[14],
      require_matches: process.argv[15],
      require_full_state_raw: process.argv[16],
      failures: Number(process.argv[17]),
      generated_at: new Date().toISOString()
    };
    fs.writeFileSync(process.argv[18], JSON.stringify(payload, null, 2) + "\n");
  ' \
    "$status" "$RUN_ID" "$ARTIFACT_DIR" "$BACKEND_URL" "$POSTGRES_CONTAINER" "$POSTGRES_DB" "$POSTGRES_USER" \
    "$GAMES" "$PROVIDER" "$TELEMETRY" "$STRICT_TELEMETRY" "$TELEMETRY_MODE" "$FULL_STATE" "$CLEAR_DATABASE" \
    "$REQUIRE_MATCHES" "$REQUIRE_FULL_STATE_RAW" "$FAILURES" "$SUMMARY_JSON"
}

on_exit() {
  local code=$?
  local final_status="pass"
  if [[ "$code" -ne 0 || "$FAILURES" -ne 0 ]]; then
    final_status="fail"
  fi

  write_summary "$final_status"

  if [[ -d "$ARTIFACT_DIR" ]]; then
    tar -czf "$ARTIFACT_DIR.tar.gz" -C "$(dirname "$ARTIFACT_DIR")" "$(basename "$ARTIFACT_DIR")" >/dev/null 2>&1 || true
    log "[INFO] Artifact folder: $ARTIFACT_DIR"
    log "[INFO] Artifact archive: $ARTIFACT_DIR.tar.gz"
  fi

  if [[ "$final_status" = "fail" ]]; then
    log "[FAIL] Full sim backend verification failed."
  else
    log "[OK] Full sim backend verification passed."
  fi

  exit "$code"
}
trap on_exit EXIT

cd "$REPO_ROOT"

require_command docker
require_command curl
require_command node
require_command npm

info "Repo root: $REPO_ROOT"
info "Backend URL: $BACKEND_URL"
info "Artifacts: $ARTIFACT_DIR"

case "$PROVIDER" in
  local|server_heuristic|lightgbm_model) ;;
  *) fail "Invalid provider: $PROVIDER"; exit 2 ;;
esac

case "$TELEMETRY_MODE" in
  minimal|full) ;;
  *) fail "Invalid telemetry mode: $TELEMETRY_MODE"; exit 2 ;;
esac

info "Checking git identity"
git rev-parse HEAD > "$ARTIFACT_DIR/git-head.txt" 2>&1 || true
git status --short > "$ARTIFACT_DIR/git-status-short.txt" 2>&1 || true

info "Checking Docker"
docker info > "$ARTIFACT_DIR/docker-info.txt" 2>&1 || {
  fail "Docker is not reachable."
  exit 1
}
ok "Docker reachable"

info "Starting Postgres with docker compose"
npm run db:up > "$ARTIFACT_DIR/db-up.log" 2>&1 || {
  fail "npm run db:up failed"
  exit 1
}

info "Waiting for Postgres container health"
for i in $(seq 1 60); do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    ok "Postgres is ready"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    docker ps -a > "$ARTIFACT_DIR/docker-ps.txt" 2>&1 || true
    docker logs "$POSTGRES_CONTAINER" > "$ARTIFACT_DIR/postgres.log" 2>&1 || true
    fail "Postgres did not become ready"
    exit 1
  fi
  sleep 2
done

if [[ "$SKIP_MIGRATE" != "true" ]]; then
  info "Running migrations"
  npm run db:migrate > "$ARTIFACT_DIR/db-migrate.log" 2>&1 || {
    fail "npm run db:migrate failed"
    exit 1
  }
  ok "Migrations completed"
fi

if [[ "$SKIP_BUILD" != "true" ]]; then
  info "Running build chain"
  {
    npm run build:shared
    npm run build:engine
    npm run build:telemetry
    npm run build:ai
    npm run build:server
    npm run build:sim-runner
  } > "$ARTIFACT_DIR/build.log" 2>&1 || {
    fail "Build chain failed"
    exit 1
  }
  ok "Build chain completed"
fi

info "Checking backend health"
health_status="$(curl_json GET "$BACKEND_URL/health" "$HEALTH_JSON")"

if [[ "$health_status" != "200" && "$START_BACKEND_IF_DOWN" = "true" ]]; then
  info "Backend is not healthy yet; attempting Linux startup helpers if present"

  if [[ -x "$REPO_ROOT/scripts/linux/start-backend.sh" ]]; then
    "$REPO_ROOT/scripts/linux/start-backend.sh" > "$ARTIFACT_DIR/start-backend-linux.log" 2>&1 || true
  elif [[ -x "$REPO_ROOT/scripts/start_backend_linux.sh" ]]; then
    "$REPO_ROOT/scripts/start_backend_linux.sh" > "$ARTIFACT_DIR/start-backend-linux.log" 2>&1 || true
  elif [[ -f "$REPO_ROOT/scripts/linux/backend-common.sh" ]]; then
    bash -lc "source '$REPO_ROOT/scripts/linux/backend-common.sh'; load_repo_env; start_backend_background" > "$ARTIFACT_DIR/start-backend-linux.log" 2>&1 || true
  else
    info "No Linux backend start helper found; starting npm run start:server directly"
    nohup npm run start:server > "$ARTIFACT_DIR/backend-direct.log" 2>&1 &
    echo "$!" > "$ARTIFACT_DIR/backend-direct.pid"
  fi

  for i in $(seq 1 60); do
    health_status="$(curl_json GET "$BACKEND_URL/health" "$HEALTH_JSON")"
    if [[ "$health_status" = "200" ]]; then
      break
    fi
    sleep 2
  done
fi

if [[ "$health_status" != "200" ]]; then
  fail "Backend /health failed with HTTP $health_status"
  exit 1
fi
ok "Backend /health passed"

telemetry_health_status="$(curl_json GET "$BACKEND_URL/api/telemetry/health" "$TELEMETRY_HEALTH_JSON")"
if [[ "$telemetry_health_status" != "200" ]]; then
  fail "Telemetry health failed with HTTP $telemetry_health_status"
  exit 1
fi
ok "Telemetry health endpoint passed"

if [[ "$CLEAR_DATABASE" = "true" ]]; then
  info "Clearing database through backend admin endpoint"
  reset_status="$(curl -sS -o "$ARTIFACT_DIR/admin-db-reset.json" -w '%{http_code}' \
    -X POST "$BACKEND_URL/api/admin/database/reset" \
    -H 'content-type: application/json' \
    -H "x-admin-confirm: $ADMIN_CONFIRMATION_VALUE" \
    --data "{\"confirm\":\"$ADMIN_CONFIRMATION_VALUE\"}" || true)"

  if [[ "$reset_status" != "200" ]]; then
    fail "Database reset endpoint failed with HTTP $reset_status. ENABLE_DESTRUCTIVE_ADMIN_ENDPOINTS may be false."
    cat "$ARTIFACT_DIR/admin-db-reset.json" >> "$LOG_FILE" || true
    exit 1
  fi
  ok "Database reset accepted"
fi

before_decisions="$(psql_scalar "SELECT COUNT(*) FROM decisions;")"
before_events="$(psql_scalar "SELECT COUNT(*) FROM events;")"
before_matches="$(psql_scalar "SELECT COUNT(*) FROM matches;")"
info "Before sim: decisions=$before_decisions events=$before_events matches=$before_matches"

info "Running simulator batch"
set +e
npm run sim -- \
  --games "$GAMES" \
  --provider "$PROVIDER" \
  --telemetry "$TELEMETRY" \
  --strict-telemetry "$STRICT_TELEMETRY" \
  --backend-url "$BACKEND_URL" \
  --telemetry-mode "$TELEMETRY_MODE" \
  --full-state "$FULL_STATE" \
  --quiet > "$SIM_OUTPUT" 2>&1
sim_exit=$?
set -e

if [[ "$sim_exit" -ne 0 ]]; then
  fail "Simulator exited nonzero: $sim_exit"
  tail -n 80 "$SIM_OUTPUT" | tee -a "$LOG_FILE" || true
  exit 1
fi
ok "Simulator completed"

info "Waiting for telemetry queue drain"
queue_ok="false"
for i in $(seq 1 "$QUEUE_DRAIN_TIMEOUT_SECONDS"); do
  telemetry_health_status="$(curl_json GET "$BACKEND_URL/api/telemetry/health" "$TELEMETRY_HEALTH_JSON")"
  if [[ "$telemetry_health_status" = "200" ]]; then
    queue_pending="$(json_get "$TELEMETRY_HEALTH_JSON" "queue.queue_depth" 2>/dev/null || printf '0')"
    persistence_failures="$(json_get "$TELEMETRY_HEALTH_JSON" "queue.persistence_failures" 2>/dev/null || printf '0')"
    if [[ "$queue_pending" = "0" && "$persistence_failures" = "0" ]]; then
      queue_ok="true"
      break
    fi
  fi
  sleep 1
done

if [[ "$queue_ok" != "true" ]]; then
  fail "Telemetry queue did not drain cleanly within timeout"
else
  ok "Telemetry queue drained cleanly"
fi

after_decisions="$(psql_scalar "SELECT COUNT(*) FROM decisions;")"
after_events="$(psql_scalar "SELECT COUNT(*) FROM events;")"
after_matches="$(psql_scalar "SELECT COUNT(*) FROM matches;")"
info "After sim: decisions=$after_decisions events=$after_events matches=$after_matches"

delta_decisions=$((after_decisions - before_decisions))
delta_events=$((after_events - before_events))
delta_matches=$((after_matches - before_matches))

info "Deltas: decisions=$delta_decisions events=$delta_events matches=$delta_matches"

if [[ "$delta_decisions" -lt "$MIN_DECISIONS" ]]; then
  fail "Decision delta $delta_decisions is below minimum $MIN_DECISIONS"
else
  ok "Decision delta is useful: $delta_decisions"
fi

if [[ "$delta_events" -lt "$MIN_EVENTS" ]]; then
  fail "Event delta $delta_events is below minimum $MIN_EVENTS"
else
  ok "Event delta is useful: $delta_events"
fi

if [[ "$REQUIRE_MATCHES" = "true" ]]; then
  if [[ "$delta_matches" -lt 1 ]]; then
    fail "Match lifecycle verification failed: matches did not increase"
  else
    ok "Match lifecycle rows increased: $delta_matches"
  fi
else
  if [[ "$delta_matches" -lt 1 ]]; then
    info "matches did not increase; current repo may not have match lifecycle persistence wired yet"
  fi
fi

info "Capturing DB truth report"

read -r -d '' DB_REPORT_SQL <<'SQL' || true
WITH
decision_rows AS (
  SELECT to_jsonb(d) AS j FROM decisions d
),
event_rows AS (
  SELECT to_jsonb(e) AS j FROM events e
),
match_rows AS (
  SELECT to_jsonb(m) AS j FROM matches m
),
counts AS (
  SELECT jsonb_build_object(
    'decisions', (SELECT COUNT(*) FROM decisions),
    'events', (SELECT COUNT(*) FROM events),
    'matches', (SELECT COUNT(*) FROM matches),
    'schema_migrations', (SELECT COUNT(*) FROM schema_migrations)
  ) AS data
),
linkage AS (
  SELECT jsonb_build_object(
    'decisions_missing_game_id', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id') IS NULL),
    'events_missing_game_id', (SELECT COUNT(*) FROM event_rows WHERE COALESCE(j->>'game_id', j->'payload'->>'game_id') IS NULL),
    'decisions_missing_hand_id', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE(j->>'hand_id', j->'payload'->>'hand_id', j->'request'->>'hand_id') IS NULL),
    'events_missing_hand_id', (SELECT COUNT(*) FROM event_rows WHERE COALESCE(j->>'hand_id', j->'payload'->>'hand_id') IS NULL),
    'distinct_decision_game_ids', (SELECT COUNT(DISTINCT COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id')) FROM decision_rows),
    'distinct_event_game_ids', (SELECT COUNT(DISTINCT COALESCE(j->>'game_id', j->'payload'->>'game_id')) FROM event_rows),
    'decision_game_ids_without_events', (
      SELECT COUNT(*) FROM (
        SELECT DISTINCT COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id') AS game_id
        FROM decision_rows
        WHERE COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id') IS NOT NULL
        EXCEPT
        SELECT DISTINCT COALESCE(j->>'game_id', j->'payload'->>'game_id') AS game_id
        FROM event_rows
        WHERE COALESCE(j->>'game_id', j->'payload'->>'game_id') IS NOT NULL
      ) q
    ),
    'event_game_ids_without_decisions', (
      SELECT COUNT(*) FROM (
        SELECT DISTINCT COALESCE(j->>'game_id', j->'payload'->>'game_id') AS game_id
        FROM event_rows
        WHERE COALESCE(j->>'game_id', j->'payload'->>'game_id') IS NOT NULL
        EXCEPT
        SELECT DISTINCT COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id') AS game_id
        FROM decision_rows
        WHERE COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id') IS NOT NULL
      ) q
    )
  ) AS data
),
quality AS (
  SELECT jsonb_build_object(
    'decisions_with_empty_state_raw', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE(j->'state_raw', '{}'::jsonb) = '{}'::jsonb),
    'decisions_with_explanation', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE((j->>'has_explanation')::boolean, false) = true OR j->'explanation' IS NOT NULL),
    'decisions_with_candidate_scores', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE((j->>'has_candidate_scores')::boolean, false) = true OR jsonb_typeof(j->'candidate_scores') = 'array'),
    'decisions_with_state_features', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE((j->>'has_state_features')::boolean, false) = true OR j->'state_features' IS NOT NULL),
    'decisions_with_illegal_chosen_action', (SELECT COUNT(*) FROM decision_rows WHERE COALESCE((j->>'chosen_action_is_legal')::boolean, true) = false),
    'events_with_null_match_id', (SELECT COUNT(*) FROM event_rows WHERE j ? 'match_id' AND j->>'match_id' IS NULL),
    'decisions_with_match_id_column', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='decisions' AND column_name='match_id'),
    'events_with_match_id_column', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='match_id')
  ) AS data
),
providers AS (
  SELECT COALESCE(jsonb_object_agg(provider_used, row_count), '{}'::jsonb) AS data
  FROM (
    SELECT COALESCE(j->>'provider_used', j->'metadata'->>'provider_used', j->>'policy_source', 'unknown') AS provider_used, COUNT(*) AS row_count
    FROM decision_rows
    GROUP BY provider_used
    ORDER BY row_count DESC
  ) x
),
event_types AS (
  SELECT COALESCE(jsonb_object_agg(event_type, row_count), '{}'::jsonb) AS data
  FROM (
    SELECT COALESCE(j->>'event_type', j->'payload'->>'event_type', 'unknown') AS event_type, COUNT(*) AS row_count
    FROM event_rows
    GROUP BY event_type
    ORDER BY row_count DESC
  ) x
),
recent_game_ids AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS data
  FROM (
    SELECT game_id, hand_id, decisions, events
    FROM (
      SELECT
        COALESCE(j->>'game_id', j->'payload'->>'game_id', j->'request'->>'game_id') AS game_id,
        COALESCE(j->>'hand_id', j->'payload'->>'hand_id', j->'request'->>'hand_id') AS hand_id,
        COUNT(*) AS decisions,
        0 AS events
      FROM decision_rows
      GROUP BY game_id, hand_id
      UNION ALL
      SELECT
        COALESCE(j->>'game_id', j->'payload'->>'game_id') AS game_id,
        COALESCE(j->>'hand_id', j->'payload'->>'hand_id') AS hand_id,
        0 AS decisions,
        COUNT(*) AS events
      FROM event_rows
      GROUP BY game_id, hand_id
    ) u
    GROUP BY game_id, hand_id, decisions, events
    ORDER BY game_id DESC, hand_id DESC
    LIMIT 25
  ) x
),
samples AS (
  SELECT jsonb_build_object(
    'recent_decisions', (
      SELECT COALESCE(jsonb_agg(j), '[]'::jsonb)
      FROM (
        SELECT j
        FROM decision_rows
        ORDER BY COALESCE(j->>'created_at', j->>'ts', j->>'id', '') DESC
        LIMIT 5
      ) s
    ),
    'recent_events', (
      SELECT COALESCE(jsonb_agg(j), '[]'::jsonb)
      FROM (
        SELECT j
        FROM event_rows
        ORDER BY COALESCE(j->>'created_at', j->>'ts', j->>'id', '') DESC
        LIMIT 10
      ) s
    ),
    'recent_matches', (
      SELECT COALESCE(jsonb_agg(j), '[]'::jsonb)
      FROM (
        SELECT j
        FROM match_rows
        ORDER BY COALESCE(j->>'created_at', j->>'started_at', j->>'id', '') DESC
        LIMIT 10
      ) s
    )
  ) AS data
)
SELECT jsonb_pretty(jsonb_build_object(
  'captured_at', now(),
  'counts', (SELECT data FROM counts),
  'linkage', (SELECT data FROM linkage),
  'quality', (SELECT data FROM quality),
  'providers', (SELECT data FROM providers),
  'event_types', (SELECT data FROM event_types),
  'recent_game_ids', (SELECT data FROM recent_game_ids),
  'samples', (SELECT data FROM samples)
));
SQL

psql_file "$DB_REPORT_SQL" "$DB_REPORT_JSON"

missing_decision_game="$(psql_scalar "SELECT COUNT(*) FROM decisions WHERE game_id IS NULL OR game_id = '';")"
missing_event_game="$(psql_scalar "SELECT COUNT(*) FROM events WHERE game_id IS NULL OR game_id = '';")"
missing_decision_hand="$(psql_scalar "SELECT COUNT(*) FROM decisions WHERE hand_id IS NULL OR hand_id = '';")"
missing_event_hand="$(psql_scalar "SELECT COUNT(*) FROM events WHERE hand_id IS NULL OR hand_id = '';")"
illegal_chosen="$(psql_scalar "SELECT COUNT(*) FROM decisions WHERE chosen_action_is_legal = false;")"
with_candidate_scores="$(psql_scalar "SELECT COUNT(*) FROM decisions WHERE has_candidate_scores = true OR candidate_scores IS NOT NULL;")"
with_state_features="$(psql_scalar "SELECT COUNT(*) FROM decisions WHERE has_state_features = true OR state_features IS NOT NULL;")"
empty_state_raw="$(psql_scalar "SELECT COUNT(*) FROM decisions WHERE state_raw = '{}'::jsonb;")"

if [[ "$missing_decision_game" -ne 0 ]]; then fail "Some decisions are missing game_id: $missing_decision_game"; else ok "All decisions have game_id"; fi
if [[ "$missing_event_game" -ne 0 ]]; then fail "Some events are missing game_id: $missing_event_game"; else ok "All events have game_id"; fi
if [[ "$missing_decision_hand" -ne 0 ]]; then fail "Some decisions are missing hand_id: $missing_decision_hand"; else ok "All decisions have hand_id"; fi
if [[ "$missing_event_hand" -ne 0 ]]; then fail "Some events are missing hand_id: $missing_event_hand"; else ok "All events have hand_id"; fi
if [[ "$illegal_chosen" -ne 0 ]]; then fail "Some decisions have illegal chosen_action: $illegal_chosen"; else ok "All persisted chosen actions are legal"; fi

if [[ "$with_candidate_scores" -lt 1 ]]; then
  fail "No candidate_scores captured; ML decision-quality data is weak"
else
  ok "Candidate scores captured: $with_candidate_scores"
fi

if [[ "$with_state_features" -lt 1 ]]; then
  fail "No state_features captured; ML feature data is weak"
else
  ok "State features captured: $with_state_features"
fi

if [[ "$REQUIRE_FULL_STATE_RAW" = "true" ]]; then
  if [[ "$empty_state_raw" -gt 0 ]]; then
    fail "state_raw has empty rows: $empty_state_raw"
  else
    ok "state_raw is populated for all decisions"
  fi
else
  if [[ "$empty_state_raw" -gt 0 ]]; then
    info "state_raw has empty rows: $empty_state_raw. This may be expected for minimal telemetry, but not for replay-grade/full-state training."
  fi
fi

info "Capturing backend health after verification"
curl_json GET "$BACKEND_URL/health" "$HEALTH_JSON" >/dev/null || true
curl_json GET "$BACKEND_URL/api/telemetry/health" "$TELEMETRY_HEALTH_JSON" >/dev/null || true

info "Capturing process checks"
ps -eo pid,ppid,cmd | grep -E 'node|tsx|tichuml|sim-runner|server' | grep -v grep > "$ARTIFACT_DIR/processes.txt" || true
docker ps -a > "$ARTIFACT_DIR/docker-ps.txt" 2>&1 || true

if [[ "$FAILURES" -ne 0 ]]; then
  exit 1
fi

exit 0
