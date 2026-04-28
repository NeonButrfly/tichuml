#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/backend-common.sh"
ensure_runtime_dirs
latest="$(find "$SIM_LOG_DIR" -type f -name '*.log' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
if [ -z "${latest:-}" ]; then
  log_warn "No simulator logs found in $SIM_LOG_DIR yet."
  exit 1
fi
tail -n "${TAIL_LINES:-200}" -f "$latest"
