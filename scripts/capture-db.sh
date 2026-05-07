#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

SCRIPT_VERSION="1.0.0"
DEFAULT_OUT_REL=".runtime/db-captures"
DEFAULT_SPLIT_SIZE="500m"

usage() {
  cat <<'EOF'
Usage:
  scripts/capture-db.sh [options]

Purpose:
  Creates a restoreable PostgreSQL capture plus redacted diagnostics that can
  be inspected without restoring the dump first.

Options:
  --label <name>           Optional label added to the capture folder/archive name.
  --out <path>             Output directory. Default: .runtime/db-captures
  --split <size>           7z volume size. Default: 500m
  --no-split               Disable 7z volume splitting.
  --remove-staging         Remove the staging directory after a successful archive.
  --reason <text>          Optional short capture reason written into run-notes.txt.
  --notes <text>           Optional freeform notes written into run-notes.txt.
  --help, -h, -help       Show this help text.

Environment:
  Uses DATABASE_URL from the current environment when explicitly set.
  Otherwise reads DATABASE_URL from the repo-root .env file.

Outputs:
  Creates a timestamped staging directory and 7z archive under the output
  directory. The staging directory contains db.dump, db-schema.sql, redacted
  environment metadata, DB summaries, git metadata, restore instructions,
  checksums, and a machine-readable manifest.

Examples:
  scripts/capture-db.sh
  scripts/capture-db.sh --label post-fix-clean-run --reason "after write amplification repair"
  scripts/capture-db.sh --out /tmp/tichu-captures --split 250m
  DATABASE_URL=postgres://user:pw@localhost:5432/tichu scripts/capture-db.sh --no-split
EOF
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

sanitize_label() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/[^A-Za-z0-9]+/-/g; s/^-+//; s/-+$//')"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  printf '%s\n' "$value"
}

resolve_dir_abs() {
  local target="$1"
  mkdir -p "$target"
  (
    cd "$target"
    pwd
  )
}

build_command_line() {
  local text="scripts/capture-db.sh"
  local arg escaped
  for arg in "${ORIGINAL_ARGS[@]}"; do
    printf -v escaped '%q' "$arg"
    text+=" $escaped"
  done
  printf '%s\n' "$text"
}

find_sevenz_command() {
  if command -v 7z >/dev/null 2>&1; then
    printf '7z\n'
    return 0
  fi
  if command -v 7zz >/dev/null 2>&1; then
    printf '7zz\n'
    return 0
  fi
  return 1
}

write_stage_checksums() {
  local staging_dir="$1"
  local checksum_file="$staging_dir/checksums.txt"
  {
    printf '# Staging files before archive\n'
    while IFS= read -r -d '' file; do
      sha256sum "$file"
    done < <(find "$staging_dir" -maxdepth 1 -type f ! -name 'checksums.txt' -print0 | sort -z)
  } >"$checksum_file"
}

append_archive_checksums() {
  local checksum_file="$1"
  shift
  local archive_file
  {
    printf '\n# Archive files after archive creation\n'
    for archive_file in "$@"; do
      sha256sum "$archive_file"
    done
  } >>"$checksum_file"
}

append_manifest_checksum() {
  local checksum_file="$1"
  local manifest_file="$2"
  {
    printf '\n# Manifest after archive finalization\n'
    sha256sum "$manifest_file"
  } >>"$checksum_file"
}

LABEL=""
OUT_DIR="$DEFAULT_OUT_REL"
SPLIT_SIZE="$DEFAULT_SPLIT_SIZE"
REMOVE_STAGING="false"
NO_SPLIT="false"
REASON=""
NOTES=""
ORIGINAL_ARGS=("$@")

while (($#)); do
  case "$1" in
    --label) LABEL="${2:?missing value for --label}"; shift 2 ;;
    --out) OUT_DIR="${2:?missing value for --out}"; shift 2 ;;
    --split) SPLIT_SIZE="${2:?missing value for --split}"; shift 2 ;;
    --no-split) NO_SPLIT="true"; shift ;;
    --remove-staging) REMOVE_STAGING="true"; shift ;;
    --reason) REASON="${2:?missing value for --reason}"; shift 2 ;;
    --notes) NOTES="${2:?missing value for --notes}"; shift 2 ;;
    --help|-h|-help) usage; exit 0 ;;
    *)
      printf 'Unknown capture-db option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command node
require_command pg_dump
require_command psql
require_command sha256sum
SEVENZ_COMMAND="$(find_sevenz_command)" || {
  printf 'Missing required command: 7z or 7zz\n' >&2
  exit 1
}

REPO_ROOT="$(common_resolve_repo_root "$SCRIPT_DIR")"
common_require_repo_root "$REPO_ROOT"
ENV_FILE="$REPO_ROOT/.env"

if [ -n "${DATABASE_URL:-}" ]; then
  DATABASE_URL_VALUE="$DATABASE_URL"
else
  DATABASE_URL_VALUE="$(read_database_url_from_env_file "$ENV_FILE")"
fi

