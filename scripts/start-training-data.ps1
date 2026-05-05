[CmdletBinding()]
param(
  [string]$SessionName,
  [int]$Games = 1000,
  [string]$Provider = "server_heuristic",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [object]$StrictTelemetry = $false,
  [int]$DecisionTimeoutMs = 2000,
  [string]$PgHost = "127.0.0.1",
  [string]$PgPort = "54329",
  [string]$PgUser = "tichu",
  [string]$PgDb = "tichu",
  [string]$PgPassword = "tichu_dev_password",
  [int]$IntervalSeconds = 15,
  [switch]$NoClear,
  [switch]$DryRun,
  [switch]$ReplaceSession,
  [switch]$AllowUnhealthyBackend,
  [string]$AllowClearDbName,
  [switch]$Attach,
  [switch]$DetachOnly,
  [switch]$SkipMlExportCheck,
  [string]$MlExportCommand = "npm run ml:export",
  [string]$ExplorationProfile = "off",
  [double]$ExplorationRate = 0,
  [int]$ExplorationTopN = 0,
  [double]$ExplorationMaxScoreGap = 0,
  [Alias("?")]
  [switch]$Help
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows\\common.ps1")

function Convert-ToBooleanValue {
  param(
    [object]$Value,
    [bool]$Fallback = $false
  )

  if ($Value -is [bool]) {
    return $Value
  }

  if ($null -eq $Value) {
    return $Fallback
  }

  $normalized = "$Value".Trim().ToLowerInvariant()
  if ($normalized.StartsWith('$')) {
    $normalized = $normalized.Substring(1)
  }
  if ($normalized -in @("1", "true", "yes", "on")) {
    return $true
  }
  if ($normalized -in @("0", "false", "no", "off")) {
    return $false
  }

  throw "StrictTelemetry expects true/false or 1/0. Received '$Value'."
}

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$target = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\start-training-data.ps1" -Description "Training data launcher"

$invokeArgs = @{
  Games = $Games
  Provider = $Provider
  BackendUrl = $BackendUrl
  StrictTelemetry = (Convert-ToBooleanValue -Value $StrictTelemetry -Fallback $false)
  DecisionTimeoutMs = $DecisionTimeoutMs
  PgHost = $PgHost
  PgPort = $PgPort
  PgUser = $PgUser
  PgDb = $PgDb
  PgPassword = $PgPassword
  IntervalSeconds = $IntervalSeconds
  MlExportCommand = $MlExportCommand
  ExplorationProfile = $ExplorationProfile
  ExplorationRate = $ExplorationRate
  ExplorationTopN = $ExplorationTopN
  ExplorationMaxScoreGap = $ExplorationMaxScoreGap
}

if (-not [string]::IsNullOrWhiteSpace($SessionName)) {
  $invokeArgs.SessionName = $SessionName
}
if ($NoClear) { $invokeArgs.NoClear = $true }
if ($DryRun) { $invokeArgs.DryRun = $true }
if ($ReplaceSession) { $invokeArgs.ReplaceSession = $true }
if ($AllowUnhealthyBackend) { $invokeArgs.AllowUnhealthyBackend = $true }
if (-not [string]::IsNullOrWhiteSpace($AllowClearDbName)) {
  $invokeArgs.AllowClearDbName = $AllowClearDbName
}
if ($Attach) { $invokeArgs.Attach = $true }
if ($DetachOnly) { $invokeArgs.DetachOnly = $true }
if ($SkipMlExportCheck) { $invokeArgs.SkipMlExportCheck = $true }
if ($Help) { $invokeArgs.Help = $true }

& $target @invokeArgs
exit $LASTEXITCODE
