param(
  [Alias("?")]
  [switch]$Help
)

if ($Help) {
@"
Usage:
  scripts\windows\restart-backend.ps1 [options]

Restarts the canonical Windows backend host flow.

Options:
  -Help, -?
"@ | Write-Host
  exit 0
}

. "$PSScriptRoot\backend-common.ps1"
Write-Step "Restarting Windows backend host flow"
Stop-BackendProcess
Start-Sleep -Seconds 2
Prepare-RuntimeStack
Start-Postgres
Wait-Postgres
Build-BackendArtifacts
Run-Migrations
Start-BackendProcess
Show-BackendStatus
