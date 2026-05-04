#!/usr/bin/env bash
set -Eeuo pipefail

script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

repo_root() {
  CDPATH= cd -- "$(script_dir)/.." && pwd
}

print_help() {
  cat <<'EOF'
Usage:
  scripts/backend-logs.sh [options]

Shows the backend runtime log file.

Options:
  --follow               Follow the backend log stream.
  --dry-run              Print the resolved log path without reading it.
  --help, -h             Show this help text and exit.
EOF
}

FOLLOW="false"
DRY_RUN="false"

while (($#)); do
  case "$1" in
    --follow)
      FOLLOW="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help >&2
      exit 2
      ;;
  esac
done

ROOT="$(repo_root)"
LOG_FILE="$ROOT/.runtime/backend.log"
echo "Backend log file: $LOG_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

if [[ "$FOLLOW" == "true" ]]; then
  exec tail -f "$LOG_FILE"
fi

cat "$LOG_FILE"
