#!/usr/bin/env sh
set -eu

API_URL="${API_URL:-http://localhost:4310}"
CONFIRM_TOKEN="${CONFIRM_TOKEN:-CLEAR_TICHU_DB}"
ACTION=""
PROVIDER="local"
GAMES_PER_BATCH="1"
TELEMETRY="true"
BACKEND_URL="$API_URL"
SEED_PREFIX="controller"
SLEEP_SECONDS="5"
WORKER_COUNT="1"
QUIET="true"
PROGRESS="false"

prompt() {
  label="$1"
  default="$2"
  printf "%s [%s]: " "$label" "$default" >&2
  read -r value || value=""
  if [ -n "$value" ]; then
    printf "%s" "$value"
  else
    printf "%s" "$default"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    start|pause|continue|stop|status|run-once)
      ACTION="$1"
      shift
      ;;
    --api-url)
      API_URL="$2"
      BACKEND_URL="$2"
      shift 2
      ;;
    --confirm-token)
      CONFIRM_TOKEN="$2"
      shift 2
      ;;
    --provider)
      PROVIDER="$2"
      shift 2
      ;;
    --games|--games-per-batch)
      GAMES_PER_BATCH="$2"
      shift 2
      ;;
    --telemetry)
      TELEMETRY="$2"
      shift 2
      ;;
    --backend-url)
      BACKEND_URL="$2"
      shift 2
      ;;
    --seed|--seed-prefix)
      SEED_PREFIX="$2"
      shift 2
      ;;
    --sleep-seconds)
      SLEEP_SECONDS="$2"
      shift 2
      ;;
    --worker-count|--sim-threads)
      WORKER_COUNT="$2"
      shift 2
      ;;
    --quiet)
      QUIET="true"
      shift
      ;;
    --progress)
      PROGRESS="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ -z "$ACTION" ]; then
  ACTION="$(prompt "Action (start/pause/continue/stop/status/run-once)" "status")"
  PROVIDER="$(prompt "Provider" "$PROVIDER")"
  GAMES_PER_BATCH="$(prompt "Games per batch" "$GAMES_PER_BATCH")"
  TELEMETRY="$(prompt "Telemetry enabled" "$TELEMETRY")"
  BACKEND_URL="$(prompt "Backend URL" "$BACKEND_URL")"
  SEED_PREFIX="$(prompt "Seed prefix" "$SEED_PREFIX")"
  SLEEP_SECONDS="$(prompt "Sleep seconds" "$SLEEP_SECONDS")"
  WORKER_COUNT="$(prompt "Worker count" "$WORKER_COUNT")"
fi

case "$ACTION" in
  start|pause|continue|stop|status|run-once) ;;
  *)
    echo "Invalid action: $ACTION" >&2
    exit 2
    ;;
esac

case "$PROVIDER" in
  local|server_heuristic|lightgbm_model) ;;
  *)
    echo "Invalid provider: $PROVIDER" >&2
    exit 2
    ;;
esac

PAYLOAD=$(cat <<JSON
{
  "provider": "$PROVIDER",
  "games_per_batch": $GAMES_PER_BATCH,
  "telemetry_enabled": $TELEMETRY,
  "backend_url": "$BACKEND_URL",
  "seed_prefix": "$SEED_PREFIX",
  "sleep_seconds": $SLEEP_SECONDS,
  "worker_count": $WORKER_COUNT,
  "quiet": $QUIET,
  "progress": $PROGRESS
}
JSON
)

echo "Resolved simulator controller request:" >&2
echo "$PAYLOAD" >&2

if [ "$ACTION" = "status" ]; then
  curl -fsS "$API_URL/api/admin/sim/status"
else
  endpoint="$ACTION"
  if [ "$ACTION" = "run-once" ]; then
    endpoint="run-once"
  fi
  curl -fsS \
    -X POST \
    -H "content-type: application/json" \
    -H "x-admin-confirm: $CONFIRM_TOKEN" \
    --data "$PAYLOAD" \
    "$API_URL/api/admin/sim/$endpoint"
fi
printf "\n"
