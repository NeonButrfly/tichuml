#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT_REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEFAULT_REPO_URL="${REPO_URL:-https://github.com/NeonButrfly/tichuml.git}"
DEFAULT_BRANCH="${GIT_BRANCH:-main}"
DEFAULT_REPO_DIR="${REPO_DIR:-$HOME/tichuml}"
APT_LOCK_WAIT_SECONDS="${APT_LOCK_WAIT_SECONDS:-180}"
APT_UPDATE_TIMEOUT_SECONDS="${APT_UPDATE_TIMEOUT_SECONDS:-300}"
APT_INSTALL_TIMEOUT_SECONDS="${APT_INSTALL_TIMEOUT_SECONDS:-900}"
APT_PROGRESS_INTERVAL_SECONDS="${APT_PROGRESS_INTERVAL_SECONDS:-5}"

APT_LOCK_FILES=(
  /var/lib/dpkg/lock-frontend
  /var/lib/dpkg/lock
  /var/lib/apt/lists/lock
  /var/cache/apt/archives/lock
)

log_step() {
  printf '\n==> %s\n' "$1"
}

log_info() {
  printf '[INFO] %s\n' "$1"
}

log_ok() {
  printf '[OK] %s\n' "$1"
}

log_warn() {
  printf '[WARN] %s\n' "$1"
}

log_fail() {
  printf '[FAIL] %s\n' "$1" >&2
}

log_command() {
  printf '[INFO] Running:'
  printf ' %q' "$@"
  printf '\n'
}

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

package_manager_process_snapshot() {
  if has_command pgrep; then
    pgrep -a -f 'apt|dpkg|unattended-upgrade' 2>/dev/null || true
  else
    ps -ef 2>/dev/null | grep -E 'apt|dpkg|unattended-upgrade' | grep -v grep || true
  fi
}

apt_lock_busy() {
  if has_command fuser; then
    local lock_file
    for lock_file in "${APT_LOCK_FILES[@]}"; do
      if [ -e "$lock_file" ] && fuser "$lock_file" >/dev/null 2>&1; then
        return 0
      fi
    done
  fi

  [ -n "$(package_manager_process_snapshot)" ]
}

wait_for_apt_locks() {
  if ! apt_lock_busy; then
    return
  fi

  log_warn "apt/dpkg lock contention detected before running apt commands."
  log_warn "Waiting up to ${APT_LOCK_WAIT_SECONDS}s for unattended-upgrades or another package-manager session to finish."

  local waited=0
  while apt_lock_busy; do
    if [ "$waited" -ge "$APT_LOCK_WAIT_SECONDS" ]; then
      local snapshot
      snapshot="$(package_manager_process_snapshot)"
      log_fail "Timed out waiting ${APT_LOCK_WAIT_SECONDS}s for apt/dpkg locks to clear."
      if [ -n "$snapshot" ]; then
        printf '%s\n' "$snapshot" | sed 's/^/[INFO] Active package-manager process: /'
      fi
      cat >&2 <<'EOF'
[FAIL] Recovery steps:
- If unattended upgrades are in progress, wait for them to complete and rerun the installer.
- To inspect the active package-manager processes:
  ps -ef | grep -E 'apt|dpkg|unattended'
- If you intentionally need to stop unattended upgrades first:
  sudo systemctl stop unattended-upgrades
EOF
      exit 1
    fi

    local snapshot
    snapshot="$(package_manager_process_snapshot)"
    log_info "Waiting for apt/dpkg locks to clear (${waited}/${APT_LOCK_WAIT_SECONDS}s)"
    if [ -n "$snapshot" ]; then
      printf '%s\n' "$snapshot" | sed 's/^/[INFO] Active package-manager process: /'
    fi
    sleep "$APT_PROGRESS_INTERVAL_SECONDS"
    waited=$((waited + APT_PROGRESS_INTERVAL_SECONDS))
  done

  log_ok "apt/dpkg locks cleared after ${waited}s"
}

