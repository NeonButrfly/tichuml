#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="${REPO_DIR:-$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)}"
BRANCH="${BRANCH:-${GIT_BRANCH:-main}}"
REMOTE="${REMOTE:-origin}"
REPO_URL="${REPO_URL:-https://github.com/NeonButrfly/tichuml.git}"

live_remote_commit_from_url() {
  local remote_url="$1"
  local branch="$2"
  local output sha
  if ! output="$(git ls-remote "$remote_url" "refs/heads/$branch" 2>&1)"; then
    echo "[SYNC][FAIL] Unable to contact live remote refs/heads/$branch: $output" >&2
    return 1
  fi
  sha="$(printf '%s\n' "$output" | awk 'NF >= 2 {print $1; exit}')"
  if [ -z "$sha" ]; then
    echo "[SYNC][FAIL] Live remote refs/heads/$branch did not return a commit SHA." >&2
    return 1
  fi
  printf '%s\n' "$sha"
}

echo "[SYNC] Backend startup sync beginning..."
mkdir -p "$(dirname "$REPO_DIR")"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[SYNC] Repo missing; cloning fresh..."
  live_remote_commit="$(live_remote_commit_from_url "$REPO_URL" "$BRANCH")"
  echo "[SYNC] Live remote commit: $live_remote_commit"
  rm -rf "$REPO_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$REPO_DIR"
  local_after="$(git -C "$REPO_DIR" rev-parse HEAD)"
  live_remote_after="$(live_remote_commit_from_url "$REPO_URL" "$BRANCH")"
  if [ "$local_after" != "$live_remote_after" ]; then
    echo "[SYNC][FAIL] After clone, local HEAD $local_after does not match live remote $live_remote_after" >&2
    exit 1
  fi
  echo "[SYNC] Fresh clone complete"
  exit 0
fi

cd "$REPO_DIR"
git remote get-url "$REMOTE" >/dev/null 2>&1 || git remote add "$REMOTE" "$REPO_URL"
git remote set-url "$REMOTE" "$REPO_URL"
live_remote_commit="$(live_remote_commit_from_url "$REMOTE" "$BRANCH")"
echo "[SYNC] Live remote commit: $live_remote_commit"
git fetch --prune "$REMOTE" "+refs/heads/$BRANCH:refs/remotes/$REMOTE/$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "${REMOTE}/${BRANCH}"
git reset --hard "${REMOTE}/${BRANCH}"
git clean -fd
local_after="$(git rev-parse HEAD)"
live_remote_after="$(live_remote_commit_from_url "$REMOTE" "$BRANCH")"
if [ "$local_after" != "$live_remote_after" ]; then
  echo "[SYNC][FAIL] After force sync, local HEAD $local_after does not match live remote $live_remote_after" >&2
  exit 1
fi

echo "[SYNC] Repo now exactly matches live ${REMOTE}/${BRANCH} at $live_remote_after"
