#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  scripts/start-sim-controller.sh [sim-controller options]

Purpose:
  Starts the backend-hosted simulator controller on Linux.

Options:
  Forwards all options to scripts/sim-controller.sh start.

Examples:
  scripts/start-sim-controller.sh --provider local --games-per-batch 10 --worker-count 2

Environment:
  Auto-detects the repo root through scripts/sim-controller.sh.
EOF
  exit 0
fi

exec "$SCRIPT_DIR/sim-controller.sh" start "$@"
