. "$PSScriptRoot\backend-windows-common.ps1"
Write-Step "Starting Windows backend host flow"
Ensure-RuntimeDirs
Ensure-EnvFile
Import-DotEnv
if ($env:AUTO_UPDATE_ON_START -eq "true") { Force-RefreshRepo; . "$PSScriptRoot\backend-windows-common.ps1"; Import-DotEnv }
Prepare-RuntimeStack
Start-Postgres
Wait-Postgres
Build-BackendArtifacts
Run-Migrations
Start-BackendProcess
Show-BackendStatus
