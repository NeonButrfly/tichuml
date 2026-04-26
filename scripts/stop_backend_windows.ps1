. "$PSScriptRoot\backend-windows-common.ps1"
Write-Step "Stopping Windows backend host flow"
Stop-BackendProcess
Write-Ok "Stop requested."
