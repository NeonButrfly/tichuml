#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/tichuml"
BRANCH="${BRANCH:-main}"
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
git fetch --all --prune
git reset --hard "${REMOTE}/${BRANCH}"
git clean -fd

echo "[SYNC] Repo now exactly matches ${REMOTE}/${BRANCH}"
