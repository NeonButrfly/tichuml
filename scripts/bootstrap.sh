#!/bin/sh

set -eu

DEV_MODE=0
if [ "${1-}" = "--dev" ]; then
  DEV_MODE=1
fi

log_step() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Required command '%s' was not found in PATH.\n" "$1" >&2
    exit 1
  fi
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  if command -v open >/dev/null 2>&1; then
    open -a Docker >/dev/null 2>&1 || true
  elif command -v systemctl >/dev/null 2>&1; then
    systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    service docker start >/dev/null 2>&1 || true
  fi

  attempt=0
  while [ "$attempt" -lt 60 ]; do
    if docker info >/dev/null 2>&1; then
      return
    fi

    attempt=$((attempt + 1))
    sleep 2
  done

  printf 'Docker did not become ready within the timeout window.\n' >&2
  exit 1
}

docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi

  printf "Docker is running, but neither 'docker compose' nor 'docker-compose' is available.\n" >&2
  exit 1
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

log_step "Checking prerequisites"
require_command node
require_command npm
require_command docker
require_command python3

if [ ! -f .env ]; then
  log_step "Creating .env from .env.example"
  cp .env.example .env
fi

eval "$(node scripts/runtime-config.mjs export-shell .env)"

log_step "Ensuring Docker is running"
ensure_docker_running

log_step "Installing workspace dependencies"
npm install

COMPOSE_ARGS="--env-file .env"

log_step "Starting Postgres via Docker"
docker_compose $COMPOSE_ARGS up -d postgres

POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-tichuml}

log_step "Waiting for Postgres readiness"
attempt=0
while [ "$attempt" -lt 60 ]; do
  if docker_compose $COMPOSE_ARGS exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi

  attempt=$((attempt + 1))
  sleep 2
done

if [ "$attempt" -ge 60 ]; then
  printf 'Postgres did not report ready within the timeout window.\n' >&2
  exit 1
fi

log_step "Running database migrations"
npm run db:migrate

log_step "Preparing Python virtual environment"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi

VENV_PYTHON=.venv/bin/python
if [ ! -x "$VENV_PYTHON" ]; then
  printf 'Expected Python virtual environment interpreter at %s.\n' "$VENV_PYTHON" >&2
  exit 1
fi

log_step "Installing ML dependencies"
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r ml/requirements.txt

if [ "$DEV_MODE" -eq 1 ]; then
  log_step "Starting backend server in watch mode"
  exec npm run dev:server
fi

log_step "Building shared packages required by the server"
npm run build:shared
npm run build:engine
npm run build:telemetry
npm run build:ai
npm run build:server

log_step "Starting backend server"
exec npm run start:server
