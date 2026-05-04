[CmdletBinding()]
param(
  [string]$SessionName,
  [int]$Games = 1000,
  [string]$Provider = "server_heuristic",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [bool]$StrictTelemetry = $false,
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
  [Alias("?")]
  [switch]$Help,
  [switch]$InternalRunner,
  [string]$MetadataFile,
  [string]$PgPasswordFile,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

function Show-HelpText {
  @"
Usage:
  scripts\windows\start-training-data.ps1 [options]

Starts an isolated training-data self-play session in a background PowerShell job/process.

Modes:
  Default: CLEAR DATABASE MODE
  -NoClear: NO-CLEAR APPEND MODE

Help:
  -Help, -?
  --help, -help
      Show this help text and exit.

Session control:
  -SessionName <name>
      Use an explicit session/job name instead of the auto-generated
      tichuml-training-<run_id> value.
  -ReplaceSession
      Stop and replace an existing session with the same name.
  -Attach
      Tail the run log after launch.
  -DetachOnly
      Start the background job without attaching. This is the default behavior.

Simulation:
  -Games <count>
      Games per batch. Default: 1000
  -Provider <local|server_heuristic|lightgbm_model>
      Decision provider. Default: server_heuristic
  -BackendUrl <url>
      Backend base URL. Default: http://127.0.0.1:4310
  -StrictTelemetry <true|false>
      Whether telemetry failures should be strict. Default: false
  -DecisionTimeoutMs <milliseconds>
      Diagnostic escape hatch for backend decision timeouts. Default: 500
  -IntervalSeconds <seconds>
      Seconds between scoped verification snapshots. Default: 15

Database:
  -PgHost <host>
      Postgres host. Default: 127.0.0.1
  -PgPort <port>
      Postgres port. Default: 54329
  -PgUser <user>
      Postgres user. Default: tichu
  -PgDb <database>
      Postgres database name. Default: tichu
  -PgPassword <password>
      Postgres password used for this run only. Default: tichu_dev_password
  -AllowClearDbName <name>
      Allow destructive clear only when current_database() matches this name.
      Default expected name is tichu.
  -AllowUnhealthyBackend
      Continue even if the backend health check fails.
  -NoClear
      Preserve existing rows and append new scoped training data.

Validation and export:
  -DryRun
      Print the resolved run/session/export plan without launching a background job.
  -SkipMlExportCheck
      Skip the validation-only ml:export compatibility check.
  -MlExportCommand <command>
      Command label recorded in metadata and logs. Default: npm run ml:export

Internal-only parameters:
  -InternalRunner
  -MetadataFile <path>
  -PgPasswordFile <path>
      Used by the launcher to run the background worker. Operators should not
      invoke these directly.

Artifacts created per run:
  training-runs\<run_id>\metadata.json
  training-runs\<run_id>\run.log
  training-runs\<run_id>\verification.log
  training-runs\<run_id>\commands.txt
  training-runs\<run_id>\last_10_games.txt
  training-runs\<run_id>\database_counts.txt
  training-runs\<run_id>\ml_export_check.log
  training-runs\<run_id>\ml_export_check_summary.json
  `$env:TEMP\tichuml-training-export-<run_id>\
  `$env:TEMP\tichuml-training-export-<run_id>.tar.gz
"@
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Normalize-CommandOutput {
  param([object]$Value)

  if ($null -eq $Value) {
    return ""
  }

  if ($Value -is [System.Array]) {
    return (($Value | ForEach-Object { "$_" }) -join [Environment]::NewLine).Trim()
  }

  return "$Value".Trim()
}

function Get-OutputPreview {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return "(no output)"
  }

  $normalized = $Text.Replace("`r", " ").Replace("`n", " ").Trim()
  if ($normalized.Length -le 240) {
    return $normalized
  }

  return $normalized.Substring(0, 240) + "..."
}

function Invoke-ProcessCapture {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  $stdoutFile = Join-Path $env:TEMP ("tichuml-capture-stdout-" + [guid]::NewGuid().ToString("N") + ".log")
  $stderrFile = Join-Path $env:TEMP ("tichuml-capture-stderr-" + [guid]::NewGuid().ToString("N") + ".log")
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Stdout = if (Test-Path $stdoutFile) { (Get-Content -Path $stdoutFile -Raw) } else { "" }
      Stderr = if (Test-Path $stderrFile) { (Get-Content -Path $stderrFile -Raw) } else { "" }
    }
  } finally {
    Remove-Item -LiteralPath $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-HelperJsonValue {
  param([string]$FilePath, [string]$Key)
  $json = Get-Content -Path $FilePath -Raw | ConvertFrom-Json
  $value = $json.$Key
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace("$value")) {
    throw "Missing JSON field $Key in $FilePath"
  }
  return "$value"
}

