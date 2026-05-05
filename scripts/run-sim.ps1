param(
  [int]$Games = 100,
  [string]$Provider = "server_heuristic",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [object]$Telemetry = $false,
  [object]$StrictTelemetry = $false,
  [string]$Seed = "",
  [switch]$DryRun,
  [Alias("?")]
  [switch]$Help,
  [switch]$h
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

function Convert-ToBoolString {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($Value -is [bool]) {
    return $Value.ToString().ToLowerInvariant()
  }

  $text = [string]$Value
  switch -Regex ($text.Trim().ToLowerInvariant()) {
    "^(true|1|yes|y)$" { return "true" }
    "^(false|0|no|n)$" { return "false" }
    default { throw "${Name} must be true or false, got '${Value}'." }
  }
}

if ($Help -or $h) {
@"
Usage:
  scripts\run-sim.ps1 [options]

Purpose:
  Runs a finite self-play simulator batch from Windows.

Options:
  -Games <count>                 Games to run. Default: 100
  -Provider <name>               local, server_heuristic, or lightgbm_model. Default: server_heuristic
  -BackendUrl <url>              Backend base URL. Default: http://127.0.0.1:4310
  -Telemetry <true|false>        Emit telemetry. Default: false
  -StrictTelemetry <true|false>  Fail gameplay on telemetry errors. Default: false
  -Seed <value>                  Optional simulator seed.
  -DryRun                        Print the underlying command without running it.
  -Help, -h, -?                  Show this help text.

Examples:
  scripts\run-sim.ps1 -Games 1 -Provider local -Telemetry false
  scripts\run-sim.ps1 -Games 1 -Provider server_heuristic -BackendUrl http://127.0.0.1:4310 -Telemetry true

Environment:
  Auto-detects the repo root from the script location. Requires npm dependencies to be installed.
"@ | Write-Host
  exit 0
}
$repo = Enter-RepoRoot -BaseDir $PSScriptRoot
$telemetryValue = Convert-ToBoolString -Value $Telemetry -Name "Telemetry"
$strictTelemetryValue = Convert-ToBoolString -Value $StrictTelemetry -Name "StrictTelemetry"
Set-Location -LiteralPath $repo
$cmd = @("run", "sim", "--", "--games", "$Games", "--provider", $Provider, "--backend-url", $BackendUrl, "--telemetry", $telemetryValue, "--strict-telemetry", $strictTelemetryValue)
if (-not [string]::IsNullOrWhiteSpace($Seed)) {
  $cmd += @("--seed", $Seed)
}
Write-Host "Repo root: $repo"
Write-Host ("Underlying command: npm.cmd " + ($cmd -join " "))
if ($DryRun) {
  exit 0
}
npm.cmd @cmd
