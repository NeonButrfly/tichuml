#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CORE_SCRIPT="$SCRIPT_DIR/verify-scripts-core.mjs"
ARTIFACT_DIR="$REPO_ROOT/.runtime/verify-scripts"

print_help() {
  cat <<'EOF'
Usage:
  scripts/verify-scripts.sh [options]

Purpose:
  Validates canonical script layout, stale references, shared helper wiring,
  Bash syntax, PowerShell parsing when available, executable bits, and help
  entrypoints for the top-level scripts surface.

Options:
  --skip-help  Skip invoking each script's help path.
  --help, -h   Show this help text.

Examples:
  scripts/verify-scripts.sh
  scripts/verify-scripts.sh --skip-help

Output:
  Prints a readable validation report and writes helper inventory artifacts to
  .runtime/verify-scripts/.
EOF
}

SKIP_HELP="false"
while (($#)); do
  case "$1" in
    --skip-help) SKIP_HELP="true"; shift ;;
    --help|-h) print_help; exit 0 ;;
    *) echo "Unknown verify-scripts option: $1" >&2; print_help >&2; exit 2 ;;
  esac
done

cd "$REPO_ROOT"

failures=()
fail() { failures+=("$1"); }
warn() { printf '[WARN] %s\n' "$1"; }

mkdir -p "$ARTIFACT_DIR"

if [[ ! -f "$CORE_SCRIPT" ]]; then
  fail "Missing scripts/verify-scripts-core.mjs"
else
  if ! node "$CORE_SCRIPT" --repo-root "$REPO_ROOT"; then
    fail "verify-scripts core checks failed"
  fi
fi

mapfile -t ps_files < <(find scripts -maxdepth 1 -type f -name '*.ps1' -printf '%f\n' | sort)
mapfile -t sh_files < <(find scripts -maxdepth 1 -type f -name '*.sh' -printf '%f\n' | sort)

for file in "${sh_files[@]}"; do
  if ! bash -n "scripts/$file"; then
    fail "bash -n failed for scripts/$file"
  fi
done

git_mode_for_file() {
  local relative_path="$1"
  git ls-files --stage -- "$relative_path" | awk 'NR==1 { print $1 }'
}

for file in "${sh_files[@]}"; do
  [[ -x "scripts/$file" ]] || fail "Linux script is not executable: scripts/$file"
  mode="$(git_mode_for_file "scripts/$file")"
  if [[ -n "${mode:-}" && "$mode" != "100755" ]]; then
    fail "Git executable bit is not set for scripts/$file (mode: $mode)"
  fi
done

parser_shell=""
if command -v pwsh >/dev/null 2>&1; then
  parser_shell="pwsh"
elif command -v powershell >/dev/null 2>&1; then
  parser_shell="powershell"
else
  warn "PowerShell parser unavailable; skipping .ps1 parse checks from Bash."
fi

if [[ -n "$parser_shell" ]]; then
  for file in "${ps_files[@]}"; do
    ps_file_path="$REPO_ROOT/scripts/$file"
    if command -v cygpath >/dev/null 2>&1; then
      ps_file_path="$(cygpath -w "$ps_file_path")"
    fi
    if ! "$parser_shell" -NoProfile -Command "[System.Management.Automation.Language.Token[]]\$tokens = \$null; [System.Management.Automation.Language.ParseError[]]\$parseErrors = \$null; [void][System.Management.Automation.Language.Parser]::ParseFile('$ps_file_path', [ref]\$tokens, [ref]\$parseErrors); if (\$parseErrors.Count -gt 0) { \$parseErrors | ForEach-Object { Write-Error \$_.Message }; exit 1 }"; then
      fail "PowerShell parser failed for scripts/$file"
    fi
  done
fi

if [[ "$SKIP_HELP" != "true" ]]; then
  for file in "${sh_files[@]}"; do
    if ! bash "scripts/$file" --help >"$ARTIFACT_DIR/help-$file.out" 2>"$ARTIFACT_DIR/help-$file.err"; then
      fail "Help failed for scripts/$file"
    fi
  done

  if [[ -n "$parser_shell" ]]; then
    for file in "${ps_files[@]}"; do
      ps_file_path="$REPO_ROOT/scripts/$file"
      if command -v cygpath >/dev/null 2>&1; then
        ps_file_path="$(cygpath -w "$ps_file_path")"
      fi
      if ! "$parser_shell" -NoProfile -ExecutionPolicy Bypass -File "$ps_file_path" -Help >"$ARTIFACT_DIR/help-$file.out" 2>"$ARTIFACT_DIR/help-$file.err"; then
        fail "Help failed for scripts/$file"
      fi
    done
  fi
fi

if ((${#failures[@]})); then
  printf '[FAIL] Script verification failed:\n' >&2
  printf ' - %s\n' "${failures[@]}" >&2
  exit 1
fi

printf '[OK] Script layout, helper wiring, syntax, executable bits, and help checks passed.\n'
