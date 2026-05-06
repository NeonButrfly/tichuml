#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/clear-db.sh --yes

Purpose:
  Clears application data from the existing Postgres database without dropping
  the database, container, schema, roles, extensions, or migration bookkeeping.

Options:
  --yes           Required destructive confirmation.
  --help, -help   Show this help text.

Environment:
  Uses DATABASE_URL from the current environment when explicitly set.
  Otherwise reads DATABASE_URL from .env at the repo root.

Examples:
  scripts/clear-db.sh --yes
  DATABASE_URL=postgres://user:pw@localhost:5432/tichu scripts/clear-db.sh --yes
EOF
}

mask_database_url() {
  local value="$1"
  if [ -z "$value" ]; then
    printf '\n'
    return
  fi
  printf '%s\n' "$value" | sed -E 's#//([^:/@]+):([^@/]+)@#//\1:***@#'
}

read_database_url_from_env_file() {
  local env_file="$1"
  require_file "$env_file" ".env file"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    if [[ "$line" == DATABASE_URL=* ]]; then
      local value="${line#DATABASE_URL=}"
      value="${value%\"}"
      value="${value#\"}"
      printf '%s\n' "$value"
      return 0
    fi
  done <"$env_file"

  printf 'DATABASE_URL is missing from %s\n' "$env_file" >&2
  return 1
}

is_migration_table() {
  local table_name="${1,,}"
  case "$table_name" in
    schema_migrations|__drizzle_migrations|drizzle_migrations|knex_migrations|knex_migrations_lock|flyway_schema_history|alembic_version|typeorm_metadata|django_migrations|sequelize_meta|goose_db_version)
      return 0
      ;;
  esac

  [[ "$table_name" == *migration* ]] || [[ "$table_name" == *schema_history* ]]
}

run_psql() {
  local database_url="$1"
  local sql="$2"
  psql "$database_url" --no-psqlrc -v ON_ERROR_STOP=1 -At -c "$sql"
}

CONFIRM=false
while (($#)); do
  case "$1" in
    --yes) CONFIRM=true ;;
    --help|-help) usage; exit 0 ;;
    *)
      printf 'Unknown clear-db option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$CONFIRM" != true ]; then
  printf 'Refusing to clear database data without --yes.\n' >&2
  exit 2
fi

require_command psql

REPO_ROOT="$(common_resolve_repo_root "$SCRIPT_DIR")"
common_require_repo_root "$REPO_ROOT"
ENV_FILE="$REPO_ROOT/.env"

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL_VALUE="$DATABASE_URL"
else
  DATABASE_URL_VALUE="$(read_database_url_from_env_file "$ENV_FILE")"
fi

TABLE_DISCOVERY_SQL=$'SELECT quote_ident(schemaname) || \'.\' || quote_ident(tablename)\nFROM pg_catalog.pg_tables\nWHERE schemaname NOT IN (\'pg_catalog\', \'information_schema\')\nORDER BY schemaname ASC, tablename ASC;'

mapfile -t discovered_tables < <(run_psql "$DATABASE_URL_VALUE" "$TABLE_DISCOVERY_SQL")

tables_to_clear=()
preserved_tables=()
for table in "${discovered_tables[@]}"; do
  [ -n "$table" ] || continue
  bare_name="${table##*.}"
  bare_name="${bare_name//\"/}"
  if is_migration_table "$bare_name"; then
    preserved_tables+=("$table")
  else
    tables_to_clear+=("$table")
  fi
done

printf '[INFO] Repo root: %s\n' "$REPO_ROOT"
printf '[INFO] Database URL: %s\n' "$(mask_database_url "$DATABASE_URL_VALUE")"
printf 'Tables to clear:\n'
if ((${#tables_to_clear[@]} == 0)); then
  printf '  (none)\n'
else
  for table in "${tables_to_clear[@]}"; do
    printf '  %s\n' "$table"
  done
fi

if ((${#preserved_tables[@]} > 0)); then
  printf 'Preserved migration tables:\n'
  for table in "${preserved_tables[@]}"; do
    printf '  %s\n' "$table"
  done
fi

if ((${#tables_to_clear[@]} == 0)); then
  printf '[OK] No application tables needed clearing.\n'
  exit 0
fi

truncate_sql="TRUNCATE TABLE "
for i in "${!tables_to_clear[@]}"; do
  if [ "$i" -gt 0 ]; then
    truncate_sql+=", "
  fi
  truncate_sql+="${tables_to_clear[$i]}"
done
truncate_sql+=" RESTART IDENTITY CASCADE;"

printf '[INFO] Clearing application tables with TRUNCATE ... RESTART IDENTITY CASCADE.\n'
run_psql "$DATABASE_URL_VALUE" "$truncate_sql" >/dev/null

printf 'Row counts after clear:\n'
non_zero_count=0
for table in "${tables_to_clear[@]}"; do
  count="$(run_psql "$DATABASE_URL_VALUE" "SELECT COUNT(*) FROM $table;")"
  printf '  %s: %s\n' "$table" "$count"
  if [ "$count" != "0" ]; then
    non_zero_count=1
  fi
done

if [ "$non_zero_count" -ne 0 ]; then
  printf '[FAIL] One or more cleared tables still contain rows.\n' >&2
  exit 1
fi

printf '[OK] Application data tables were cleared without touching schema or migration bookkeeping.\n'
