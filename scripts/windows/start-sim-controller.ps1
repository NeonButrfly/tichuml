param([int]$GamesPerBatch = 100, [int]$WorkerCount = 1, [string]$Provider = "server_heuristic", [string]$BackendUrl = "http://127.0.0.1:4310")
$ErrorActionPreference = "Stop"
$repo = if ($env:BACKEND_REPO_ROOT) { $env:BACKEND_REPO_ROOT } else { "C:\tichu\tichuml" }
$runtime = Join-Path $repo ".runtime\sim-controller"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$runtimeFile = Join-Path $runtime "state.json"
$lockFile = Join-Path $runtime "controller.lock"
$pauseFile = Join-Path $runtime "pause"
$stopFile = Join-Path $runtime "stop"
$logFile = Join-Path $runtime "controller.ndjson"
Remove-Item $stopFile -Force -ErrorAction SilentlyContinue
cd $repo
npm run sim -- --forever --provider $Provider --games-per-batch $GamesPerBatch --sleep-seconds 0 --worker-count $WorkerCount --telemetry true --server-fallback true --strict-telemetry false --trace-backend false --full-state false --telemetry-mode full --telemetry-max-bytes 25165824 --telemetry-timeout-ms 60000 --telemetry-retry-attempts 2 --telemetry-retry-delay-ms 250 --telemetry-backoff-ms 15000 --backend-url $BackendUrl --runtime-file $runtimeFile --lock-file $lockFile --pause-file $pauseFile --stop-file $stopFile --log-file $logFile --quiet
