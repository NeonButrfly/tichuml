. "$PSScriptRoot\backend-windows-common.ps1"
Write-Step "Installing Windows backend host flow"
if (-not (Test-CommandExists "git")) { throw "Git is required. Install Git for Windows, then rerun." }
if (-not (Test-CommandExists "node")) { throw "Node.js is required. Install Node.js LTS, then rerun." }
if (-not (Test-CommandExists "npm")) { throw "npm is required. Install Node.js LTS, then rerun." }
if (-not (Test-CommandExists "docker")) { throw "Docker Desktop is required. Install/start Docker Desktop, then rerun." }
Ensure-RuntimeDirs
Ensure-EnvFile
Import-DotEnv
Force-RefreshRepo
. "$PSScriptRoot\backend-windows-common.ps1"
Prepare-RuntimeStack
Start-Postgres
Wait-Postgres
Build-BackendArtifacts
Run-Migrations
Start-BackendProcess
Show-BackendStatus
Write-Ok "Windows backend host bootstrap completed."
Write-Host "Backend URL: $(Get-BackendUrl)"
Write-Host "Next commands:"
Write-Host "- Start/update backend: powershell -ExecutionPolicy Bypass -File scripts\start_backend_windows.ps1"
Write-Host "- Check backend status: powershell -ExecutionPolicy Bypass -File scripts\status_backend_windows.ps1"
Write-Host "- Stop backend: powershell -ExecutionPolicy Bypass -File scripts\stop_backend_windows.ps1"
Write-Host "- Run simulation: npm run sim -- --games 1000 --provider server_heuristic"