function Find-TrainingMetadataBySession {
  param([string]$RepoRoot, [string]$Name)
  $trainingRoot = Join-Path $RepoRoot "training-runs"
  if (-not (Test-Path $trainingRoot)) { return $null }
  foreach ($file in Get-ChildItem -Path $trainingRoot -Filter metadata.json -Recurse -File) {
    $json = Get-Content -Path $file.FullName -Raw | ConvertFrom-Json
    if ($json.session_name -eq $Name) {
      return $file.FullName
    }
  }
  return $null
}

function Write-CommandsFile {
  param(
    [string]$FilePath,
    [string]$RunId,
    [string]$GameIdPrefix,
    [string]$SessionNameValue
  )
  @"
Watch runner:
Get-Content -Path "training-runs\$RunId\run.log" -Wait

Watch verifier:
Get-Content -Path "training-runs\$RunId\verification.log" -Wait

Watch ML export compatibility check:
Get-Content -Path "training-runs\$RunId\ml_export_check.log" -Wait

Suggested manual ml:export command:
npm run ml:export -- --run-id $RunId --game-id-prefix $GameIdPrefix --output-dir training-runs\$RunId\ml

Stop:
scripts\windows\stop-training-data.ps1 -SessionName $SessionNameValue

Expected export:
Get-ChildItem "`$env:TEMP\tichuml-training-export-$RunId.tar.gz"
"@ | Set-Content -Path $FilePath -Encoding UTF8
}

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$trainingDataScript = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\training-data.ts" -Description "Training data entrypoint"
$stopTrainingScript = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\stop-training-data.ps1" -Description "Training stop script"
$selfScriptPath = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\start-training-data.ps1" -Description "Training start script"

if ($Help -or ($RemainingArgs -contains "--help") -or ($RemainingArgs -contains "-help")) {
  Show-HelpText
  exit 0
}

if ($InternalRunner) {
  Set-Location -LiteralPath $repoRoot
  & npx tsx $trainingDataScript run-loop --metadata-file $MetadataFile --pg-password-file $PgPasswordFile
  exit $LASTEXITCODE
}

Require-Command node
Require-Command npm.cmd
Require-Command npx.cmd
Require-Command git
Require-Command psql
Require-Command tar
Require-Command powershell

