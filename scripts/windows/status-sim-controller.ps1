$ErrorActionPreference = "Stop"
$repo = if ($env:BACKEND_REPO_ROOT) { $env:BACKEND_REPO_ROOT } else { "C:\tichu\tichuml" }
$runtime = Join-Path $repo ".runtime\sim-controller"
$state = Join-Path $runtime "state.json"
$log = Join-Path $runtime "controller.ndjson"
if (Test-Path $state) { Get-Content $state -Raw } else { Write-Host "[WARN] No sim controller state file found at $state" }
if (Test-Path $log) { Write-Host ""; Write-Host "Recent Logs"; Get-Content $log -Tail 25 } else { Write-Host "[WARN] No sim controller log file found at $log" }
