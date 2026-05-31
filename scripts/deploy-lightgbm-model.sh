#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REMOTE_USER="kay"
REMOTE_HOST="192.168.50.36"
SSH_PORT="22"
REMOTE_REPO_ROOT="/opt/tichuml"
REMOTE_BACKEND_URL="http://127.0.0.1:4310"
ALLOW_MANIFEST_MISMATCH=false
RESTART_BACKEND=true
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: scripts/deploy-lightgbm-model.sh [options]

Deploys the tracked promoted LightGBM model artifact from the local validated
workspace to the canonical Linux backend host, verifies hashes, and restarts
the backend so the live runtime reloads the new model.

Options:
  --repo-root <path>
  --remote-user <user>
  --remote-host <host>
  --ssh-port <port>
  --remote-repo-root <path>
  --remote-backend-url <url>
  --no-restart
  --allow-manifest-mismatch
  --dry-run
  --help|-h
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    --remote-user) REMOTE_USER="$2"; shift 2 ;;
    --remote-host) REMOTE_HOST="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --remote-repo-root) REMOTE_REPO_ROOT="$2"; shift 2 ;;
    --remote-backend-url) REMOTE_BACKEND_URL="$2"; shift 2 ;;
    --no-restart) RESTART_BACKEND=false; shift ;;
    --allow-manifest-mismatch) ALLOW_MANIFEST_MISMATCH=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

MODEL_PATH="$REPO_ROOT/ml/model_registry/lightgbm_action_model.txt"
META_PATH="$REPO_ROOT/ml/model_registry/lightgbm_action_model.meta.json"
MANIFEST_PATH="$REPO_ROOT/ml/model_registry/promoted-model.json"
SSH_TARGET="$REMOTE_USER@$REMOTE_HOST"
REMOTE_MODEL_PATH="$REMOTE_REPO_ROOT/ml/model_registry/lightgbm_action_model.txt"
REMOTE_META_PATH="$REMOTE_REPO_ROOT/ml/model_registry/lightgbm_action_model.meta.json"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

for path in "$MODEL_PATH" "$META_PATH" "$MANIFEST_PATH"; do
  [ -f "$path" ] || {
    echo "Required file is missing: $path" >&2
    exit 1
  }
done

LOCAL_MODEL_HASH="$(sha256_file "$MODEL_PATH")"
LOCAL_META_HASH="$(sha256_file "$META_PATH")"
MANIFEST_MODEL_HASH="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(manifest.model.model_sha256 || ""));' "$MANIFEST_PATH")"
MANIFEST_META_HASH="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(manifest.model.meta_sha256 || ""));' "$MANIFEST_PATH")"
MANIFEST_VERSION="$(node -e 'const fs=require("node:fs"); const manifest=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(manifest.model.model_version || ""));' "$MANIFEST_PATH")"

if [ "$ALLOW_MANIFEST_MISMATCH" != true ]; then
  [ "$MANIFEST_MODEL_HASH" = "$LOCAL_MODEL_HASH" ] || {
    echo "Local model hash does not match promoted-model.json. Update the tracked manifest or use --allow-manifest-mismatch intentionally." >&2
    exit 1
  }
  [ "$MANIFEST_META_HASH" = "$LOCAL_META_HASH" ] || {
    echo "Local model metadata hash does not match promoted-model.json. Update the tracked manifest or use --allow-manifest-mismatch intentionally." >&2
    exit 1
  }
fi

if [ "$DRY_RUN" = true ]; then
  printf 'Resolved repo root: %s\n' "$REPO_ROOT"
  printf 'SSH target: %s:%s\n' "$SSH_TARGET" "$SSH_PORT"
  printf 'Remote repo root: %s\n' "$REMOTE_REPO_ROOT"
  printf 'Remote backend URL: %s\n' "$REMOTE_BACKEND_URL"
  printf 'Restart backend: %s\n' "$RESTART_BACKEND"
  printf 'Manifest version: %s\n' "$MANIFEST_VERSION"
  printf 'Local model hash: %s\n' "$LOCAL_MODEL_HASH"
  printf 'Local meta hash: %s\n' "$LOCAL_META_HASH"
  printf 'Remote model path: %s\n' "$REMOTE_MODEL_PATH"
  printf 'Remote meta path: %s\n' "$REMOTE_META_PATH"
  exit 0
