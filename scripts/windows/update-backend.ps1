. "$PSScriptRoot\backend-common.ps1"
Write-Step "Updating Windows backend repository"
Ensure-RuntimeDirs
Ensure-EnvFile
Import-DotEnv
Force-RefreshRepo
Write-Ok "Repository force-refreshed from origin."
