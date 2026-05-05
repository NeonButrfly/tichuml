#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Usage:
  scripts/bootstrap.sh [options]

Purpose:
  Bootstraps the Linux backend environment by forwarding to scripts/install-backend.sh.

Options:
  --help, -h   Show this help text.
  Any other option is forwarded to scripts/install-backend.sh.

Examples:
  scripts/bootstrap.sh

Environment:
  Auto-detects repo root through install-backend.sh.
EOF
  exit 0
fi
exec "$SCRIPT_DIR/install-backend.sh" "$@"
