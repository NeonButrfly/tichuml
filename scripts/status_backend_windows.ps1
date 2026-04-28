param(
  [string]$RepoRoot = "C:\tichu\tichuml"
)

$env:BACKEND_REPO_ROOT = $RepoRoot
. "$PSScriptRoot\backend-windows-common.ps1"
Show-BackendStatus
