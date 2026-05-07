param(
  [string]$RepoRoot = "",
  [string]$BackendUrl = "",
  [switch]$ClearDatabase,
  [int]$TimeoutSeconds = 90,
  [switch]$NoStartBackend,
  [Alias("?")]
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\verify-sim-one-game.ps1 [options]

Purpose:
  Runs exactly one Windows simulator game, verifies telemetry persistence, and
  captures backend/runtime diagnostics.

Options:
  -RepoRoot <path>
  -BackendUrl <url>        Backend base URL. Must still target the local machine.
  -ClearDatabase           Destructive: truncate telemetry tables before running.
  -TimeoutSeconds <count>  Simulator timeout. Default: 90
  -NoStartBackend          Require the backend to already be healthy instead of starting it when down.
  -Help, -?, --help, -h

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\verify-sim-one-game.ps1 -TimeoutSeconds 90
  powershell -ExecutionPolicy Bypass -File scripts\verify-sim-one-game.ps1 -ClearDatabase -BackendUrl http://127.0.0.1:4310

Safety:
  -ClearDatabase is destructive and must be explicitly provided.
"@ | Write-Host
  exit 0
}

. (Join-Path $PSScriptRoot "common.ps1")
$resolvedRepoRoot =
  if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    Enter-RepoRoot -BaseDir $PSScriptRoot
  } else {
    $candidate = (Resolve-Path -LiteralPath $RepoRoot).Path
    Assert-RepoRoot -RepoRoot $candidate
    Set-Location -LiteralPath $candidate
    $candidate
  }

$env:BACKEND_REPO_ROOT = $resolvedRepoRoot
. (Join-Path $PSScriptRoot "backend-common.ps1")

function Test-BackendUrlTargetsLocalMachine {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }

  try {
    $uri = [Uri]$Url
  } catch {
    return $false
  }

  return $uri.Host -in @("127.0.0.1", "localhost", "::1")
}

