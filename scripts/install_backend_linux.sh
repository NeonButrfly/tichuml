#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT_REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEFAULT_REPO_URL="${REPO_URL:-https://github.com/NeonButrfly/tichuml.git}"
DEFAULT_BRANCH="${GIT_BRANCH:-main}"
DEFAULT_REPO_DIR="${REPO_DIR:-$HOME/tichuml}"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

log_step() {
  printf '\n==> %s\n' "$1"
}

install_packages_apt() {
  run_root apt-get update
  run_root apt-get install -y \
    git \
    curl \
    docker.io \
    docker-compose-plugin \
    python3 \
    python3-venv \
    python3-pip \
    nodejs \
    npm
}

install_packages_dnf() {
  run_root dnf install -y \
    git \
    curl \
    docker \
    docker-compose-plugin \
    python3 \
    python3-pip \
    python3-virtualenv \
    nodejs \
    npm
}

install_packages_yum() {
  run_root yum install -y \
    git \
    curl \
    docker \
    python3 \
    python3-pip \
    nodejs \
    npm
}

ensure_system_dependencies() {
  log_step "Installing system dependencies"
  if command -v apt-get >/dev/null 2>&1; then
    install_packages_apt
  elif command -v dnf >/dev/null 2>&1; then
    install_packages_dnf
  elif command -v yum >/dev/null 2>&1; then
    install_packages_yum
  else
    printf 'Unsupported package manager. Install git, curl, docker, python3, python3-venv, python3-pip, nodejs, and npm manually.\n' >&2
    exit 1
  fi

  run_root systemctl enable --now docker
}

resolve_repo_root() {
  if [ -d "$SCRIPT_REPO_ROOT/.git" ]; then
    printf '%s\n' "$SCRIPT_REPO_ROOT"
    return
  fi

  if [ -d "$DEFAULT_REPO_DIR/.git" ]; then
    printf '%s\n' "$DEFAULT_REPO_DIR"
    return
  fi

  printf '%s\n' "$DEFAULT_REPO_DIR"
}

clone_or_update_repo() {
  local repo_root="$1"

  if [ ! -d "$repo_root/.git" ]; then
    log_step "Cloning repository into $repo_root"
    git clone --branch "$DEFAULT_BRANCH" "$DEFAULT_REPO_URL" "$repo_root"
    return
  fi

  log_step "Refreshing repository state"
  if [ -n "$(git -C "$repo_root" status --porcelain)" ]; then
    printf '[WARN] Repo is dirty at %s; skipping git pull to avoid overwriting local changes.\n' "$repo_root"
    return
  fi

  git -C "$repo_root" fetch origin "$DEFAULT_BRANCH"
  git -C "$repo_root" checkout "$DEFAULT_BRANCH"
  git -C "$repo_root" pull --ff-only origin "$DEFAULT_BRANCH"
}

main() {
  ensure_system_dependencies

  local repo_root
  repo_root="$(resolve_repo_root)"
  clone_or_update_repo "$repo_root"

  # shellcheck disable=SC1090
  BACKEND_REPO_ROOT="$repo_root" . "$repo_root/scripts/backend-linux-common.sh"

  log_step "Preparing repository runtime stack"
  prepare_runtime_stack

  log_step "Building backend and simulator runtime artifacts"
  build_runtime_artifacts

  cat <<EOF

[OK] Linux backend host bootstrap completed.
Backend URLs:
- $BACKEND_PUBLIC_URL
- $BACKEND_LOCAL_URL

Next commands:
- Start/update backend: $repo_root/scripts/start_backend_linux.sh
- Check backend status: $repo_root/scripts/status_backend_linux.sh
- Run simulation: (cd $repo_root && npm run sim -- --games 1000 --provider server_heuristic)
- Export training rows: (cd $repo_root && npm run ml:export -- --phase play)
- Train LightGBM: (cd $repo_root && npm run ml:train -- --phase play)
- Evaluate providers: (cd $repo_root && npm run ml:evaluate -- --games 500 --ns-provider lightgbm_model --ew-provider server_heuristic)
EOF
}

main "$@"