if [[ "$OUT_DIR" = /* ]] || [[ "$OUT_DIR" =~ ^[A-Za-z]:[\\/].* ]]; then
  OUT_TARGET="$OUT_DIR"
else
  OUT_TARGET="$REPO_ROOT/$OUT_DIR"
fi
OUT_DIR_ABS="$(resolve_dir_abs "$OUT_TARGET")"
LOCAL_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
CREATED_LOCAL="$(date +%Y-%m-%dT%H:%M:%S%z)"
CREATED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SAFE_LABEL="$(sanitize_label "$LABEL")"

CAPTURE_BASENAME="tichuml-db-capture-$LOCAL_TIMESTAMP"
if [ -n "$SAFE_LABEL" ]; then
  CAPTURE_BASENAME="$CAPTURE_BASENAME-$SAFE_LABEL"
fi

STAGING_DIR="$OUT_DIR_ABS/$CAPTURE_BASENAME"
ARCHIVE_PATH="$OUT_DIR_ABS/$CAPTURE_BASENAME.7z"
MANIFEST_SPLIT_SIZE="$SPLIT_SIZE"
if [ "$NO_SPLIT" = "true" ]; then
  MANIFEST_SPLIT_SIZE="none"
fi

if [ -e "$STAGING_DIR" ]; then
  printf 'Capture staging directory already exists: %s\n' "$STAGING_DIR" >&2
  exit 1
fi
if [ -e "$ARCHIVE_PATH" ] || compgen -G "$ARCHIVE_PATH.*" >/dev/null; then
  printf 'Capture archive path already exists: %s\n' "$ARCHIVE_PATH" >&2
  exit 1
fi

mkdir -p "$STAGING_DIR"

COMMAND_LINE="$(build_command_line)"
CORE_SCRIPT="$SCRIPT_DIR/capture-db-core.mjs"
require_file "$CORE_SCRIPT" "capture-db core script"

printf '[INFO] Repo root: %s\n' "$REPO_ROOT"
printf '[INFO] Capture output directory: %s\n' "$OUT_DIR_ABS"
printf '[INFO] Capture staging directory: %s\n' "$STAGING_DIR"
printf '[INFO] Archive path: %s\n' "$ARCHIVE_PATH"
printf '[INFO] Snapshot note: active writers may make the capture non-quiescent.\n'

pg_dump "$DATABASE_URL_VALUE" -Fc -f "$STAGING_DIR/db.dump"
pg_dump "$DATABASE_URL_VALUE" --schema-only -f "$STAGING_DIR/db-schema.sql"

node "$CORE_SCRIPT" collect \
  --repo-root "$REPO_ROOT" \
  --staging-dir "$STAGING_DIR" \
  --database-url "$DATABASE_URL_VALUE" \
  --created-utc "$CREATED_UTC" \
  --created-local "$CREATED_LOCAL" \
  --capture-id "$CAPTURE_BASENAME" \
  --label "$LABEL" \
  --reason "$REASON" \
  --notes "$NOTES" \
  --split-size "$MANIFEST_SPLIT_SIZE" \
  --command-line "$COMMAND_LINE" \
  --script-version "$SCRIPT_VERSION" \
  --archive-base-name "$CAPTURE_BASENAME.7z" \
  --archive-path "$ARCHIVE_PATH"

write_stage_checksums "$STAGING_DIR"

pushd "$OUT_DIR_ABS" >/dev/null
if [ "$NO_SPLIT" = "true" ]; then
  "$SEVENZ_COMMAND" a -t7z "$ARCHIVE_PATH" "$CAPTURE_BASENAME" >/dev/null
else
  "$SEVENZ_COMMAND" a -t7z "-v$SPLIT_SIZE" "$ARCHIVE_PATH" "$CAPTURE_BASENAME" >/dev/null
fi
popd >/dev/null

archive_files=()
if [ "$NO_SPLIT" = "true" ]; then
  archive_files=("$ARCHIVE_PATH")
else
  while IFS= read -r -d '' file; do
    archive_files+=("$file")
  done < <(find "$OUT_DIR_ABS" -maxdepth 1 -type f -name "$CAPTURE_BASENAME.7z.*" -print0 | sort -z)
fi

if ((${#archive_files[@]} == 0)); then
  printf 'Archive creation succeeded but no archive files were found for %s\n' "$ARCHIVE_PATH" >&2
  exit 1
fi

finalize_args=(
  "$CORE_SCRIPT"
  "finalize-manifest"
  "--manifest"
  "$STAGING_DIR/manifest.json"
  "--split-size"
  "$MANIFEST_SPLIT_SIZE"
)
for archive_file in "${archive_files[@]}"; do
  finalize_args+=("--archive-file" "$archive_file")
done
node "${finalize_args[@]}"

append_archive_checksums "$STAGING_DIR/checksums.txt" "${archive_files[@]}"
append_manifest_checksum "$STAGING_DIR/checksums.txt" "$STAGING_DIR/manifest.json"

if [ "$REMOVE_STAGING" = "true" ]; then
  rm -rf "$STAGING_DIR"
fi

printf '\nCapture summary\n'
printf -- '---------------\n'
printf 'Capture id: %s\n' "$CAPTURE_BASENAME"
printf 'Label: %s\n' "${LABEL:-<none>}"
printf 'Staging directory: %s\n' "$STAGING_DIR"
printf 'Archive files:\n'
for archive_file in "${archive_files[@]}"; do
  printf '  %s\n' "$archive_file"
done
printf 'Split size: %s\n' "$MANIFEST_SPLIT_SIZE"
printf 'Remove staging: %s\n' "$REMOVE_STAGING"
