#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Usage: scripts/linux/tail-backend-logs.sh [--help|-h]

Follows the canonical backend log file from the Linux backend workflow.
EOF
  exit 0
fi

ensure_runtime_dirs
touch "$BACKEND_LOG_FILE"
tail -n "${TAIL_LINES:-200}" -f "$BACKEND_LOG_FILE"
