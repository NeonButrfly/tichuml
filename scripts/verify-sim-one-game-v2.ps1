param(
    [string]$RepoRoot = "C:\tichu\tichuml",
    [string]$BackendUrl = "http://127.0.0.1:4310",
    [string]$PostgresContainer = "tichu-postgres",
    [string]$PostgresUser = "tichu",
    [string]$PostgresDb = "tichu",
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Continue"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputDir = Join-Path $RepoRoot "diagnostics\verify-one-game-$Timestamp"
$ZipOutput = Join-Path $RepoRoot "verify-one-game-$Timestamp.zip"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Write-Log {
    param([string]$Text)
    $Text | Tee-Object -FilePath (Join-Path $OutputDir "verify-one-game.log") -Append
}

function Run-Sql {
    param([string]$Sql)
    docker exec $PostgresContainer psql -U $PostgresUser -d $PostgresDb -c $Sql
}

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

Write-Log "RepoRoot: $RepoRoot"
Write-Log "BackendUrl: $BackendUrl"
Write-Log "PostgresContainer: $PostgresContainer"
Write-Log "PostgresUser: $PostgresUser"
Write-Log "PostgresDb: $PostgresDb"

Set-Location $RepoRoot

Write-Log "=== Git state ==="
git rev-parse HEAD 2>&1 | Tee-Object -FilePath (Join-Path $OutputDir "git-head.txt")
git status --short 2>&1 | Tee-Object -FilePath (Join-Path $OutputDir "git-status.txt")

Write-Log "=== Killing stale simulator processes ==="
$stale = @(Get-SimProcesses)
$stale | Select-Object ProcessId, Name, CommandLine | Format-List | Out-File (Join-Path $OutputDir "stale-processes-before.txt")
foreach ($p in $stale) {
    Write-Log "Stopping PID $($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

Write-Log "=== Clearing simulator runtime files ==="
$RuntimeDir = Join-Path $RepoRoot ".runtime\sim-controller"
if (Test-Path $RuntimeDir) {
    Remove-Item (Join-Path $RuntimeDir "*") -Force -Recurse -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

Write-Log "=== Clearing database ==="
Run-Sql "TRUNCATE TABLE decisions, events, matches RESTART IDENTITY CASCADE;" | Out-File (Join-Path $OutputDir "db-clear.txt")

Write-Log "=== Counts before ==="
Run-Sql "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" | Tee-Object -FilePath (Join-Path $OutputDir "db-counts-before.txt")

Write-Log "=== Backend health ==="
try {
    Invoke-RestMethod "$BackendUrl/health" | ConvertTo-Json -Depth 30 | Tee-Object -FilePath (Join-Path $OutputDir "backend-health.json")
} catch {
    "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath (Join-Path $OutputDir "backend-health.json")
}

Write-Log "=== Telemetry health before ==="
try {
    Invoke-RestMethod "$BackendUrl/api/telemetry/health" | ConvertTo-Json -Depth 30 | Tee-Object -FilePath (Join-Path $OutputDir "telemetry-before.json")
} catch {
    "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath (Join-Path $OutputDir "telemetry-before.json")
}

Write-Log "=== Running one simulator game ==="
$env:SIM_DIAGNOSTICS = "1"
$stdout = Join-Path $OutputDir "sim-stdout.log"
$stderr = Join-Path $OutputDir "sim-stderr.log"

$argsList = @(
    "run", "sim", "--",
    "--games", "1",
    "--provider", "local",
    "--telemetry", "true",
    "--strict-telemetry", "true",
    "--trace-backend", "true",
    "--backend-url", $BackendUrl
)

Write-Log "Command: npm.cmd $($argsList -join ' ')"

$proc = Start-Process -FilePath "npm.cmd" `
    -ArgumentList $argsList `
    -WorkingDirectory $RepoRoot `
    -PassThru `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
}

if (-not $proc.HasExited) {
    Write-Log "Simulator timed out after $TimeoutSeconds seconds. Killing PID $($proc.Id)."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Log "Simulator HasExited: $($proc.HasExited)"
Write-Log "Simulator ExitCode: $($proc.ExitCode)"

Write-Log "=== Counts after ==="
Run-Sql "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;" | Tee-Object -FilePath (Join-Path $OutputDir "db-counts-after.txt")

Write-Log "=== Latest decisions ==="
Run-Sql "SELECT id, game_id, hand_id, phase, actor_seat, provider_used, created_at FROM decisions ORDER BY id DESC LIMIT 20;" | Tee-Object -FilePath (Join-Path $OutputDir "latest-decisions.txt")

Write-Log "=== Latest events ==="
Run-Sql "SELECT id, game_id, hand_id, phase, event_type, actor_seat, created_at FROM events ORDER BY id DESC LIMIT 20;" | Tee-Object -FilePath (Join-Path $OutputDir "latest-events.txt")

Write-Log "=== Latest matches ==="
Run-Sql "SELECT * FROM matches ORDER BY 1 DESC LIMIT 20;" | Tee-Object -FilePath (Join-Path $OutputDir "latest-matches.txt")

Write-Log "=== Telemetry health after ==="
try {
    Invoke-RestMethod "$BackendUrl/api/telemetry/health" | ConvertTo-Json -Depth 30 | Tee-Object -FilePath (Join-Path $OutputDir "telemetry-after.json")
} catch {
    "ERROR: $($_.Exception.Message)" | Tee-Object -FilePath (Join-Path $OutputDir "telemetry-after.json")
}

Write-Log "=== Capturing runtime files ==="
if (Test-Path $RuntimeDir) {
    Get-ChildItem $RuntimeDir -Force | Out-File (Join-Path $OutputDir "runtime-files.txt")
    Copy-Item (Join-Path $RuntimeDir "*") $OutputDir -Force -ErrorAction SilentlyContinue
}

Write-Log "=== Final sim process sweep ==="
$remaining = @(Get-SimProcesses)
$remaining | Select-Object ProcessId, Name, CommandLine | Format-List | Out-File (Join-Path $OutputDir "sim-processes-after.txt")
foreach ($p in $remaining) {
    Write-Log "Stopping remaining PID $($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

Compress-Archive -Path "$OutputDir\*" -DestinationPath $ZipOutput -Force

Write-Host ""
Write-Host "Diagnostic ZIP created:" -ForegroundColor Green
Write-Host $ZipOutput
Write-Host "Upload that ZIP for analysis."