explain_apt_failure() {
  local phase="$1"
  local status="$2"
  local logfile="$3"

  if [ "$status" -eq 124 ]; then
    if [ "$phase" = "update" ]; then
      log_fail "apt-get update timed out after ${APT_UPDATE_TIMEOUT_SECONDS}s. This usually means a network, mirror, or apt transport stall."
      cat >&2 <<'EOF'
[FAIL] Recovery steps:
- Retry the update manually to see the live mirror/network error:
  sudo apt-get update
- Verify DNS/network reachability to your Ubuntu mirrors before rerunning the installer.
EOF
    else
      log_fail "apt-get install timed out after ${APT_INSTALL_TIMEOUT_SECONDS}s. This usually means a network stall, a hung dpkg state, or another interactive package-manager blocker."
    fi
  elif grep -Eq 'Could not get lock|Unable to acquire the dpkg frontend lock|Waiting for cache lock|is another process using it' "$logfile"; then
    log_fail "apt-get ${phase} was blocked by apt/dpkg lock contention."
    cat >&2 <<'EOF'
[FAIL] Recovery steps:
- Wait for unattended upgrades or any other apt/dpkg session to finish.
- Inspect active package-manager processes:
  ps -ef | grep -E 'apt|dpkg|unattended'
EOF
  elif grep -Eq 'Unable to locate package|Package .* has no installation candidate|Package .* is not available' "$logfile"; then
    log_fail "apt-get ${phase} failed because one or more packages are unavailable from the configured apt repositories."
    cat >&2 <<'EOF'
[FAIL] Recovery steps:
- Run `sudo apt-get update` manually and confirm your Ubuntu package sources are healthy.
- If Docker CE packages were expected, configure Docker's apt repository before rerunning.
EOF
  elif grep -Eq 'Conflicts:|held broken packages|unmet dependencies|but it is not installable|Breaks:' "$logfile"; then
    log_fail "apt-get ${phase} failed because of package conflicts or broken dependencies."
    cat >&2 <<'EOF'
[FAIL] Recovery steps:
- Inspect the conflicting packages in the apt output below.
- If Docker CE packages are partially present, finish configuring Docker's repo or remove the partial Docker CE packages before rerunning.
- If Node.js is installed without npm from another source, install npm from that same source instead of forcing Ubuntu's npm package.
EOF
  elif grep -Eq "Temporary failure resolving|Could not resolve|Failed to fetch|Connection failed|Could not connect|Hash Sum mismatch|Clearsigned file isn't valid" "$logfile"; then
    log_fail "apt-get ${phase} failed because apt could not download packages cleanly."
    cat >&2 <<'EOF'
[FAIL] Recovery steps:
- Check DNS and outbound network access from the host.
- Re-run `sudo apt-get update` manually and confirm mirror access before rerunning the installer.
EOF
  else
    log_fail "apt-get ${phase} failed with an unexpected error."
  fi

  log_warn "Review the captured apt log at $logfile for the full output."
}

run_root_stream_with_timeout() {
  local timeout_seconds="$1"
  local logfile="$2"
  shift 2

  local -a command_prefix=()
  if [ "$(id -u)" -eq 0 ]; then
    command_prefix=("$@")
  else
    command_prefix=(sudo "$@")
  fi

  log_command "${command_prefix[@]}"

  set +e
  if has_command timeout; then
    timeout --foreground "${timeout_seconds}s" "${command_prefix[@]}" 2>&1 | tee "$logfile"
  else
    "${command_prefix[@]}" 2>&1 | tee "$logfile"
  fi
  local status=${PIPESTATUS[0]}
  set -e
  return "$status"
}

run_apt_command() {
  local phase="$1"
  local timeout_seconds="$2"
  shift 2

  wait_for_apt_locks

  local logfile
  logfile="$(mktemp "/tmp/tichuml-apt-${phase}.XXXXXX.log")"
  log_info "Capturing apt ${phase} output in $logfile"

  local status=0
  run_root_stream_with_timeout "$timeout_seconds" "$logfile" apt-get "$@" || status=$?
  if [ "$status" -ne 0 ]; then
    explain_apt_failure "$phase" "$status" "$logfile"
    exit 1
  fi

  log_ok "apt-get ${phase} completed successfully"
}

