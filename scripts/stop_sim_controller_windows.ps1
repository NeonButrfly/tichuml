$ErrorActionPreference = "Stop"
$repo = if ($env:BACKEND_REPO_ROOT) { $env:BACKEND_REPO_ROOT } else { "C:\tichu\tichuml" }
$runtime = Join-Path $repo ".runtime\sim-controller"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
Set-Content -Path (Join-Path $runtime "stop") -Value "stop" -Encoding UTF8
Write-Host "[OK] Sim controller stop file written."
