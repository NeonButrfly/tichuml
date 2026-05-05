#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Usage:
  scripts/validate-training-run.sh [telemetry validation options]

Purpose:
  Forwards to npm run telemetry:validate-run from the detected repo root.

Options:
  --help, -h   Show this help text.
  Any remaining options are forwarded to telemetry:validate-run.

Examples:
  scripts/validate-training-run.sh -- --help

Environment:
  Auto-detects repo root from the script location. Requires npm dependencies.
EOF
  exit 0
fi

REPO_ROOT="$(resolve_repo_root "$SCRIPT_DIR")"
cd_repo_root "$REPO_ROOT"
require_command npm

exec npm run telemetry:validate-run -- "$@"
