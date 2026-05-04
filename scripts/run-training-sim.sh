#!/usr/bin/env bash
set -Eeuo pipefail

script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

# shellcheck disable=SC1091
. "$(script_dir)/linux/common.sh"

repo_root="$(common_resolve_repo_root "$(script_dir)")"
common_require_repo_root "$repo_root"
target="$(common_require_repo_file "$repo_root" "scripts/linux/run-training-sim.sh" "Training simulator loop launcher")"
cd "$repo_root"
exec bash "$target" "$@"
