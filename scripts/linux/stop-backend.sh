#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"
ensure_repo_root
ensure_runtime_dirs
kill_sim_processes
exec "$BACKEND_REPO_ROOT/scripts/stop_backend_linux.sh" "$@"
