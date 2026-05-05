#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  scripts/status-sim-controller.sh [sim-controller options]

Purpose:
  Prints backend-hosted simulator controller status on Linux.

Options:
  Forwards all options to scripts/sim-controller.sh status.

Examples:
  scripts/status-sim-controller.sh --api-url http://127.0.0.1:4310

Environment:
  Auto-detects the repo root through scripts/sim-controller.sh.
EOF
  exit 0
fi

exec "$SCRIPT_DIR/sim-controller.sh" status "$@"
