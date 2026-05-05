#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/linux/common.sh"

REPO_ROOT="$(resolve_repo_root "$SCRIPT_DIR")"
cd_repo_root "$REPO_ROOT"
require_command npm

exec npm run telemetry:validate-run -- "$@"
