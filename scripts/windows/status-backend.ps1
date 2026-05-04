param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\windows\status-backend.ps1 [options]

Prints backend runtime status for the canonical Windows backend host flow.

Options:
  -RepoRoot <path>
  -Help, -?
"@ | Write-Host
  exit 0
}

$env:BACKEND_REPO_ROOT = $RepoRoot
. "$PSScriptRoot\backend-common.ps1"
Show-BackendStatus
