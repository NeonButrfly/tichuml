param(
  [string]$RepoRoot = "C:\tichu\tichuml"
)

$env:BACKEND_REPO_ROOT = $RepoRoot
. "$PSScriptRoot\backend-common.ps1"
Write-Step "Stopping Windows backend host flow"
Stop-BackendProcess
Write-Ok "Stop requested."
