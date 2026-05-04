#!/usr/bin/env bash
set -Eeuo pipefail

print_help() {
  cat <<'EOF'
Usage:
  scripts/restart-backend.sh [options]

Restarts the backend using the canonical Linux backend workflow.

Options:
  --help, -h             Show this help text and exit.

Examples:
  scripts/restart-backend.sh
EOF
}

while (($#)); do
  case "$1" in
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

exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/linux/restart-backend.sh"
