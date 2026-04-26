param([int]$Games = 100, [string]$Provider = "server_heuristic", [string]$BackendUrl = "http://127.0.0.1:4310", [switch]$Telemetry)
$ErrorActionPreference = "Stop"
$repo = if ($env:BACKEND_REPO_ROOT) { $env:BACKEND_REPO_ROOT } else { "C:\tichu\tichuml" }
$telemetryValue = if ($Telemetry) { "true" } else { "false" }
cd $repo
npm run sim -- --games $Games --provider $Provider --backend-url $BackendUrl --telemetry $telemetryValue --strict-telemetry false
