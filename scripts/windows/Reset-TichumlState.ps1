# Reset-TichumlState.ps1
# Purpose:
#   Start Postgres/backend if needed, clear the Tichu database through the backend admin endpoint,
#   stop the backend, then clear runtime/log/diagnostic artifacts.
#
# Safety:
#   - Does NOT delete node_modules.
#   - Does NOT delete Docker volumes.
#   - Does NOT run git clean.
#   - Does NOT touch source files.
#
# Usage:
#   cd C:\tichu\tichuml
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows\Reset-TichumlState.ps1
#
# Optional:
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows\Reset-TichumlState.ps1 -RepoRoot C:\tichu\tichuml -BackendUrl http://127.0.0.1:4310

[CmdletBinding()]
param(
    [string]$RepoRoot = "",
    [string]$BackendUrl = $env:BACKEND_URL,
    [string]$AdminConfirm = "CLEAR_TICHU_DB",
    [switch]$SkipBackendStop
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info { param([string]$Message) Write-Host "$(Get-Date -AsUTC -Format 'yyyy-MM-ddTHH:mm:ssZ') [INFO] $Message" }
function Write-Ok { param([string]$Message) Write-Host "$(Get-Date -AsUTC -Format 'yyyy-MM-ddTHH:mm:ssZ') [OK] $Message" }
function Write-WarnLine { param([string]$Message) Write-Warning "$(Get-Date -AsUTC -Format 'yyyy-MM-ddTHH:mm:ssZ') [WARN] $Message" }
function Stop-Fail { param([string]$Message) Write-Error "$(Get-Date -AsUTC -Format 'yyyy-MM-ddTHH:mm:ssZ') [FAIL] $Message"; exit 1 }

if ([string]::IsNullOrWhiteSpace($BackendUrl)) { $BackendUrl = "http://127.0.0.1:4310" }

$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptDir = Split-Path -Parent $ScriptPath

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $Candidate1 = Resolve-Path -LiteralPath (Join-Path $ScriptDir "..\..") -ErrorAction SilentlyContinue
    $Candidate2 = Resolve-Path -LiteralPath (Join-Path $ScriptDir "..") -ErrorAction SilentlyContinue
    $Candidate3 = Resolve-Path -LiteralPath "." -ErrorAction SilentlyContinue

    if ($Candidate1 -and (Test-Path -LiteralPath (Join-Path $Candidate1.Path "package.json"))) {
        $RepoRoot = $Candidate1.Path
    } elseif ($Candidate2 -and (Test-Path -LiteralPath (Join-Path $Candidate2.Path "package.json"))) {
        $RepoRoot = $Candidate2.Path
    } elseif ($Candidate3 -and (Test-Path -LiteralPath (Join-Path $Candidate3.Path "package.json"))) {
        $RepoRoot = $Candidate3.Path
    } else {
        Stop-Fail "Could not detect repo root. Pass -RepoRoot C:\tichu\tichuml"
    }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "package.json"))) { Stop-Fail "Repo root does not contain package.json: ${RepoRoot}" }

Set-Location -LiteralPath $RepoRoot

Write-Info "Repo root: ${RepoRoot}"
Write-Info "Backend URL: ${BackendUrl}"

