param(
  [string]$RepoRoot = "",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [string]$PostgresContainer = "tichu-postgres",
  [string]$PostgresUser = "tichu",
  [string]$PostgresDb = "tichu",
  [switch]$ClearDatabase,
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "common.ps1")
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputDir = Join-Path $RepoRoot "diagnostics\verify-one-game-$Timestamp"
$ZipOutput = Join-Path $RepoRoot "verify-one-game-$Timestamp.zip"
$LogFile = Join-Path $OutputDir "verify-one-game.log"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Write-Log { param([string]$Text) $Text | Tee-Object -FilePath $LogFile -Append }
function Run-Sql { param([string]$Sql) docker exec $PostgresContainer psql -U $PostgresUser -d $PostgresDb -c $Sql }
function Get-SimProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match "node|npm|tsx" -and (
      $_.CommandLine -match "sim-runner" -or
      $_.CommandLine -match "npm run sim" -or
      $_.CommandLine -match "--forever" -or
      $_.CommandLine -match "sim-controller"
    )
  })
}
function Get-BackendProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match "dev:server|@tichuml/server|apps/server|dist/index.js|src/index.ts"
  })
}
function Save-JsonEndpoint { param([string]$Url, [string]$FileName)
  try { Invoke-RestMethod $Url | ConvertTo-Json -Depth 50 | Tee-Object -FilePath (Join-Path $OutputDir $FileName) }
  catch { "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath (Join-Path $OutputDir $FileName) }
}
function Read-Count { param([string]$Table)
  $raw = docker exec $PostgresContainer psql -U $PostgresUser -d $PostgresDb -t -A -c "SELECT COUNT(*) FROM $Table;"
  [int](($raw | Select-Object -First 1).Trim())
}

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
} else {
  $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
  Assert-RepoRoot -RepoRoot $RepoRoot
  Set-Location -LiteralPath $RepoRoot
}
Write-Log "RepoRoot: $RepoRoot"
Write-Log "BackendUrl: $BackendUrl"
Write-Log "PostgresContainer: $PostgresContainer"
Write-Log "PostgresUser: $PostgresUser"
Write-Log "PostgresDb: $PostgresDb"

git rev-parse HEAD 2>&1 | Tee-Object -FilePath (Join-Path $OutputDir "git-head.txt")
git status --short 2>&1 | Tee-Object -FilePath (Join-Path $OutputDir "git-status.txt")

Write-Log "=== Process list before ==="
Get-SimProcesses | Select-Object ProcessId, Name, CommandLine | Format-List | Out-File (Join-Path $OutputDir "sim-processes-before.txt")
Get-BackendProcesses | Select-Object ProcessId, Name, ExecutablePath, CommandLine | Format-List | Out-File (Join-Path $OutputDir "backend-processes.txt")

foreach ($proc in @(Get-SimProcesses)) {
  Write-Log "Stopping stale simulator PID $($proc.ProcessId)"
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

$RuntimeDir = Join-Path $RepoRoot ".runtime\sim-controller"
if (Test-Path $RuntimeDir) { Remove-Item (Join-Path $RuntimeDir "*") -Force -Recurse -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

if ($ClearDatabase) {
  Write-Log "=== Clearing database ==="
  Run-Sql "TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE;" | Tee-Object -FilePath (Join-Path $OutputDir "db-clear.txt")
}

Run-Sql "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" | Tee-Object -FilePath (Join-Path $OutputDir "db-counts-before.txt")
Save-JsonEndpoint "$BackendUrl/health" "backend-health-before.json"
Save-JsonEndpoint "$BackendUrl/api/telemetry/health" "telemetry-before.json"

$stdout = Join-Path $OutputDir "sim-stdout.log"
$stderr = Join-Path $OutputDir "sim-stderr.log"
$argsList = @("run", "sim", "--", "--games", "1", "--provider", "local", "--telemetry", "true", "--strict-telemetry", "true", "--trace-backend", "true", "--backend-url", $BackendUrl)
Write-Log "Command: npm.cmd $($argsList -join ' ')"
$env:SIM_DIAGNOSTICS = "1"
$sim = Start-Process -FilePath "npm.cmd" -ArgumentList $argsList -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while (-not $sim.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
if (-not $sim.HasExited) {
  Write-Log "Simulator timed out after $TimeoutSeconds seconds. Killing PID $($sim.Id)."
  Stop-Process -Id $sim.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Write-Log "Simulator HasExited: $($sim.HasExited)"
Write-Log "Simulator ExitCode: $($sim.ExitCode)"

Save-JsonEndpoint "$BackendUrl/health" "backend-health-after.json"
Save-JsonEndpoint "$BackendUrl/api/telemetry/health" "telemetry-after.json"
Run-Sql "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" | Tee-Object -FilePath (Join-Path $OutputDir "db-counts-after.txt")
Run-Sql "SELECT id, match_id, game_id, hand_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 20;" | Tee-Object -FilePath (Join-Path $OutputDir "latest-decisions.txt")
Run-Sql "SELECT id, match_id, game_id, hand_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 20;" | Tee-Object -FilePath (Join-Path $OutputDir "latest-events.txt")
Run-Sql "SELECT id AS match_id, game_id, last_hand_id, provider, requested_provider, telemetry_mode, strict_telemetry, sim_version, engine_version, status, started_at, completed_at, created_at, updated_at FROM matches ORDER BY created_at DESC LIMIT 20;" | Tee-Object -FilePath (Join-Path $OutputDir "latest-matches.txt")
$truthFile = Join-Path $OutputDir "telemetry-truth.json"
npm.cmd run telemetry:truth -- --backend-url $BackendUrl --require-rows *> $truthFile
$truthExitCode = $LASTEXITCODE

if (Test-Path $RuntimeDir) {
  Get-ChildItem $RuntimeDir -Force | Out-File (Join-Path $OutputDir "runtime-files.txt")
  Copy-Item (Join-Path $RuntimeDir "*") $OutputDir -Force -ErrorAction SilentlyContinue
}

$remaining = @(Get-SimProcesses)
$remaining | Select-Object ProcessId, Name, CommandLine | Format-List | Out-File (Join-Path $OutputDir "sim-processes-after.txt")
foreach ($proc in $remaining) {
  Write-Log "Stopping remaining simulator PID $($proc.ProcessId)"
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

$decisions = Read-Count "decisions"
$events = Read-Count "events"
$matches = Read-Count "matches"
$failures = @()
if ($decisions -le 0) { $failures += "decisions_zero" }
if ($events -le 0) { $failures += "events_zero" }
if ($matches -le 0) { $failures += "matches_zero" }
if ($truthExitCode -ne 0) { $failures += "join_validation_failed" }
if (@(Get-SimProcesses).Count -gt 0) { $failures += "orphan_sim_process" }

@{ ok = ($failures.Count -eq 0); failures = $failures; decisions = $decisions; events = $events; matches = $matches; zip = $ZipOutput } | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $OutputDir "summary.json") -Encoding UTF8
Compress-Archive -Path "$OutputDir\*" -DestinationPath $ZipOutput -Force

if ($failures.Count -eq 0) {
  Write-Host "PASS" -ForegroundColor Green
  Write-Host $ZipOutput
  exit 0
}
Write-Host "FAIL: $($failures -join ', ')" -ForegroundColor Red
Write-Host $ZipOutput
exit 1
