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

metadata_file="$(node - "$REPO_ROOT" "$SESSION_NAME" "$GAME_ID_PREFIX" <<'NODE'
const fs = require('fs');
const path = require('path');
const repoRoot = process.argv[2];
const sessionName = process.argv[3];
const gameIdPrefix = process.argv[4];
const trainingRoot = path.join(repoRoot, 'training-runs');
if (!fs.existsSync(trainingRoot)) {
  process.exit(2);
}
const candidates = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.isFile() && entry.name === 'metadata.json') {
      const json = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (sessionName && json.session_name !== sessionName) continue;
      if (gameIdPrefix && json.game_id_prefix !== gameIdPrefix) continue;
      candidates.push({ path: full, startedAt: String(json.started_at || '') });
    }
  }
}
walk(trainingRoot);
if (candidates.length === 0) {
  process.exit(3);
}
candidates.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
process.stdout.write(candidates[0].path);
NODE
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
