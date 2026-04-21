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
DNF_INSTALL_TIMEOUT_SECONDS="${DNF_INSTALL_TIMEOUT_SECONDS:-900}"
DOCKER_COMPOSE_VERSION="${DOCKER_COMPOSE_VERSION:-v2.29.7}"

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

require_command() {
  if ! has_command "$1"; then
    log_fail "Required command '$1' was not found in PATH."
    exit 1
  fi
}

detect_package_manager() {
  if has_command apt-get; then
    printf '%s\n' apt
  elif has_command dnf; then
    printf '%s\n' dnf
  elif has_command yum; then
    printf '%s\n' yum
  else
    return 1
  fi
}

dpkg_package_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "install ok installed"
}

apt_package_available() {
  local candidate
  candidate="$(apt-cache policy "$1" 2>/dev/null | awk '/Candidate:/ { print $2; exit }')"
  [ -n "$candidate" ] && [ "$candidate" != "(none)" ]
}

dnf_package_available() {
  dnf -q list --available "$1" >/dev/null 2>&1
}

yum_package_available() {
  yum -q list available "$1" >/dev/null 2>&1
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

run_package_command_with_timeout() {
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

  if [ "$status" -ne 0 ]; then
    log_fail "Package command failed; full output captured in $logfile"
    exit "$status"
  fi
}

docker_compose_works() {
  docker compose version >/dev/null 2>&1 ||
    (has_command docker-compose && docker-compose version >/dev/null 2>&1)
}

append_apt_docker_packages() {
  local -n target_packages=$1

  if has_command docker; then
    log_info "Docker command already exists; reusing the current Docker installation."
    if docker_compose_works; then
      return
    fi

    if apt_package_available docker-compose-plugin; then
      log_warn "Docker is installed but Compose is missing; scheduling docker-compose-plugin installation."
      target_packages+=(docker-compose-plugin)
    elif apt_package_available docker-compose-v2; then
      log_warn "Docker is installed but Compose is missing; scheduling docker-compose-v2 installation."
      target_packages+=(docker-compose-v2)
    elif apt_package_available docker-compose; then
      log_warn "Docker is installed but Compose is missing; scheduling docker-compose installation."
      target_packages+=(docker-compose)
    else
      log_warn "Docker is installed but Compose is unavailable from apt; installer will add a manual Compose plugin after packages finish."
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
  elif apt_package_available docker-compose-v2; then
    target_packages+=(docker-compose-v2)
  elif apt_package_available docker-compose; then
    target_packages+=(docker-compose)
  else
    log_warn "No Docker Compose package is available from apt; installer will add a manual Compose plugin after packages finish."
  fi
}

install_packages_apt() {
  local packages=()

  has_command update-ca-certificates || packages+=(ca-certificates)
  has_command git || packages+=(git)
  has_command curl || packages+=(curl)
  has_command jq || packages+=(jq)
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

node_major_version() {
  if ! has_command node; then
    return 1
  fi

  node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null
}

node_is_sufficient() {
  local major
  major="$(node_major_version 2>/dev/null || printf '0')"
  [ "$major" -ge 20 ]
}

install_node20_rhel() {
  if node_is_sufficient && has_command npm; then
    log_info "Node.js $(node --version) and npm are already available."
    return
  fi

  log_step "Ensuring Node.js 20 on Oracle/RHEL family"
  if dnf module list nodejs 2>/dev/null | grep -Eq 'nodejs[[:space:]].*20|nodejs:20'; then
    log_info "Enabling the distro Node.js 20 module"
    run_root dnf module reset -y nodejs || true
    run_root dnf module enable -y nodejs:20
    run_root dnf install -y nodejs npm
    return
  fi

  log_warn "Distro Node.js 20 module was not found; installing Node.js 20 from the supported NodeSource RPM repository."
  local setup_script
  setup_script="$(mktemp /tmp/tichuml-nodesource.XXXXXX.sh)"
  curl -fsSL https://rpm.nodesource.com/setup_20.x -o "$setup_script"
  run_root bash "$setup_script"
  rm -f "$setup_script"
  run_root dnf install -y nodejs
}

append_dnf_compose_package() {
  local -n target_packages=$1

  if docker_compose_works; then
    return
  fi

  if dnf_package_available docker-compose-plugin; then
    target_packages+=(docker-compose-plugin)
  elif dnf_package_available docker-compose; then
    target_packages+=(docker-compose)
  else
    log_warn "No Docker Compose package is available from dnf; installer will add a manual Compose plugin after packages finish."
  fi
}

install_packages_dnf() {
  local packages=()

  has_command update-ca-trust || packages+=(ca-certificates)
  has_command git || packages+=(git)
  has_command curl || packages+=(curl)
  has_command jq || packages+=(jq)
  has_command docker || packages+=(docker)
  append_dnf_compose_package packages
  if has_command python3; then
    python3 -m pip --version >/dev/null 2>&1 || packages+=(python3-pip)
    python3 -m venv --help >/dev/null 2>&1 || packages+=(python3-virtualenv)
  else
    packages+=(python3 python3-pip python3-virtualenv)
  fi

  if [ "${#packages[@]}" -eq 0 ]; then
    log_info "dnf dependencies already satisfied; skipping package installation."
  else
    log_info "dnf package plan: ${packages[*]}"
    local logfile
    logfile="$(mktemp /tmp/tichuml-dnf-install.XXXXXX.log)"
    run_package_command_with_timeout "$DNF_INSTALL_TIMEOUT_SECONDS" "$logfile" dnf install -y "${packages[@]}"
  fi

  install_node20_rhel
}

install_packages_yum() {
  local packages=()

  has_command update-ca-trust || packages+=(ca-certificates)
  has_command git || packages+=(git)
  has_command curl || packages+=(curl)
  has_command jq || packages+=(jq)
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
  local logfile
  logfile="$(mktemp /tmp/tichuml-yum-install.XXXXXX.log)"
  run_package_command_with_timeout "$DNF_INSTALL_TIMEOUT_SECONDS" "$logfile" yum install -y "${packages[@]}"
}

compose_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf '%s\n' x86_64 ;;
    aarch64|arm64) printf '%s\n' aarch64 ;;
    *)
      log_fail "Unsupported CPU architecture for manual Docker Compose install: $(uname -m)"
      exit 1
      ;;
  esac
}

