#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

print_help() {
  cat <<'EOF'
Usage:
  scripts/check-scripts.sh [options]

Purpose:
  Validates canonical Windows/Linux script naming, parity, executability, and help behavior.

Options:
  --skip-help  Skip invoking each script's help path.
  --help, -h   Show this help text.

Examples:
  scripts/check-scripts.sh

Environment:
  Auto-detects repo root from the script location. Does not require running from repo root.
EOF
}

SKIP_HELP="false"
while (($#)); do
  case "$1" in
    --skip-help) SKIP_HELP="true"; shift ;;
    --help|-h) print_help; exit 0 ;;
    *) echo "Unknown check-scripts option: $1" >&2; print_help >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

failures=()
fail() { failures+=("$1"); }

for dir in scripts/linux scripts/windows; do
  if [[ -d "$dir" ]]; then
    fail "$dir must not contain canonical scripts."
  fi
done

mapfile -t ps_files < <(find scripts -maxdepth 1 -type f -name '*.ps1' -printf '%f\n' | sort)
mapfile -t sh_files < <(find scripts -maxdepth 1 -type f -name '*.sh' -printf '%f\n' | sort)

is_kebab() {
  [[ "$1" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]
}

declare -A ps_bases=()
declare -A sh_bases=()
for file in "${ps_files[@]}"; do
  base="${file%.ps1}"
  is_kebab "$base" || fail "Non-kebab script filename: $file"
  ps_bases["$base"]=1
done
for file in "${sh_files[@]}"; do
  base="${file%.sh}"
  is_kebab "$base" || fail "Non-kebab script filename: $file"
  sh_bases["$base"]=1
  [[ -x "scripts/$file" ]] || fail "Linux script is not executable: scripts/$file"
  head -n 1 "scripts/$file" | grep -qx '#!/usr/bin/env bash' || fail "Missing bash shebang: scripts/$file"
  head -n 5 "scripts/$file" | grep -Eq 'set -E?euo pipefail' || fail "Missing set -euo pipefail: scripts/$file"
done

linux_only=' force-sync runtime-action sim-controller tail-backend-logs tail-sim-logs verify-full-sim-backend '
windows_only=' unblock-scripts '
for base in "${!ps_bases[@]}"; do
  if [[ -z "${sh_bases[$base]+x}" && "$windows_only" != *" $base "* ]]; then
    fail "Missing Linux pair for scripts/$base.ps1"
  fi
done
for base in "${!sh_bases[@]}"; do
  if [[ -z "${ps_bases[$base]+x}" && "$linux_only" != *" $base "* ]]; then
    fail "Missing Windows pair for scripts/$base.sh"
  fi
done

[[ -f scripts/start-training.ps1 ]] || fail "Missing scripts/start-training.ps1"
[[ -f scripts/start-training.sh ]] || fail "Missing scripts/start-training.sh"

while IFS= read -r ref; do
  [[ -f "$ref" ]] || fail "package.json references missing script: $ref"
done < <(grep -Eo 'scripts[/\\][A-Za-z0-9_.\\/-]+\.(ps1|sh)' package.json | sed 's#\\#/#g' | sort -u)

if [[ "$SKIP_HELP" != "true" ]]; then
  for file in "${sh_files[@]}"; do
    if ! bash "scripts/$file" --help >/tmp/tichuml-script-help.out 2>/tmp/tichuml-script-help.err; then
      fail "Help failed for scripts/$file: $(head -n 1 /tmp/tichuml-script-help.err)"
    fi
  done
fi

if ((${#failures[@]})); then
  printf '[FAIL] Script sanity check failed:\n' >&2
  printf ' - %s\n' "${failures[@]}" >&2
  exit 1
fi

printf '[OK] Script naming, parity, executability, package references, and shell help checks passed.\n'
