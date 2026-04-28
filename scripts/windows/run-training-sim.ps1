param(
  [string]$Provider = "local",
  [string]$Telemetry = "true",
  [string]$StrictTelemetry = "false",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [int]$GamesPerLoop = 100,
  [string]$LogDir = "C:\tichu\tichuml\logs\sim-training",
  [int]$TruthEveryLoops = 5
)
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$script:StopRequested = $false
[Console]::TreatControlCAsInput = $false
$loop = 0
Push-Location $repoRoot
try {
  while (-not $script:StopRequested) {
    $loop += 1
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logFile = Join-Path $LogDir ("training-loop-{0:D6}-{1}.log" -f $loop, $stamp)
    Write-Host "==> Training loop $loop"
    & npm.cmd run sim -- --games $GamesPerLoop --provider $Provider --telemetry $Telemetry --strict-telemetry $StrictTelemetry --backend-url $BackendUrl *>> $logFile
    if ($LASTEXITCODE -ne 0) { throw "Simulator loop failed with exit code $LASTEXITCODE. Inspect $logFile." }
    if ($TruthEveryLoops -gt 0 -and ($loop % $TruthEveryLoops) -eq 0) {
      & npm.cmd run telemetry:truth -- --backend-url $BackendUrl
    }
    Write-Host "[OK] Loop $loop complete. Log: $logFile"
  }
} finally {
  Get-CimInstance Win32_Process | Where-Object { $_.Name -match "node|npm|tsx" -and $_.CommandLine -match "sim-runner|npm run sim|sim-controller" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Pop-Location
}
