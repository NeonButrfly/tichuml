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

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

log_step "Checking prerequisites"
require_command node
require_command npm
require_command docker

if [ ! -f .env ]; then
  log_step "Creating .env from .env.example"
  cp .env.example .env
fi

set -a
. ./.env
set +a

log_step "Installing workspace dependencies"
npm install

COMPOSE_ARGS="-f infra/docker/docker-compose.yml --env-file .env"

log_step "Starting Postgres via Docker"
docker compose $COMPOSE_ARGS up -d postgres

POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-tichuml}

log_step "Waiting for Postgres readiness"
attempt=0
while [ "$attempt" -lt 60 ]; do
  if docker compose $COMPOSE_ARGS exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
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
