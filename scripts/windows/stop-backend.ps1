param(
  [string]$RepoRoot = "C:\tichu\tichuml",
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\windows\stop-backend.ps1 [options]

Stops the canonical Windows backend host flow.

Options:
  -RepoRoot <path>
  -Help, -?
"@ | Write-Host
  exit 0
}

$env:BACKEND_REPO_ROOT = $RepoRoot
. "$PSScriptRoot\backend-common.ps1"
Write-Step "Stopping Windows backend host flow"
Stop-BackendProcess
Write-Ok "Stop requested."
