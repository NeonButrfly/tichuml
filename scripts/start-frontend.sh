#!/usr/bin/env bash
set -Eeuo pipefail

script_dir() {
  CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

repo_root() {
  CDPATH= cd -- "$(script_dir)/.." && pwd
}

print_help() {
  cat <<'EOF'
Usage:
  scripts/start-frontend.sh [options]

Starts the web frontend with the repo's existing Vite dev command.

Options:
  --host <host>          Override Vite host.
  --port <port>          Override Vite port.
  --backend-url <url>    Set VITE_BACKEND_BASE_URL for the frontend process.
  --dry-run              Print the resolved command without starting Vite.
  --help, -h             Show this help text and exit.

Examples:
  scripts/start-frontend.sh
  scripts/start-frontend.sh --backend-url http://127.0.0.1:4310
  scripts/start-frontend.sh --host 0.0.0.0 --port 5173
EOF
}

HOST_VALUE=""
PORT_VALUE=""
BACKEND_URL_VALUE=""
DRY_RUN="false"

while (($#)); do
  case "$1" in
    --host)
      HOST_VALUE="${2:?missing value for --host}"
      shift 2
      ;;
    --port)
      PORT_VALUE="${2:?missing value for --port}"
      shift 2
      ;;
    --backend-url)
      BACKEND_URL_VALUE="${2:?missing value for --backend-url}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help >&2
      exit 2
      ;;
  esac
done

ROOT="$(repo_root)"
CMD=(npm run dev -w @tichuml/web)
VITE_ARGS=()
if [[ -n "$HOST_VALUE" ]]; then
  VITE_ARGS+=(--host "$HOST_VALUE")
fi
if [[ -n "$PORT_VALUE" ]]; then
  VITE_ARGS+=(--port "$PORT_VALUE")
fi
if ((${#VITE_ARGS[@]} > 0)); then
  CMD+=(-- "${VITE_ARGS[@]}")
fi

echo "Repo root: $ROOT"
echo "Frontend command: ${CMD[*]}"
if [[ -n "$BACKEND_URL_VALUE" ]]; then
  echo "Frontend backend URL: $BACKEND_URL_VALUE"
fi
if [[ -n "$HOST_VALUE" || -n "$PORT_VALUE" ]]; then
  echo "Frontend URL hint: http://${HOST_VALUE:-localhost}:${PORT_VALUE:-5173}"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  exit 0
fi

cd "$ROOT"
if [[ -n "$BACKEND_URL_VALUE" ]]; then
  VITE_BACKEND_BASE_URL="$BACKEND_URL_VALUE" "${CMD[@]}"
else
  "${CMD[@]}"
fi
