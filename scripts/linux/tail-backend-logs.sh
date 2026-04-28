#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"
ensure_runtime_dirs
touch "$BACKEND_LOG_FILE"
tail -n "${TAIL_LINES:-200}" -f "$BACKEND_LOG_FILE"
