[CmdletBinding()]
param(
  [string]$SessionName,
  [int]$Games = 1000,
  [string]$Provider = "server_heuristic",
  [string]$BackendUrl = "http://127.0.0.1:4310",
  [bool]$StrictTelemetry = $false,
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
  [switch]$InternalRunner,
  [string]$MetadataFile,
  [string]$PgPasswordFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
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

$repoRoot = Get-RepoRoot

if ($InternalRunner) {
  Set-Location $repoRoot
  & npx tsx scripts/training-data.ts run-loop --metadata-file $MetadataFile --pg-password-file $PgPasswordFile
  exit $LASTEXITCODE
}

Require-Command node
Require-Command npm
Require-Command npx
Require-Command git
Require-Command psql
Require-Command tar
Require-Command powershell

$tmpMetadata = Join-Path $env:TEMP ("tichuml-training-metadata-" + [guid]::NewGuid().ToString("N") + ".json")
try {
  $prepareArgs = @(
    "tsx", "scripts/training-data.ts", "prepare-run",
    "--repo-root", $repoRoot,
    "--training-runs-root", (Join-Path $repoRoot "training-runs"),
    "--export-root", $env:TEMP,
    "--archive-root", $env:TEMP,
    "--provider", $Provider,
    "--games-per-batch", "$Games",
    "--backend-url", $BackendUrl,
    "--strict-telemetry", "$StrictTelemetry",
    "--telemetry-mode", "full",
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
  $prepareJson = & npx @prepareArgs
  $prepareJson | Set-Content -Path $tmpMetadata -Encoding UTF8

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
      & powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\windows\stop-training-data.ps1") -SessionName $sessionNameResolved -Force | Out-Host
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
    Write-Host "Clear SQL: TRUNCATE TABLE events, decisions, matches RESTART IDENTITY CASCADE;"
    Write-Host "Scoped export filter: game_id LIKE '$gameIdPrefix%'"
    Write-Host "ML export validation command: npm run ml:export -- --validate-only --run-id $runId --game-id-prefix $gameIdPrefix --output-dir training-runs\$runId\ml"
    Write-Host "Suggested manual ml:export command: npm run ml:export -- --run-id $runId --game-id-prefix $gameIdPrefix --output-dir training-runs\$runId\ml"
    Write-Host "Expected LightGBM files: train.parquet|train.csv.gz, dataset_metadata.json, feature_schema.json, feature_columns.json, label_columns.json"
    Write-Host "Watch runner: Get-Content -Path ""training-runs\$runId\run.log"" -Wait"
    Write-Host "Stop command: scripts\windows\stop-training-data.ps1 -SessionName $sessionNameResolved"
    try {
      $dryDbArgs = @(
        "tsx", "scripts/training-data.ts", "prepare-database",
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
  $prepareJson | Set-Content -Path $metadataPath -Encoding UTF8
  $PgPassword | Set-Content -Path $passwordFile -Encoding UTF8
  New-Item -ItemType File -Force -Path (Join-Path $runDir "run.log"), (Join-Path $runDir "verification.log"), (Join-Path $runDir "ml_export_check.log") | Out-Null
  Write-CommandsFile -FilePath $commandsFile -RunId $runId -GameIdPrefix $gameIdPrefix -SessionNameValue $sessionNameResolved

  $dbArgs = @(
    "tsx", "scripts/training-data.ts", "prepare-database",
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
    "-File", (Join-Path $repoRoot "scripts\windows\start-training-data.ps1"),
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