function Test-BackendHealth {
    try {
        Invoke-RestMethod -Uri "${BackendUrl}/health" -Method Get -TimeoutSec 3 | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Info "Starting Postgres if required"
try {
    npm run db:up
    Write-Ok "Postgres startup command completed"
} catch {
    Stop-Fail "npm run db:up failed"
}

$BackendWasRunning = Test-BackendHealth
if ($BackendWasRunning) {
    Write-Ok "Backend already healthy"
} else {
    Write-Info "Backend not healthy; starting backend"
    $StartScriptCandidates = @(
        (Join-Path $RepoRoot "scripts\windows\start_backend_windows.ps1"),
        (Join-Path $RepoRoot "scripts\start_backend_windows.ps1")
    )

    $StartScript = @($StartScriptCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
    if ($StartScript.Count -eq 0) { Stop-Fail "No Windows backend start script found" }

    powershell -ExecutionPolicy Bypass -File $StartScript[0]

    $Healthy = $false
    foreach ($i in 1..60) {
        if (Test-BackendHealth) {
            $Healthy = $true
            break
        }
        Start-Sleep -Seconds 1
    }

    if (-not $Healthy) { Stop-Fail "Backend did not become healthy" }
    Write-Ok "Backend became healthy"
}

Write-Info "Clearing database through backend admin endpoint"
try {
    $Headers = @{ "content-type" = "application/json"; "x-admin-confirm" = $AdminConfirm }
    $Body = @{ confirm = $AdminConfirm } | ConvertTo-Json -Compress
    $ResetResponse = Invoke-RestMethod -Uri "${BackendUrl}/api/admin/database/reset" -Method Post -Headers $Headers -Body $Body -TimeoutSec 60
    $ResetResponse | ConvertTo-Json -Depth 20
    Write-Ok "Database reset accepted"
} catch {
    Stop-Fail "Database reset endpoint failed: $($_.Exception.Message)"
}

if ($SkipBackendStop) {
    Write-WarnLine "Skipping backend stop because -SkipBackendStop was passed"
} else {
    Write-Info "Stopping backend"
    $StopScriptCandidates = @(
        (Join-Path $RepoRoot "scripts\windows\stop_backend_windows.ps1"),
        (Join-Path $RepoRoot "scripts\stop_backend_windows.ps1")
    )

    $StopScript = @($StopScriptCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
    if ($StopScript.Count -eq 0) {
        Write-WarnLine "No Windows backend stop script found; skipping process cleanup"
    } else {
        try {
            powershell -ExecutionPolicy Bypass -File $StopScript[0]
            Write-Ok "Backend stop attempted"
        } catch {
            Write-WarnLine "Backend stop script returned an error: $($_.Exception.Message)"
        }
    }
}

function Remove-SafeRepoPath {
    param([string]$PathToRemove)

    if (-not (Test-Path -LiteralPath $PathToRemove)) { return }

    $Resolved = (Resolve-Path -LiteralPath $PathToRemove).Path
    $RepoRootWithSlash = $RepoRoot.TrimEnd('\') + '\'

    if ($Resolved -eq $RepoRoot -or $Resolved.StartsWith($RepoRootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $Resolved -Recurse -Force
        Write-Ok "Removed ${Resolved}"
    } else {
        Stop-Fail "Refusing to remove path outside repo: ${Resolved}"
    }
}

Write-Info "Clearing runtime/log/diagnostic artifacts"

Remove-SafeRepoPath -PathToRemove (Join-Path $RepoRoot ".runtime")
Remove-SafeRepoPath -PathToRemove (Join-Path $RepoRoot "logs")

$DiagnosticPatterns = @("*diagnostic*.zip", "*diagnostics*.zip", "verify-*.zip", "verify-*.tar.gz", "*full-sim-verify*.zip", "*full-sim-verify*.tar.gz", "*.diag.zip")
foreach ($Pattern in @($DiagnosticPatterns)) {
    $Files = @(Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force -ErrorAction SilentlyContinue -Include $Pattern | Where-Object { $_.FullName -notmatch "\\node_modules\\" })
    foreach ($File in $Files) {
        if ($File.FullName.StartsWith(($RepoRoot.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $File.FullName -Force
            Write-Ok "Removed $($File.FullName)"
        }
    }
}

$RuntimeLogs = Join-Path $RepoRoot ".runtime\logs"
New-Item -ItemType Directory -Path $RuntimeLogs -Force | Out-Null
Write-Ok "Recreated ${RuntimeLogs}"

Write-Info "Final database counts"
$PostgresPassword = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "tichu_dev_password" }
$PostgresPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "54329" }
$PostgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "tichu" }
$PostgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "tichu" }

try {
    $env:PGPASSWORD = $PostgresPassword
    psql -h 127.0.0.1 -p $PostgresPort -U $PostgresUser -d $PostgresDb -c "SELECT 'decisions' AS table_name, COUNT(*) FROM decisions UNION ALL SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'matches', COUNT(*) FROM matches;"
} catch {
    Write-WarnLine "Could not query DB counts: $($_.Exception.Message)"
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Ok "Reset state complete"
