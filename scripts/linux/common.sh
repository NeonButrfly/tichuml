#!/usr/bin/env bash
set -Eeuo pipefail

common_script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

common_resolve_repo_root() {
  local base_dir="$1"
  local current
  current="$(CDPATH= cd -- "$base_dir" && pwd)"
  while true; do
    if [ -f "$current/package.json" ]; then
      printf '%s\n' "$current"
      return 0
    fi

    if [ "$current" = "$(dirname -- "$current")" ]; then
      break
    fi
    current="$(dirname -- "$current")"
  done

  printf 'Could not resolve repo root from %s\n' "$base_dir" >&2
  return 1
}

common_require_repo_root() {
  local repo_root="$1"
  if [ ! -d "$repo_root" ]; then
    printf 'Resolved repo root does not exist: %s\n' "$repo_root" >&2
    return 1
  fi
  if [ ! -f "$repo_root/package.json" ]; then
    printf 'Resolved repo root is missing package.json: %s\n' "$repo_root" >&2
    return 1
  fi
}

common_require_repo_file() {
  local repo_root="$1"
  local relative_path="$2"
  local description="${3:-Required repo path}"
  local resolved="$repo_root/$relative_path"
  if [ ! -e "$resolved" ]; then
    printf '%s is missing: %s\n' "$description" "$resolved" >&2
    return 1
  fi
  printf '%s\n' "$resolved"
}