append_apt_docker_packages() {
  local -n target_packages=$1

  if has_command docker; then
    log_info "Docker command already exists; reusing the current Docker installation."
    if ! docker compose version >/dev/null 2>&1 && apt_package_available docker-compose-plugin; then
      log_warn "Docker is installed but 'docker compose' is missing; scheduling docker-compose-plugin installation."
      target_packages+=(docker-compose-plugin)
    elif ! docker compose version >/dev/null 2>&1; then
      log_warn "Docker is installed but 'docker compose' is unavailable and docker-compose-plugin is not visible in apt. Install Compose v2 manually before starting the backend."
    fi
    return
  fi

  if dpkg_package_installed containerd.io || dpkg_package_installed docker-ce-cli || dpkg_package_installed docker-ce || dpkg_package_installed docker-buildx-plugin; then
    log_warn "Detected a partial Docker CE package-family state without a usable docker command."
    if apt_package_available docker-ce && apt_package_available docker-ce-cli; then
      log_info "Docker CE apt packages are available; scheduling docker-ce/docker-ce-cli installation."
      target_packages+=(docker-ce docker-ce-cli)
      apt_package_available docker-buildx-plugin && target_packages+=(docker-buildx-plugin)
      apt_package_available docker-compose-plugin && target_packages+=(docker-compose-plugin)
      return
    fi

    log_warn "Docker CE packages appear partially installed (for example containerd.io), but apt cannot see docker-ce/docker-ce-cli candidates. Skipping distro docker.io install to avoid conflicts."
    log_warn "Recovery: configure Docker's apt repository and install the Docker CE family, or remove the partial Docker CE packages before rerunning."
    return
  fi

  log_info "No Docker installation detected; scheduling Ubuntu docker.io installation."
  target_packages+=(docker.io)
  if apt_package_available docker-compose-plugin; then
    target_packages+=(docker-compose-plugin)
  else
    log_warn "docker-compose-plugin is not available from the configured apt sources. The backend scripts require 'docker compose'; install Compose v2 manually before running start/status."
  fi
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

  if has_command node; then
    log_info "Node.js command already exists; reusing the current Node installation."
  else
    packages+=(nodejs)
  fi

  if ! has_command npm; then
    if has_command node; then
      log_warn "Node.js is already installed but npm is missing. Skipping Ubuntu's npm package to avoid package conflicts."
      log_warn "Recovery: install npm from the same Node distribution (or reinstall Node with npm included) before continuing."
    else
      packages+=(npm)
    fi
  fi

  if [ "${#packages[@]}" -eq 0 ]; then
    log_info "apt dependencies already satisfied; skipping package installation."
    return
  fi

  log_info "apt package plan: ${packages[*]}"

  log_step "Running apt-get update"
  run_apt_command update "$APT_UPDATE_TIMEOUT_SECONDS" update

  log_step "Running apt-get install"
  run_apt_command install "$APT_INSTALL_TIMEOUT_SECONDS" install -y "${packages[@]}"
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
    log_info "dnf dependencies already satisfied; skipping package installation."
    return
  fi

  log_info "dnf package plan: ${packages[*]}"
  log_command dnf install -y "${packages[@]}"
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
    log_info "yum dependencies already satisfied; skipping package installation."
    return
  fi

  log_info "yum package plan: ${packages[*]}"
  log_command yum install -y "${packages[@]}"
  run_root yum install -y "${packages[@]}"
}

validate_system_dependencies() {
  local missing=()

  has_command git || missing+=(git)
  has_command curl || missing+=(curl)
  has_command python3 || missing+=(python3)
  has_command node || missing+=(nodejs)
  has_command npm || missing+=(npm)
  has_command docker || missing+=(docker)

  if has_command docker && ! docker compose version >/dev/null 2>&1; then
    missing+=(docker-compose-plugin)
  fi

  if [ "${#missing[@]}" -eq 0 ]; then
    log_ok "Linux host prerequisites are installed"
    return
  fi

  log_fail "Linux host prerequisites are still missing after the install step: ${missing[*]}"

  if has_command node && ! has_command npm; then
    log_warn "Recovery for missing npm: install npm from the same Node distribution already on the host, or reinstall Node with npm included."
  fi

  if ! has_command docker; then
    if dpkg_package_installed containerd.io || dpkg_package_installed docker-ce-cli || dpkg_package_installed docker-ce || dpkg_package_installed docker-buildx-plugin; then
      log_warn "Recovery for Docker: the host has a partial Docker CE package family. Finish configuring Docker's apt repo and install docker-ce/docker-ce-cli/docker-compose-plugin, or remove the partial CE packages before rerunning."
    else
      log_warn "Recovery for Docker: install Ubuntu's docker.io and docker-compose-plugin packages, then rerun the installer."
    fi
  elif ! docker compose version >/dev/null 2>&1; then
    log_warn "Recovery for Docker Compose: install docker-compose-plugin (or another Compose v2-capable Docker build) so 'docker compose' works."
  fi

  exit 1
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
    log_step "Ensuring Docker daemon is enabled"
    log_command systemctl enable --now docker
    run_root systemctl enable --now docker
  fi

  validate_system_dependencies
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
    log_command git clone --branch "$DEFAULT_BRANCH" "$DEFAULT_REPO_URL" "$repo_root"
    git clone --branch "$DEFAULT_BRANCH" "$DEFAULT_REPO_URL" "$repo_root"
    return
  fi

  log_step "Refreshing repository state"
  if [ -n "$(git -C "$repo_root" status --porcelain)" ]; then
    printf '[WARN] Repo is dirty at %s; skipping git pull to avoid overwriting local changes.\n' "$repo_root"
    return
  fi

  log_command git -C "$repo_root" fetch origin "$DEFAULT_BRANCH"
  git -C "$repo_root" fetch origin "$DEFAULT_BRANCH"
  log_command git -C "$repo_root" checkout "$DEFAULT_BRANCH"
  git -C "$repo_root" checkout "$DEFAULT_BRANCH"
  log_command git -C "$repo_root" pull --ff-only origin "$DEFAULT_BRANCH"
  git -C "$repo_root" pull --ff-only origin "$DEFAULT_BRANCH"
}

main() {
  ensure_system_dependencies

  local repo_root
  repo_root="$(resolve_repo_root)"
  clone_or_update_repo "$repo_root"

  export BACKEND_REPO_ROOT="$repo_root"
  log_step "Loading shared Linux backend helper"
  # shellcheck disable=SC1090
  . "$repo_root/scripts/backend-linux-common.sh"

  prepare_runtime_stack
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
