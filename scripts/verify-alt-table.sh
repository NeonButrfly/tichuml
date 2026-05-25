#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/verify-alt-table.sh [--url <url>] [--output <path>] [--metadata <path>] [--wait-timeout-ms <ms>] [--settle-ms <ms>] [--dev-port <port>] [--browser-path <path>] [--no-start-dev-web]
EOF
  exit 0
fi

start_dev_web="true"
for arg in "$@"; do
  if [[ "$arg" == "--no-start-dev-web" ]]; then
    start_dev_web="false"
    break
  fi
done

if [[ "$start_dev_web" == "true" ]]; then
  npm exec -- tsx scripts/browser-verify.ts --start-dev-web "$@"
else
  filtered_args=()
  for arg in "$@"; do
    if [[ "$arg" != "--no-start-dev-web" ]]; then
      filtered_args+=("$arg")
    fi
  done
  npm exec -- tsx scripts/browser-verify.ts "${filtered_args[@]}"
fi
