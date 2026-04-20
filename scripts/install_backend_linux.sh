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

has_command() {
  command -v "$1" >/dev/null 2>&1
}

dpkg_package_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "install ok installed"
}

apt_package_available() {
  local candidate
  candidate="$(apt-cache policy "$1" 2>/dev/null | awk '/Candidate:/ { print $2; exit }')"
  [ -n "$candidate" ] && [ "$candidate" != "(none)" ]
}

append_apt_docker_packages() {
  local -n target_packages=$1

  if has_command docker; then
    if ! docker compose version >/dev/null 2>&1 && apt_package_available docker-compose-plugin; then
      target_packages+=(docker-compose-plugin)
    fi
    return
  fi

  if dpkg_package_installed containerd.io || dpkg_package_installed docker-ce-cli || dpkg_package_installed docker-ce; then
    if apt_package_available docker-ce && apt_package_available docker-ce-cli; then
      target_packages+=(docker-ce docker-ce-cli)
      apt_package_available docker-buildx-plugin && target_packages+=(docker-buildx-plugin)
      apt_package_available docker-compose-plugin && target_packages+=(docker-compose-plugin)
      return
    fi

    printf "%s\n" "[WARN] Docker CE packages appear partially installed (for example containerd.io), but apt cannot see docker-ce/docker-ce-cli candidates. Skipping distro docker.io install to avoid conflicts. Configure Docker's apt repository or install Docker manually, then rerun the script."
    return
  fi

  target_packages+=(docker.io)
  apt_package_available docker-compose-plugin && target_packages+=(docker-compose-plugin)
}

log_step() {
  printf '\n==> %s\n' "$1"
}

install_packages_apt() {
  local packages=()

  has_command git || packages+=(git)
  has_command curl || packages+=(curl)
  if has_command python3; then
    python3 -m venv --help >/dev/null 2>&1 || packages+=(python3-venv)
    python3 -m pip --version >/dev/null 2>&1 || packages+=(python3-pip)
  else
    packages+=(python3 python3-venv python3-pip)
  fi
  append_apt_docker_packages packages
  has_command node || packages+=(nodejs)

  if ! has_command npm; then
    if has_command node; then
      printf '[WARN] Node.js is already installed but npm is missing. Skipping distro npm install to avoid package conflicts; install a Node distribution that includes npm before continuing.\n'
    else
      packages+=(npm)
    fi
  fi

  if [ "${#packages[@]}" -eq 0 ]; then
    printf '[INFO] apt dependencies already satisfied; skipping package installation.\n'
    return
  fi

  run_root apt-get update
  run_root apt-get install -y "${packages[@]}"
}

install_packages_dnf() {
  local packages=()

  has_command git || packages+=(git)
  has_command curl || packages+=(curl)
  has_command docker || packages+=(docker docker-compose-plugin)
  if has_command python3; then
    python3 -m pip --version >/dev/null 2>&1 || packages+=(python3-pip)
    python3 -m venv --help >/dev/null 2>&1 || packages+=(python3-virtualenv)
  else
    packages+=(python3 python3-pip python3-virtualenv)
  fi
  has_command node || packages+=(nodejs)
  has_command npm || packages+=(npm)

  if [ "${#packages[@]}" -eq 0 ]; then
    printf '[INFO] dnf dependencies already satisfied; skipping package installation.\n'
    return
  fi

  run_root dnf install -y "${packages[@]}"
}

install_packages_yum() {
  local packages=()

  has_command git || packages+=(git)
  has_command curl || packages+=(curl)
  has_command docker || packages+=(docker)
  if has_command python3; then
    python3 -m pip --version >/dev/null 2>&1 || packages+=(python3-pip)
  else
    packages+=(python3 python3-pip)
  fi
  has_command node || packages+=(nodejs)
  has_command npm || packages+=(npm)

  if [ "${#packages[@]}" -eq 0 ]; then
    printf '[INFO] yum dependencies already satisfied; skipping package installation.\n'
    return
  fi

  run_root yum install -y "${packages[@]}"
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

  if has_command systemctl && has_command docker; then
    run_root systemctl enable --now docker
  fi
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

  export BACKEND_REPO_ROOT="$repo_root"
  # shellcheck disable=SC1090
  . "$repo_root/scripts/backend-linux-common.sh"

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
