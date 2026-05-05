#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

print_help() {
  cat <<'EOF'
Usage:
  scripts/linux/stop-training-data.sh --session <name> [--force] [--timeout-seconds <count>]

Request a clean stop for a Linux tmux-backed training-data session.
EOF
}

SESSION_NAME=""
TIMEOUT_SECONDS="60"
FORCE="false"

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
    --timeout-seconds)
      TIMEOUT_SECONDS="${2:?missing value for --timeout-seconds}"
      shift 2
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SESSION_NAME" ]]; then
  echo "--session is required." >&2
  exit 1
fi

REPO_ROOT="$(common_resolve_repo_root "$SCRIPT_DIR")"
common_require_repo_root "$REPO_ROOT"

metadata_file="$(node - "$REPO_ROOT" "$SESSION_NAME" <<'NODE'
const fs = require('fs');
const path = require('path');
const repoRoot = process.argv[2];
const sessionName = process.argv[3];
const trainingRoot = path.join(repoRoot, 'training-runs');
if (!fs.existsSync(trainingRoot)) process.exit(2);
let found = null;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.isFile() && entry.name === 'metadata.json') {
      const json = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (json.session_name === sessionName) {
        found = full;
      }
    }
  }
}
walk(trainingRoot);
if (!found) process.exit(3);
process.stdout.write(found);
NODE
)"

if [[ -z "$metadata_file" ]]; then
  echo "No training metadata found for session: $SESSION_NAME" >&2
  exit 1
fi

readarray -t metadata_values < <(node - "$metadata_file" <<'NODE'
const fs = require('fs');
const path = require('path');
const metadata = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(metadata.stop_file || '');
console.log(metadata.pid_file || '');
console.log(path.join(path.dirname(metadata.stop_file || ''), 'pg-password.txt'));
NODE
)
stop_file="${metadata_values[0]}"
pid_file="${metadata_values[1]}"
password_file="${metadata_values[2]}"

mkdir -p "$(dirname "$stop_file")"
date -Iseconds >"$stop_file"

deadline=$((SECONDS + TIMEOUT_SECONDS))
while [[ -f "$pid_file" && $SECONDS -lt $deadline ]]; do
  pid_text="$(tr -d '[:space:]' <"$pid_file" || true)"
  if [[ -z "$pid_text" ]] || ! kill -0 "$pid_text" 2>/dev/null; then
    break
  fi
  sleep 2
done

if [[ "$FORCE" == "true" && -f "$pid_file" ]]; then
  pid_text="$(tr -d '[:space:]' <"$pid_file" || true)"
  if [[ -n "$pid_text" ]] && kill -0 "$pid_text" 2>/dev/null; then
    if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      tmux kill-session -t "$SESSION_NAME" || true
    fi
    kill -TERM "$pid_text" 2>/dev/null || true
  fi
fi

echo "Stop requested for $SESSION_NAME"
