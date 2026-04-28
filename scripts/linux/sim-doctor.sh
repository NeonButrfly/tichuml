#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"
ensure_repo_root
ensure_runtime_dirs
assert_postgres_identity
wait_for_postgres
(cd "$BACKEND_REPO_ROOT" && npm run sim:doctor -- "$@")
(cd "$BACKEND_REPO_ROOT" && npm run telemetry:truth -- --backend-url "$BACKEND_BASE_URL" --require-rows)