function Test-BackendHealthReady {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri ($Url.TrimEnd("/") + "/health") -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Wait-BackendHealthReady {
  param(
    [string]$Url,
    [int]$TimeoutSec = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-BackendHealthReady -Url $Url) {
      return $true
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Get-SimProcesses {
  @(
    Get-CimInstance Win32_Process | Where-Object {
      $_.Name -match "node|npm|tsx" -and (
        $_.CommandLine -match "sim-runner" -or
        $_.CommandLine -match "npm run sim" -or
        $_.CommandLine -match "--forever" -or
        $_.CommandLine -match "sim-controller"
      )
    }
  )
}

function Get-BackendProcesses {
  @(
    Get-CimInstance Win32_Process | Where-Object {
      $_.CommandLine -match "dev:server|@tichuml/server|apps/server|dist/index.js|src/index.ts"
    }
  )
}

function Save-EndpointSnapshot {
  param(
    [string]$Url,
    [string]$FilePath
  )

  try {
    Invoke-RestMethod -Uri $Url -TimeoutSec 10 |
      ConvertTo-Json -Depth 50 |
      Set-Content -LiteralPath $FilePath -Encoding UTF8
  } catch {
    "ERROR: $($_.Exception.Message)" | Set-Content -LiteralPath $FilePath -Encoding UTF8
  }
}

Prepare-RuntimeStack
Assert-DatabaseUrl

$resolvedBackendUrl = ""
$backendUrlSource = ""
if (-not [string]::IsNullOrWhiteSpace($BackendUrl)) {
  $resolvedBackendUrl = $BackendUrl
  $backendUrlSource = "argument"
} elseif (-not [string]::IsNullOrWhiteSpace($env:BACKEND_LOCAL_URL)) {
  $resolvedBackendUrl = $env:BACKEND_LOCAL_URL
  $backendUrlSource = ".env BACKEND_LOCAL_URL"
} elseif (-not [string]::IsNullOrWhiteSpace($env:BACKEND_BASE_URL)) {
  $resolvedBackendUrl = $env:BACKEND_BASE_URL
  $backendUrlSource = ".env BACKEND_BASE_URL"
} else {
  $defaultPort = if (-not [string]::IsNullOrWhiteSpace($env:PORT)) { $env:PORT } else { "4310" }
  $resolvedBackendUrl = "http://127.0.0.1:$defaultPort"
  $backendUrlSource = "default http://127.0.0.1:$defaultPort"
}

if (-not (Test-BackendUrlTargetsLocalMachine -Url $resolvedBackendUrl)) {
  throw "verify-sim-one-game.ps1 only supports local backend URLs because it validates against the local Postgres truth set. Received: $resolvedBackendUrl"
}

if (Test-BackendHealthReady -Url $resolvedBackendUrl) {
  Write-Ok "Backend already healthy at $resolvedBackendUrl"
} else {
  if ($NoStartBackend) {
    throw "Backend is not healthy at $resolvedBackendUrl and -NoStartBackend was provided."
  }

  Write-Warn "Backend is not healthy at $resolvedBackendUrl; starting the local backend stack."
  Build-BackendArtifacts
  Run-Migrations
  Start-BackendProcess
  if (-not (Wait-BackendHealthReady -Url $resolvedBackendUrl -TimeoutSec 60)) {
    throw "Backend failed to become healthy at $resolvedBackendUrl after startup."
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir = Join-Path $resolvedRepoRoot "diagnostics\verify-one-game-windows-$timestamp"
$zipOutput = Join-Path $resolvedRepoRoot "verify-one-game-windows-$timestamp.zip"
$runtimeDir = Join-Path $resolvedRepoRoot ".runtime\sim-controller"
$logFile = Join-Path $outputDir "verify-one-game.log"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function Write-Log {
  param([string]$Text)
  $Text | Tee-Object -FilePath $logFile -Append
}

Write-Log "RepoRoot: $resolvedRepoRoot"
Write-Log "BackendUrl: $resolvedBackendUrl (source: $backendUrlSource)"
Write-Log ("DATABASE_URL: {0}" -f (ConvertTo-SafeDatabaseUrl $env:DATABASE_URL))

& git -C $resolvedRepoRoot rev-parse HEAD 2>&1 | Tee-Object -FilePath (Join-Path $outputDir "git-head.txt")
& git -C $resolvedRepoRoot status --short 2>&1 | Tee-Object -FilePath (Join-Path $outputDir "git-status.txt")

Write-Log "=== Process list before ==="
Get-SimProcesses | Select-Object ProcessId, Name, CommandLine | Format-List | Out-File (Join-Path $outputDir "sim-processes-before.txt")
Get-BackendProcesses | Select-Object ProcessId, Name, ExecutablePath, CommandLine | Format-List | Out-File (Join-Path $outputDir "backend-processes.txt")

foreach ($proc in @(Get-SimProcesses)) {
  Write-Log "Stopping stale simulator PID $($proc.ProcessId)"
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

if (Test-Path -LiteralPath $runtimeDir) {
  Remove-Item (Join-Path $runtimeDir "*") -Force -Recurse -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if ($ClearDatabase) {
  Write-Log "=== Clearing database ==="
  Invoke-DbExec -Sql "TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE;" |
    Tee-Object -FilePath (Join-Path $outputDir "db-clear.txt")
}

Invoke-DbExec -Sql "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" |
  Tee-Object -FilePath (Join-Path $outputDir "db-counts-before.txt")
Save-EndpointSnapshot -Url ($resolvedBackendUrl.TrimEnd("/") + "/health") -FilePath (Join-Path $outputDir "backend-health-before.json")
Save-EndpointSnapshot -Url ($resolvedBackendUrl.TrimEnd("/") + "/api/telemetry/health") -FilePath (Join-Path $outputDir "telemetry-before.json")

$stdout = Join-Path $outputDir "sim-stdout.log"
$stderr = Join-Path $outputDir "sim-stderr.log"
$argsList = @("run", "sim", "--", "--games", "1", "--provider", "local", "--telemetry", "true", "--strict-telemetry", "true", "--trace-backend", "true", "--backend-url", $resolvedBackendUrl)
Write-Log "Command: npm.cmd $($argsList -join ' ')"
$env:SIM_DIAGNOSTICS = "1"
$sim = Start-Process -FilePath "npm.cmd" -ArgumentList $argsList -WorkingDirectory $resolvedRepoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while (-not $sim.HasExited -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
}
if (-not $sim.HasExited) {
  Write-Log "Simulator timed out after $TimeoutSeconds seconds. Killing PID $($sim.Id)."
  Stop-Process -Id $sim.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Write-Log "Simulator HasExited: $($sim.HasExited)"
Write-Log "Simulator ExitCode: $($sim.ExitCode)"

Save-EndpointSnapshot -Url ($resolvedBackendUrl.TrimEnd("/") + "/health") -FilePath (Join-Path $outputDir "backend-health-after.json")
Save-EndpointSnapshot -Url ($resolvedBackendUrl.TrimEnd("/") + "/api/telemetry/health") -FilePath (Join-Path $outputDir "telemetry-after.json")
Invoke-DbExec -Sql "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" |
  Tee-Object -FilePath (Join-Path $outputDir "db-counts-after.txt")
Invoke-DbExec -Sql "SELECT id, match_id, game_id, hand_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 20;" |
  Tee-Object -FilePath (Join-Path $outputDir "latest-decisions.txt")
Invoke-DbExec -Sql "SELECT id, match_id, game_id, hand_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 20;" |
  Tee-Object -FilePath (Join-Path $outputDir "latest-events.txt")
Invoke-DbExec -Sql "SELECT id AS match_id, game_id, last_hand_id, provider, requested_provider, telemetry_mode, strict_telemetry, sim_version, engine_version, status, started_at, completed_at, created_at, updated_at FROM matches ORDER BY created_at DESC LIMIT 20;" |
  Tee-Object -FilePath (Join-Path $outputDir "latest-matches.txt")

$truthFile = Join-Path $outputDir "telemetry-truth.json"
$tsxCommand = Join-Path $resolvedRepoRoot "node_modules\.bin\tsx.cmd"
& $tsxCommand (Join-Path $resolvedRepoRoot "scripts\telemetry-truth.ts") --backend-url $resolvedBackendUrl --require-rows *> $truthFile
$truthExitCode = $LASTEXITCODE

if (Test-Path -LiteralPath $runtimeDir) {
  Get-ChildItem -LiteralPath $runtimeDir -Force | Out-File (Join-Path $outputDir "runtime-files.txt")
  Copy-Item (Join-Path $runtimeDir "*") $outputDir -Force -ErrorAction SilentlyContinue
}

$remaining = @(Get-SimProcesses)
$remaining | Select-Object ProcessId, Name, CommandLine | Format-List | Out-File (Join-Path $outputDir "sim-processes-after.txt")
foreach ($proc in $remaining) {
  Write-Log "Stopping remaining simulator PID $($proc.ProcessId)"
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

$decisions = Get-DbCount -TableName "decisions"
$events = Get-DbCount -TableName "events"
$matches = Get-DbCount -TableName "matches"

$telemetryAfter = Get-Content -LiteralPath (Join-Path $outputDir "telemetry-after.json") -Raw
$queuePending = "unknown"
$persistenceFailures = "unknown"
try {
  $payload = $telemetryAfter | ConvertFrom-Json
  $queuePending = "$($payload.queue_pending)"
  $persistenceFailures = "$($payload.persistence_failures)"
} catch {
}

$truthOk = $false
try {
  $truthPayload = Get-Content -LiteralPath $truthFile -Raw | ConvertFrom-Json
  $truthOk = $truthPayload.ok -eq $true
} catch {
}

$failuresList = New-Object System.Collections.Generic.List[string]
if ($sim.ExitCode -ne 0) { $failuresList.Add("sim_exit_$($sim.ExitCode)") | Out-Null }
if ($decisions -le 0) { $failuresList.Add("decisions_zero") | Out-Null }
if ($events -le 0) { $failuresList.Add("events_zero") | Out-Null }
if ($matches -le 0) { $failuresList.Add("matches_zero") | Out-Null }
if ($queuePending -ne "0") { $failuresList.Add("queue_pending_$queuePending") | Out-Null }
if ($persistenceFailures -ne "0") { $failuresList.Add("persistence_failures_$persistenceFailures") | Out-Null }
if ($truthExitCode -ne 0 -or -not $truthOk) { $failuresList.Add("join_validation_failed") | Out-Null }
if ($remaining.Count -gt 0) { $failuresList.Add("orphan_sim_process") | Out-Null }

@{
  ok = $failuresList.Count -eq 0
  failures = @($failuresList)
  decisions = $decisions
  events = $events
  matches = $matches
  queue_pending = $queuePending
  persistence_failures = $persistenceFailures
  archive = $zipOutput
} | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $outputDir "summary.json") -Encoding UTF8

Compress-Archive -Path "$outputDir\*" -DestinationPath $zipOutput -Force

if ($failuresList.Count -eq 0) {
  Write-Host "PASS" -ForegroundColor Green
  Write-Host $zipOutput
  exit 0
}

Write-Host "FAIL: $($failuresList -join ', ')" -ForegroundColor Red
Write-Host $zipOutput
exit 1
