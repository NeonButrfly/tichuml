#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

print_help() {
  cat <<'EOF'
Usage:
  scripts/status-training.sh [--session <name>] [--game-id-prefix <prefix>] [--tail-lines <count>]

Show the latest known training-run status for a Linux training-data session.
EOF
}

SESSION_NAME=""
GAME_ID_PREFIX=""
TAIL_LINES="20"

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
    --game-id-prefix)
      GAME_ID_PREFIX="${2:?missing value for --game-id-prefix}"
      shift 2
      ;;
    --tail-lines)
      TAIL_LINES="${2:?missing value for --tail-lines}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(common_resolve_repo_root "$SCRIPT_DIR")"
common_require_repo_root "$REPO_ROOT"
TRAINING_DATA_SCRIPT="$(common_require_repo_file "$REPO_ROOT" "scripts/training-data.ts" "Training data entrypoint")"

metadata_file="$(
  (
    cd "$REPO_ROOT" &&
      locate_args=(tsx "$TRAINING_DATA_SCRIPT" locate-run --repo-root "$REPO_ROOT")
      if [[ -n "$SESSION_NAME" ]]; then
        locate_args+=(--session-name "$SESSION_NAME")
      fi
      if [[ -n "$GAME_ID_PREFIX" ]]; then
        locate_args+=(--game-id-prefix "$GAME_ID_PREFIX")
      fi
      npx "${locate_args[@]}"
  ) 2>/dev/null || true
)"

if [[ -z "$metadata_file" ]]; then
  echo "No training metadata matched the requested session or game-id prefix." >&2
  exit 1
fi

password_file="$(node - "$metadata_file" <<'NODE'
const fs = require('fs');
const path = require('path');
const metadata = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(path.join(path.dirname(metadata.stop_file), 'pg-password.txt'));
NODE
)"

cd "$REPO_ROOT"
args=(tsx "$TRAINING_DATA_SCRIPT" status-run --metadata-file "$metadata_file" --tail-lines "$TAIL_LINES")
if [[ -f "$password_file" ]]; then
  args+=(--pg-password-file "$password_file")
fi
npx "${args[@]}"
