param(
  [switch]$SkipHelp,
  [Alias("?")]
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\check-scripts.ps1 [options]

Purpose:
  Validates canonical Windows/Linux script naming, parity, and help behavior.

Options:
  -SkipHelp              Skip invoking each script's help path.
  -Help, -?, --help, -h  Show this help text.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\check-scripts.ps1

Environment:
  Auto-detects repo root from the script location. Does not require running from repo root.
"@ | Write-Host
  exit 0
}

. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$scriptsDir = Join-Path $repoRoot "scripts"
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure { param([string]$Message) $failures.Add($Message) | Out-Null }

foreach ($dir in @("windows", "linux")) {
  if (Test-Path -LiteralPath (Join-Path $scriptsDir $dir)) {
    Add-Failure "scripts/$dir must not contain canonical scripts."
  }
}

$scriptFiles = Get-ChildItem -LiteralPath $scriptsDir -File | Where-Object { $_.Extension -in ".ps1", ".sh" }
$basePattern = '^[a-z0-9]+(-[a-z0-9]+)*$'
foreach ($file in $scriptFiles) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
  if ($base -notmatch $basePattern) {
    Add-Failure "Non-kebab script filename: $($file.Name)"
  }
}

$psBases = @{}
$shBases = @{}
foreach ($file in $scriptFiles | Where-Object Extension -eq ".ps1") {
  $psBases[[System.IO.Path]::GetFileNameWithoutExtension($file.Name)] = $true
}
foreach ($file in $scriptFiles | Where-Object Extension -eq ".sh") {
  $shBases[[System.IO.Path]::GetFileNameWithoutExtension($file.Name)] = $true
}

$linuxOnly = @("force-sync", "runtime-action", "sim-controller", "tail-backend-logs", "tail-sim-logs", "verify-full-sim-backend")
$windowsOnly = @("unblock-scripts")
foreach ($base in $psBases.Keys) {
  if (-not $shBases.ContainsKey($base) -and $base -notin $windowsOnly) {
    Add-Failure "Missing Linux pair for scripts/$base.ps1"
  }
}
foreach ($base in $shBases.Keys) {
  if (-not $psBases.ContainsKey($base) -and $base -notin $linuxOnly) {
    Add-Failure "Missing Windows pair for scripts/$base.sh"
  }
}

if (-not (Test-Path -LiteralPath (Join-Path $scriptsDir "start-training.ps1"))) {
  Add-Failure "Missing scripts/start-training.ps1"
}
if (-not (Test-Path -LiteralPath (Join-Path $scriptsDir "start-training.sh"))) {
  Add-Failure "Missing scripts/start-training.sh"
}

$packageText = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw
foreach ($match in [regex]::Matches($packageText, 'scripts[\\/][A-Za-z0-9_.\\/-]+\\.(ps1|sh)')) {
  $path = $match.Value -replace '/', '\'
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $path))) {
    Add-Failure "package.json references missing script: $($match.Value)"
  }
}

if (-not $SkipHelp) {
  foreach ($file in $scriptFiles | Where-Object Extension -eq ".ps1") {
    $result = & powershell -NoProfile -ExecutionPolicy Bypass -File $file.FullName -Help 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-Failure "Help failed for $($file.Name): $($result | Select-Object -First 1)"
    }
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "[OK] Script naming, parity, package references, and PowerShell help checks passed."
