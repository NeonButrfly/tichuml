#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="${REPO_DIR:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}"
BRANCH="${BRANCH:-${GIT_BRANCH:-main}}"
REMOTE="${REMOTE:-origin}"
REPO_URL="${REPO_URL:-https://github.com/NeonButrfly/tichuml.git}"

echo "[SYNC] Backend startup sync beginning..."
mkdir -p "$(dirname "$REPO_DIR")"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[SYNC] Repo missing; cloning fresh..."
  rm -rf "$REPO_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$REPO_DIR"
  echo "[SYNC] Fresh clone complete"
  exit 0
fi

cd "$REPO_DIR"
git remote get-url "$REMOTE" >/dev/null 2>&1 || git remote add "$REMOTE" "$REPO_URL"
git remote set-url "$REMOTE" "$REPO_URL"
git fetch --prune "$REMOTE" "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "${REMOTE}/${BRANCH}"
git reset --hard "${REMOTE}/${BRANCH}"
git clean -fd

echo "[SYNC] Repo now exactly matches ${REMOTE}/${BRANCH}"