install_compose_binary_manually() {
  if docker_compose_works; then
    return
  fi

  require_command curl
  local arch plugin_dir plugin_path temp_path url
  arch="$(compose_arch)"
  plugin_dir="/usr/local/lib/docker/cli-plugins"
  plugin_path="$plugin_dir/docker-compose"
  temp_path="$(mktemp /tmp/tichuml-docker-compose.XXXXXX)"
  url="https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${arch}"

  log_step "Installing Docker Compose manually"
  log_info "Downloading $url"
  curl -fL --retry 3 "$url" -o "$temp_path"
  run_root mkdir -p "$plugin_dir"
  run_root install -m 0755 "$temp_path" "$plugin_path"
  run_root ln -sf "$plugin_path" /usr/local/bin/docker-compose
  rm -f "$temp_path"

  if ! docker_compose_works; then
    log_fail "Manual Docker Compose installation completed but Compose is still not usable."
    exit 1
  fi
  log_ok "Docker Compose is available"
}

try_install_compose_package() {
  local package_manager="$1"
  if docker_compose_works; then
    return
  fi

  case "$package_manager" in
    apt)
      local apt_compose_packages=()
      apt_package_available docker-compose-plugin && apt_compose_packages+=(docker-compose-plugin)
      apt_package_available docker-compose-v2 && apt_compose_packages+=(docker-compose-v2)
      apt_package_available docker-compose && apt_compose_packages+=(docker-compose)
      if [ "${#apt_compose_packages[@]}" -gt 0 ]; then
        log_step "Installing Docker Compose package"
        run_apt_command install "$APT_INSTALL_TIMEOUT_SECONDS" install -y "${apt_compose_packages[0]}"
      fi
      ;;
    dnf)
      if dnf_package_available docker-compose-plugin; then
        run_root dnf install -y docker-compose-plugin
      elif dnf_package_available docker-compose; then
        run_root dnf install -y docker-compose
      fi
      ;;
    yum)
      if yum_package_available docker-compose-plugin; then
        run_root yum install -y docker-compose-plugin
      elif yum_package_available docker-compose; then
        run_root yum install -y docker-compose
      fi
      ;;
  esac
}