$tmpMetadata = Join-Path $env:TEMP ("tichuml-training-metadata-" + [guid]::NewGuid().ToString("N") + ".json")
try {
  $prepareArgs = @(
    "tsx", $trainingDataScript, "prepare-run",
    "--repo-root", $repoRoot,
    "--training-runs-root", (Join-Path $repoRoot "training-runs"),
    "--export-root", $env:TEMP,
    "--archive-root", $env:TEMP,
    "--provider", $Provider,
    "--games-per-batch", "$Games",
    "--backend-url", $BackendUrl,
    "--strict-telemetry", "$StrictTelemetry",
    "--telemetry-mode", "full",
    "--decision-timeout-ms", "$DecisionTimeoutMs",
    "--pg-host", $PgHost,
    "--pg-port", $PgPort,
    "--pg-user", $PgUser,
    "--pg-db", $PgDb,
    "--clear-database", ($(if ($NoClear) { "false" } else { "true" })),
    "--ml-export-check-enabled", ($(if ($SkipMlExportCheck) { "false" } else { "true" })),
    "--ml-export-command", $MlExportCommand
  )
  if (-not [string]::IsNullOrWhiteSpace($SessionName)) {
    $prepareArgs += @("--session-name", $SessionName)
  }
  $prepareResult = Invoke-ProcessCapture -FilePath "npx.cmd" -ArgumentList $prepareArgs
  $prepareStdout = Normalize-CommandOutput -Value $prepareResult.Stdout
  $prepareStderr = Normalize-CommandOutput -Value $prepareResult.Stderr
  if ($prepareResult.ExitCode -ne 0) {
    $previewText = if (-not [string]::IsNullOrWhiteSpace($prepareStderr)) { $prepareStderr } else { $prepareStdout }
    throw "Training metadata preparation failed. Output preview: $(Get-OutputPreview -Text $previewText)"
  }
  if ([string]::IsNullOrWhiteSpace($prepareStdout)) {
    throw "Training metadata preparation failed. No JSON metadata was returned."
  }
  try {
    $null = $prepareStdout | ConvertFrom-Json
  } catch {
    throw "Training metadata preparation failed. Output was not valid JSON. Preview: $(Get-OutputPreview -Text $prepareStdout)"
  }
  $prepareStdout | Set-Content -Path $tmpMetadata -Encoding UTF8

  $runId = Get-HelperJsonValue -FilePath $tmpMetadata -Key "run_id"
  $sessionNameResolved = Get-HelperJsonValue -FilePath $tmpMetadata -Key "session_name"
  $gameIdPrefix = Get-HelperJsonValue -FilePath $tmpMetadata -Key "game_id_prefix"
  $runDir = Get-HelperJsonValue -FilePath $tmpMetadata -Key "run_directory"
  $archivePath = Get-HelperJsonValue -FilePath $tmpMetadata -Key "archive_path"
  $metadataPath = Get-HelperJsonValue -FilePath $tmpMetadata -Key "metadata_file"
  $commandsFile = Get-HelperJsonValue -FilePath $tmpMetadata -Key "commands_file"
  $stopFile = Get-HelperJsonValue -FilePath $tmpMetadata -Key "stop_file"
  $pidFile = Get-HelperJsonValue -FilePath $tmpMetadata -Key "pid_file"
  $passwordFile = Join-Path (Split-Path $stopFile -Parent) "pg-password.txt"
  $modeLabel = if ($NoClear) { "NO-CLEAR APPEND MODE" } else { "CLEAR DATABASE MODE" }

  $existing = Find-TrainingMetadataBySession -RepoRoot $repoRoot -Name $sessionNameResolved
  if ($existing) {
    if ($ReplaceSession) {
      & powershell -ExecutionPolicy Bypass -File $stopTrainingScript -SessionName $sessionNameResolved -Force | Out-Host
    } else {
      throw "Session already exists: $sessionNameResolved`nStop: scripts\windows\stop-training-data.ps1 -SessionName $sessionNameResolved"
    }
  }

  if ($DryRun) {
    Write-Host $modeLabel
    Write-Host "Resolved repo root: $repoRoot"
    Write-Host "Session name: $sessionNameResolved"
    Write-Host "Run ID: $runId"
    Write-Host "Game ID prefix: $gameIdPrefix"
    Write-Host "Run directory: $runDir"
    Write-Host "Archive path: $archivePath"
    Write-Host "Decision timeout ms: $DecisionTimeoutMs"
    Write-Host "Decision request mode: fast_path_default"
    Write-Host "Clear SQL: TRUNCATE TABLE events, decisions, matches RESTART IDENTITY CASCADE;"
    Write-Host "Scoped export filter: game_id LIKE '$gameIdPrefix%'"
    Write-Host "ML export validation command: npm run ml:export -- --validate-only --run-id $runId --game-id-prefix $gameIdPrefix --output-dir training-runs\$runId\ml"
    Write-Host "Suggested manual ml:export command: npm run ml:export -- --run-id $runId --game-id-prefix $gameIdPrefix --output-dir training-runs\$runId\ml"
    Write-Host "Expected LightGBM files: train.parquet|train.csv.gz, dataset_metadata.json, feature_schema.json, feature_columns.json, label_columns.json"
    Write-Host "Watch runner: Get-Content -Path ""training-runs\$runId\run.log"" -Wait"
    Write-Host "Stop command: scripts\windows\stop-training-data.ps1 -SessionName $sessionNameResolved"
    try {
      $dryDbArgs = @(
        "tsx", $trainingDataScript, "prepare-database",
        "--metadata-file", $tmpMetadata,
        "--pg-password", $PgPassword,
        "--dry-run",
        "--allow-unhealthy-backend", "$AllowUnhealthyBackend"
      )
      if ($AllowClearDbName) {
        $dryDbArgs += @("--allow-clear-db-name", $AllowClearDbName)
      }
      & npx @dryDbArgs | Out-Host
    } catch {
      Write-Warning "Dry-run database validation could not complete with current backend/Postgres state."
    }
    return
  }

  New-Item -ItemType Directory -Force -Path $runDir, (Split-Path $stopFile -Parent) | Out-Null
  $prepareStdout | Set-Content -Path $metadataPath -Encoding UTF8
  $PgPassword | Set-Content -Path $passwordFile -Encoding UTF8
  New-Item -ItemType File -Force -Path (Join-Path $runDir "run.log"), (Join-Path $runDir "verification.log"), (Join-Path $runDir "ml_export_check.log") | Out-Null
  Write-CommandsFile -FilePath $commandsFile -RunId $runId -GameIdPrefix $gameIdPrefix -SessionNameValue $sessionNameResolved

  $dbArgs = @(
    "tsx", $trainingDataScript, "prepare-database",
    "--metadata-file", $metadataPath,
    "--pg-password-file", $passwordFile,
    "--allow-unhealthy-backend", "$AllowUnhealthyBackend"
  )
  if ($AllowClearDbName) {
    $dbArgs += @("--allow-clear-db-name", $AllowClearDbName)
  }
  & npx @dbArgs
  if ($LASTEXITCODE -ne 0) { throw "Database preparation failed." }

  $hostExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
  $runnerArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $selfScriptPath,
    "-InternalRunner",
    "-MetadataFile", $metadataPath,
    "-PgPasswordFile", $passwordFile
  )
  $process = Start-Process -FilePath $hostExe -ArgumentList $runnerArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
  $process.Id | Set-Content -Path $pidFile -Encoding UTF8

  Write-Host $modeLabel
  Write-Host "Training job started: $sessionNameResolved"
  Write-Host "Run ID: $runId"
  Write-Host "Game ID prefix: $gameIdPrefix"
  Write-Host "Watch runner: Get-Content -Path ""training-runs\$runId\run.log"" -Wait"
  Write-Host "Watch verifier: Get-Content -Path ""training-runs\$runId\verification.log"" -Wait"
  Write-Host "Watch ML export compatibility check: Get-Content -Path ""training-runs\$runId\ml_export_check.log"" -Wait"
  Write-Host "Stop: scripts\windows\stop-training-data.ps1 -SessionName $sessionNameResolved"
  Write-Host "Export path: $archivePath"

  if ($Attach) {
    Get-Content -Path (Join-Path $runDir "run.log") -Wait
  }
} finally {
  if (Test-Path $tmpMetadata) {
    Remove-Item -LiteralPath $tmpMetadata -Force -ErrorAction SilentlyContinue
  }
}