fi

require_command ssh
require_command scp
require_command node
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "Need either sha256sum or shasum locally." >&2
  exit 1
fi

printf '\n==> Inspecting local promoted model artifact\n'
printf '[INFO] Manifest version: %s\n' "$MANIFEST_VERSION"
printf '[INFO] Local model hash: %s\n' "$LOCAL_MODEL_HASH"
printf '[INFO] Local meta hash: %s\n' "$LOCAL_META_HASH"

printf '\n==> Backing up the current remote model artifact\n'
BACKUP_DIR="$(
  ssh -p "$SSH_PORT" "$SSH_TARGET" "
    set -euo pipefail
    cd $REMOTE_REPO_ROOT
    backup_dir=\".runtime/model-backups/\$(date -u +%Y%m%dT%H%M%SZ)-deploy-lightgbm\"
    mkdir -p \"\$backup_dir\"
    if [ -f \"ml/model_registry/lightgbm_action_model.txt\" ]; then cp \"ml/model_registry/lightgbm_action_model.txt\" \"\$backup_dir/\"; fi
    if [ -f \"ml/model_registry/lightgbm_action_model.meta.json\" ]; then cp \"ml/model_registry/lightgbm_action_model.meta.json\" \"\$backup_dir/\"; fi
    printf '%s\n' \"\$backup_dir\"
  "
)"
printf '[INFO] Remote backup dir: %s\n' "$BACKUP_DIR"

printf '\n==> Copying the promoted model artifact to Linux\n'
scp -P "$SSH_PORT" "$MODEL_PATH" "$META_PATH" "$SSH_TARGET:$REMOTE_REPO_ROOT/ml/model_registry/"

printf '\n==> Verifying remote model hashes\n'
VERIFY_OUTPUT="$(
  ssh -p "$SSH_PORT" "$SSH_TARGET" "
    set -euo pipefail
    cd $REMOTE_REPO_ROOT
    sha256sum \"ml/model_registry/lightgbm_action_model.txt\" \"ml/model_registry/lightgbm_action_model.meta.json\"
  "
)"
printf '%s\n' "$VERIFY_OUTPUT"
printf '%s\n' "$VERIFY_OUTPUT" | grep -q "$LOCAL_MODEL_HASH" || {
  echo "Remote model hash did not match the local promoted artifact." >&2
  exit 1
}
printf '%s\n' "$VERIFY_OUTPUT" | grep -q "$LOCAL_META_HASH" || {
  echo "Remote metadata hash did not match the local promoted artifact." >&2
  exit 1
}
printf '[OK] Remote model hashes match the promoted artifact\n'

if [ "$RESTART_BACKEND" = true ]; then
  printf '\n==> Restarting the Linux backend\n'
  ssh -p "$SSH_PORT" "$SSH_TARGET" "
    set -euo pipefail
    cd $REMOTE_REPO_ROOT
    ./scripts/restart-backend.sh
  "
else
  printf '[WARN] Skipping backend restart; the live process may still serve the older loaded model until restarted.\n'
fi

printf '\n==> Checking remote backend health\n'
ssh -p "$SSH_PORT" "$SSH_TARGET" "
  set -euo pipefail
  for _ in \$(seq 1 60); do
    if curl -fsS $REMOTE_BACKEND_URL/health >/dev/null 2>&1; then
      curl -fsS $REMOTE_BACKEND_URL/health
      exit 0
    fi
    sleep 2
  done
  echo 'Timed out waiting for backend health at $REMOTE_BACKEND_URL/health' >&2
  exit 1
"
