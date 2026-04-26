. "$PSScriptRoot\backend-windows-common.ps1"
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