ensure_docker_compose_installed() {
  if docker_compose_works; then
    log_ok "Docker Compose is available"
    return
  fi

  local package_manager
  package_manager="$(detect_package_manager || true)"
  if [ -n "$package_manager" ]; then
    try_install_compose_package "$package_manager"
  fi

  install_compose_binary_manually
}

validate_system_dependencies() {
  local missing=()

  has_command update-ca-certificates || has_command update-ca-trust || missing+=(ca-certificates)
  has_command git || missing+=(git)
  has_command curl || missing+=(curl)
  has_command jq || missing+=(jq)
  has_command python3 || missing+=(python3)
  has_command node || missing+=(nodejs)
  has_command npm || missing+=(npm)
  has_command docker || missing+=(docker)

  if has_command docker && ! docker_compose_works; then
    missing+=(docker-compose)
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
    if has_command dpkg-query && { dpkg_package_installed containerd.io || dpkg_package_installed docker-ce-cli || dpkg_package_installed docker-ce || dpkg_package_installed docker-buildx-plugin; }; then
      log_warn "Recovery for Docker: the host has a partial Docker CE package family. Finish configuring Docker's apt repo and install docker-ce/docker-ce-cli/docker-compose-plugin, or remove the partial CE packages before rerunning."
    else
      log_warn "Recovery for Docker: rerun the installer after package repositories are reachable so it can install docker.io/docker on your distro."
    fi
  elif ! docker_compose_works; then
    log_warn "Recovery for Docker Compose: rerun the installer so it can install a distro Compose package or the manual CLI plugin."
  fi

  exit 1
}

ensure_system_dependencies() {
  log_step "Installing system dependencies"
  local package_manager
  package_manager="$(detect_package_manager)" || {
    printf 'Unsupported package manager. Expected apt-get, dnf, or yum.\n' >&2
    exit 1
  }

  log_info "Detected package manager: $package_manager"
  case "$package_manager" in
    apt) install_packages_apt ;;
    dnf) install_packages_dnf ;;
    yum) install_packages_yum ;;
  esac

  if has_command systemctl && has_command docker; then
    log_step "Ensuring Docker daemon is enabled"
    log_command systemctl enable --now docker
    run_root systemctl enable --now docker
  fi

  ensure_docker_compose_installed
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
    mkdir -p "$(dirname "$repo_root")"
    log_command git clone --branch "$DEFAULT_BRANCH" "$DEFAULT_REPO_URL" "$repo_root"
    git clone --branch "$DEFAULT_BRANCH" "$DEFAULT_REPO_URL" "$repo_root"
    return
  fi

  log_step "Force-refreshing repository state"
  log_warn "Local tracked and untracked changes in $repo_root will be overwritten for this backend installer workflow."
  git -C "$repo_root" remote get-url origin >/dev/null 2>&1 ||
    git -C "$repo_root" remote add origin "$DEFAULT_REPO_URL"
  log_command git -C "$repo_root" remote set-url origin "$DEFAULT_REPO_URL"
  git -C "$repo_root" remote set-url origin "$DEFAULT_REPO_URL"
  log_command git -C "$repo_root" fetch --prune origin "$DEFAULT_BRANCH"
  git -C "$repo_root" fetch --prune origin "$DEFAULT_BRANCH"
  log_command git -C "$repo_root" checkout "$DEFAULT_BRANCH"
  git -C "$repo_root" checkout "$DEFAULT_BRANCH" 2>/dev/null ||
    git -C "$repo_root" checkout -b "$DEFAULT_BRANCH" "origin/$DEFAULT_BRANCH"
  log_command git -C "$repo_root" reset --hard "origin/$DEFAULT_BRANCH"
  git -C "$repo_root" reset --hard "origin/$DEFAULT_BRANCH"
  log_command git -C "$repo_root" clean -fd
  git -C "$repo_root" clean -fd
}

main() {
  ensure_system_dependencies

  local repo_root
  repo_root="$(resolve_repo_root)"
  clone_or_update_repo "$repo_root"

  if [ "${BACKEND_INSTALL_REEXECED:-false}" != "true" ]; then
    log_step "Re-executing installer from force-synced repository"
    BACKEND_INSTALL_REEXECED=true \
      REPO_DIR="$repo_root" \
      REPO_URL="$DEFAULT_REPO_URL" \
      GIT_BRANCH="$DEFAULT_BRANCH" \
      exec bash "$repo_root/scripts/install_backend_linux.sh" "$@"
  fi

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
