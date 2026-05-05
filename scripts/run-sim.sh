#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

print_help() {
  cat <<'EOF'
Usage:
  scripts/run-sim.sh [options]

Purpose:
  Runs a finite self-play simulator batch from Linux.

Options:
  --games <count>                 Games to run. Default: 100
  --provider <name>               local, server_heuristic, or lightgbm_model. Default: server_heuristic
  --backend-url <url>             Backend base URL. Default: http://127.0.0.1:4310
  --telemetry <true|false>        Emit telemetry. Default: false
  --strict-telemetry <true|false> Fail gameplay on telemetry errors. Default: false
  --seed <value>                  Optional simulator seed.
  --dry-run                       Print the underlying command without running it.
  --help, -h                      Show this help text.

Examples:
  scripts/run-sim.sh --games 1 --provider local --telemetry false
  scripts/run-sim.sh --games 1 --provider server_heuristic --backend-url http://127.0.0.1:4310 --telemetry true

Environment:
  Auto-detects the repo root from the script location. Requires npm dependencies to be installed.
EOF
}

GAMES="100"
PROVIDER="server_heuristic"
BACKEND_URL="http://127.0.0.1:4310"
TELEMETRY="false"
STRICT_TELEMETRY="false"
SEED=""
DRY_RUN="false"

while (($#)); do
  case "$1" in
    --games) GAMES="${2:?missing value for --games}"; shift 2 ;;
    --provider) PROVIDER="${2:?missing value for --provider}"; shift 2 ;;
    --backend-url) BACKEND_URL="${2:?missing value for --backend-url}"; shift 2 ;;
    --telemetry) TELEMETRY="${2:?missing value for --telemetry}"; shift 2 ;;
    --strict-telemetry) STRICT_TELEMETRY="${2:?missing value for --strict-telemetry}"; shift 2 ;;
    --seed) SEED="${2:?missing value for --seed}"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --help|-h) print_help; exit 0 ;;
    *) echo "Unknown run-sim option: $1" >&2; print_help >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(common_resolve_repo_root "$SCRIPT_DIR")"
common_require_repo_root "$REPO_ROOT"
require_command npm

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

  printf 'Workspace package builds are missing; building required packages before sim launch.\n'
  printf 'Underlying build command: npm run build:shared && npm run build:engine && npm run build:telemetry && npm run build:ai && npm run build:sim-runner\n'
  npm run build:shared
  npm run build:engine
  npm run build:telemetry
  npm run build:ai
  npm run build:sim-runner
}

cmd=(npm run sim -- --games "$GAMES" --provider "$PROVIDER" --backend-url "$BACKEND_URL" --telemetry "$TELEMETRY" --strict-telemetry "$STRICT_TELEMETRY")
if [[ -n "$SEED" ]]; then
  cmd+=(--seed "$SEED")
fi

printf 'Repo root: %s\n' "$REPO_ROOT"
printf 'Underlying command: %s\n' "${cmd[*]}"
if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

cd "$REPO_ROOT"
ensure_workspace_builds
"${cmd[@]}"
