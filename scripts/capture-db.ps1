Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "common.ps1")

$ScriptVersion = "1.0.0"
$DefaultOutRel = ".runtime/db-captures"
$DefaultSplitSize = "500m"

function Show-Usage {
@"
Usage:
  scripts\capture-db.ps1 [options]

Purpose:
  Creates a restoreable PostgreSQL capture plus redacted diagnostics that can
  be inspected without restoring the dump first.

Options:
  -Label <name>          Optional label added to the capture folder/archive name.
  -Out <path>            Output directory. Default: .runtime/db-captures
  -Split <size>          7z volume size. Default: 500m
  -NoSplit               Disable 7z volume splitting.
  -RemoveStaging         Remove the staging directory after a successful archive.
  -Reason <text>         Optional short capture reason written into run-notes.txt.
  -Notes <text>          Optional freeform notes written into run-notes.txt.
  -Help, --help, -h      Show this help text.

Environment:
  Uses DATABASE_URL from the current environment when explicitly set.
  Otherwise reads DATABASE_URL from the repo-root .env file.

Outputs:
  Creates a timestamped staging directory and 7z archive under the output
  directory. The staging directory contains db.dump, db-schema.sql, redacted
  environment metadata, DB summaries, git metadata, restore instructions,
  checksums, and a machine-readable manifest.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\capture-db.ps1
  powershell -ExecutionPolicy Bypass -File scripts\capture-db.ps1 -Label post-fix-clean-run -Reason "after write amplification repair"
  powershell -ExecutionPolicy Bypass -File scripts\capture-db.ps1 -Out C:\captures -Split 250m
  `$env:DATABASE_URL = "postgres://user:pw@localhost:5432/tichu"
  powershell -ExecutionPolicy Bypass -File scripts\capture-db.ps1 -NoSplit
"@ | Write-Host
}

function Get-DatabaseUrlFromDotEnv {
  param([string]$RepoRoot)

  return Get-DotEnvValue -RepoRoot $RepoRoot -Key "DATABASE_URL"
}

function Get-DotEnvValue {
  param(
    [string]$RepoRoot,
    [string]$Key
  )

  $envPath = Join-Path $RepoRoot ".env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw ".env file is missing: $envPath"
  }

  foreach ($line in Get-Content -LiteralPath $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    if ($trimmed.StartsWith("${Key}=")) {
      $value = $trimmed.Substring($Key.Length + 1).Trim()
      return $value.Trim('"')
    }
  }

  throw "$Key is missing from $envPath"
}

function Get-SafeLabel {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $safe = [regex]::Replace($Value, "[^A-Za-z0-9]+", "-").Trim("-")
  return $safe.ToLowerInvariant()
}

function Get-SevenZipPath {
  foreach ($commandName in @("7z", "7z.exe")) {
    $fromPath = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($fromPath) {
      return $fromPath.Source
    }
  }

  foreach ($candidate in @(
      "C:\Program Files\7-Zip\7z.exe",
      "C:\Program Files (x86)\7-Zip\7z.exe"
    )) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw "Required command missing: 7z.exe"
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command missing: $Name"
  }
}

function Write-StageChecksums {
  param([string]$StagingDir)

  $checksumFile = Join-Path $StagingDir "checksums.txt"
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("# Staging files before archive") | Out-Null
  $files = @(Get-ChildItem -LiteralPath $StagingDir -File | Where-Object Name -ne "checksums.txt" | Sort-Object Name)
  foreach ($file in $files) {
    $hash = Get-Sha256Hash -Path $file.FullName
    $lines.Add(("{0}  {1}" -f $hash, $file.FullName)) | Out-Null
  }
  Set-Content -LiteralPath $checksumFile -Value $lines -Encoding utf8
}

function Append-ArchiveChecksums {
  param(
    [string]$ChecksumFile,
    [string[]]$ArchiveFiles
  )

  Add-Content -LiteralPath $ChecksumFile -Value ""
  Add-Content -LiteralPath $ChecksumFile -Value "# Archive files after archive creation"
  foreach ($archiveFile in $ArchiveFiles) {
    $hash = Get-Sha256Hash -Path $archiveFile
    Add-Content -LiteralPath $ChecksumFile -Value (("{0}  {1}" -f $hash, $archiveFile))
  }
}

function Append-ManifestChecksum {
  param(
    [string]$ChecksumFile,
    [string]$ManifestFile
  )

  $hash = Get-Sha256Hash -Path $ManifestFile
  Add-Content -LiteralPath $ChecksumFile -Value ""
  Add-Content -LiteralPath $ChecksumFile -Value "# Manifest after archive finalization"
  Add-Content -LiteralPath $ChecksumFile -Value (("{0}  {1}" -f $hash, $ManifestFile))
}

function Get-Sha256Hash {
  param([string]$Path)

  $hashCommand = Get-Command Get-FileHash -ErrorAction SilentlyContinue
  if ($hashCommand) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $sha.ComputeHash($stream)
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }

  return ([System.BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant())
}

function Build-CommandLine {
  param([string[]]$OriginalArgs)

  $parts = New-Object System.Collections.Generic.List[string]
  $parts.Add("powershell -ExecutionPolicy Bypass -File scripts\capture-db.ps1") | Out-Null
  foreach ($arg in $OriginalArgs) {
    $escaped = $arg.Replace('"', '\"')
    if ($escaped -match "\s") {
      $parts.Add(('"{0}"' -f $escaped)) | Out-Null
    } else {
      $parts.Add($escaped) | Out-Null
    }
  }
  return ($parts -join " ")
}

function Get-DatabaseUrlField {
  param(
    [string]$DatabaseUrl,
    [string]$Field
  )

  $uri = [System.Uri]$DatabaseUrl
  switch ($Field) {
    "host" { return $uri.Host }
    "user" {
      $userInfo = $uri.UserInfo
      if ([string]::IsNullOrWhiteSpace($userInfo)) { return "" }
      return [System.Uri]::UnescapeDataString(($userInfo -split ":", 2)[0])
    }
    "database" {
      return [System.Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
    }
    default { throw "Unsupported database URL field: $Field" }
  }
}

function Get-PgDumpMajorVersion {
  param([string]$CommandPath = "pg_dump")

  try {
    $versionOutput = & $CommandPath --version 2>$null
  } catch {
    return $null
  }
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  $text = (($versionOutput -join " ").Trim())
  $match = [regex]::Match($text, "PostgreSQL\)\s+(?<major>\d+)")
  if (-not $match.Success) {
    return $null
  }

  return $match.Groups["major"].Value
}

function Get-ServerMajorVersion {
  param([string]$DatabaseUrl)

  try {
    $versionOutput = & psql $DatabaseUrl "--no-psqlrc" "-At" "-c" "SHOW server_version;" 2>$null
  } catch {
    return $null
  }
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  $text = (($versionOutput -join " ").Trim())
  $match = [regex]::Match($text, "^(?<major>\d+)")
  if (-not $match.Success) {
    return $null
  }

  return $match.Groups["major"].Value
}

function Test-DockerPgDumpUsable {
  param([string]$ContainerName)

  if ([string]::IsNullOrWhiteSpace($ContainerName)) {
    return $false
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    return $false
  }

  & docker exec $ContainerName pg_dump --version *> $null
  return ($LASTEXITCODE -eq 0)
}

function Invoke-ContainerPgDump {
  param(
    [string]$ContainerName,
    [string]$DatabaseUser,
    [string]$DatabaseName,
    [string]$OutputPath,
    [string[]]$ExtraArguments = @()
  )

  $tempName = "{0}-{1}" -f $captureBaseName, [System.IO.Path]::GetFileName($OutputPath)
  $tempPath = "/tmp/$tempName"
  & docker exec $ContainerName rm -f $tempPath *> $null
  & docker exec $ContainerName pg_dump "-U" $DatabaseUser "-d" $DatabaseName @ExtraArguments "-f" $tempPath
  if ($LASTEXITCODE -ne 0) {
    throw "dockerized pg_dump failed for $OutputPath"
  }
  & docker cp "${ContainerName}:${tempPath}" $OutputPath *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "docker cp failed while retrieving $OutputPath"
  }
  & docker exec $ContainerName rm -f $tempPath *> $null
}

$label = ""
$outDir = $DefaultOutRel
$splitSize = $DefaultSplitSize
$noSplit = $false
$removeStaging = $false
$reason = ""
$notes = ""
$originalArgs = @($args)

for ($index = 0; $index -lt $args.Count; $index += 1) {
  $arg = [string]$args[$index]
  switch ($arg.ToLowerInvariant()) {
    "-label" {
      if ($index + 1 -ge $args.Count) { throw "Missing value for -Label" }
      $label = [string]$args[$index + 1]
      $index += 1
    }
    "-out" {
      if ($index + 1 -ge $args.Count) { throw "Missing value for -Out" }
      $outDir = [string]$args[$index + 1]
      $index += 1
    }
    "-split" {
      if ($index + 1 -ge $args.Count) { throw "Missing value for -Split" }
      $splitSize = [string]$args[$index + 1]
      $index += 1
    }
    "-nosplit" { $noSplit = $true }
    "-removestaging" { $removeStaging = $true }
    "-reason" {
      if ($index + 1 -ge $args.Count) { throw "Missing value for -Reason" }
      $reason = [string]$args[$index + 1]
      $index += 1
    }
    "-notes" {
      if ($index + 1 -ge $args.Count) { throw "Missing value for -Notes" }
      $notes = [string]$args[$index + 1]
      $index += 1
    }
    "-help" { Show-Usage; exit 0 }
    "--help" { Show-Usage; exit 0 }
    "-h" { Show-Usage; exit 0 }
    default {
      throw "Unknown capture-db option: $arg"
    }
  }
}

Require-Command -Name node
Require-Command -Name pg_dump
Require-Command -Name psql
$sevenZip = Get-SevenZipPath

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$databaseUrl =
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    $env:DATABASE_URL
  } else {
    Get-DatabaseUrlFromDotEnv -RepoRoot $repoRoot
  }
$postgresContainerName =
  if (-not [string]::IsNullOrWhiteSpace($env:POSTGRES_CONTAINER_NAME)) {
    $env:POSTGRES_CONTAINER_NAME
  } else {
    try {
      Get-DotEnvValue -RepoRoot $repoRoot -Key "POSTGRES_CONTAINER_NAME"
    } catch {
      "tichu-postgres"
    }
  }
$databaseHost = Get-DatabaseUrlField -DatabaseUrl $databaseUrl -Field "host"
$databaseUser = Get-DatabaseUrlField -DatabaseUrl $databaseUrl -Field "user"
$databaseName = Get-DatabaseUrlField -DatabaseUrl $databaseUrl -Field "database"

$outTarget =
  if ([System.IO.Path]::IsPathRooted($outDir)) {
    $outDir
  } else {
    Join-Path $repoRoot $outDir
  }
$outDirFull = [System.IO.Path]::GetFullPath($outTarget)
[System.IO.Directory]::CreateDirectory($outDirFull) | Out-Null
$localTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$createdLocal = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
$createdUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$safeLabel = Get-SafeLabel -Value $label

$captureBaseName = "tichuml-db-capture-$localTimestamp"
if (-not [string]::IsNullOrWhiteSpace($safeLabel)) {
  $captureBaseName = "${captureBaseName}-${safeLabel}"
}

$stagingDir = Join-Path $outDirFull $captureBaseName
$archivePath = Join-Path $outDirFull ("{0}.7z" -f $captureBaseName)
$manifestSplitSize = if ($noSplit) { "none" } else { $splitSize }
$coreScript = Join-Path $PSScriptRoot "capture-db-core.mjs"

if (Test-Path -LiteralPath $stagingDir) {
  throw "Capture staging directory already exists: $stagingDir"
}
if ((Test-Path -LiteralPath $archivePath) -or @(Get-ChildItem -LiteralPath $outDirFull -Filter ("{0}.7z*" -f $captureBaseName) -ErrorAction SilentlyContinue).Count -gt 0) {
  throw "Capture archive path already exists: $archivePath"
}
if (-not (Test-Path -LiteralPath $coreScript)) {
  throw "capture-db core script is missing: $coreScript"
}

[System.IO.Directory]::CreateDirectory($stagingDir) | Out-Null
$commandLine = Build-CommandLine -OriginalArgs $originalArgs

Write-Host ("[INFO] Repo root: {0}" -f $repoRoot)
Write-Host ("[INFO] Capture output directory: {0}" -f $outDirFull)
Write-Host ("[INFO] Capture staging directory: {0}" -f $stagingDir)
Write-Host ("[INFO] Archive path: {0}" -f $archivePath)
Write-Host "[INFO] Snapshot note: active writers may make the capture non-quiescent."

$serverMajor = Get-ServerMajorVersion -DatabaseUrl $databaseUrl
$localPgDumpMajor = Get-PgDumpMajorVersion
$useDockerPgDump =
  $databaseHost -in @("localhost", "127.0.0.1", "::1") -and
  -not [string]::IsNullOrWhiteSpace($serverMajor) -and
  -not [string]::IsNullOrWhiteSpace($localPgDumpMajor) -and
  $serverMajor -ne $localPgDumpMajor -and
  (Test-DockerPgDumpUsable -ContainerName $postgresContainerName)

if ($useDockerPgDump) {
  Write-Host ("[INFO] Using dockerized pg_dump from {0} because local pg_dump major {1} differs from server major {2}." -f $postgresContainerName, $localPgDumpMajor, $serverMajor)
  Invoke-ContainerPgDump -ContainerName $postgresContainerName -DatabaseUser $databaseUser -DatabaseName $databaseName -OutputPath (Join-Path $stagingDir "db.dump") -ExtraArguments @("-Fc")
  Invoke-ContainerPgDump -ContainerName $postgresContainerName -DatabaseUser $databaseUser -DatabaseName $databaseName -OutputPath (Join-Path $stagingDir "db-schema.sql") -ExtraArguments @("--schema-only")
} else {
  & pg_dump $databaseUrl "-Fc" "-f" (Join-Path $stagingDir "db.dump")
  if ($LASTEXITCODE -ne 0) { throw "pg_dump custom-format dump failed with exit code $LASTEXITCODE" }

  & pg_dump $databaseUrl "--schema-only" "-f" (Join-Path $stagingDir "db-schema.sql")
  if ($LASTEXITCODE -ne 0) { throw "pg_dump schema-only dump failed with exit code $LASTEXITCODE" }
}

$collectArgs = @(
  $coreScript,
  "collect",
  "--repo-root", $repoRoot,
  "--staging-dir", $stagingDir,
  "--database-url", $databaseUrl,
  "--created-utc", $createdUtc,
  "--created-local", $createdLocal,
  "--capture-id", $captureBaseName,
  "--label", $label,
  "--reason", $reason,
  "--notes", $notes,
  "--split-size", $manifestSplitSize,
  "--command-line", $commandLine,
  "--script-version", $ScriptVersion,
  "--archive-base-name", ("{0}.7z" -f $captureBaseName),
  "--archive-path", $archivePath
)
& node @collectArgs
if ($LASTEXITCODE -ne 0) { throw "capture-db core collect step failed with exit code $LASTEXITCODE" }

Write-StageChecksums -StagingDir $stagingDir

Push-Location $outDirFull
try {
  $archiveArgs = @("a", "-t7z")
  if (-not $noSplit) {
    $archiveArgs += ("-v{0}" -f $splitSize)
  }
  $archiveArgs += @($archivePath, $captureBaseName)
  & $sevenZip @archiveArgs | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "7z archive creation failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$archiveFiles =
  if ($noSplit) {
    @($archivePath)
  } else {
    @(Get-ChildItem -LiteralPath $outDirFull -Filter ("{0}.7z.*" -f $captureBaseName) | Sort-Object Name | Select-Object -ExpandProperty FullName)
  }

if ($archiveFiles.Count -eq 0) {
  throw "Archive creation succeeded but no archive files were found for $archivePath"
}

$finalizeArgs = @(
  $coreScript,
  "finalize-manifest",
  "--manifest", (Join-Path $stagingDir "manifest.json"),
  "--split-size", $manifestSplitSize
)
foreach ($archiveFile in $archiveFiles) {
  $finalizeArgs += @("--archive-file", $archiveFile)
}
& node @finalizeArgs
if ($LASTEXITCODE -ne 0) { throw "capture-db core finalize step failed with exit code $LASTEXITCODE" }

$checksumFile = Join-Path $stagingDir "checksums.txt"
Append-ArchiveChecksums -ChecksumFile $checksumFile -ArchiveFiles $archiveFiles
Append-ManifestChecksum -ChecksumFile $checksumFile -ManifestFile (Join-Path $stagingDir "manifest.json")

if ($removeStaging) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}

Write-Host ""
Write-Host "Capture summary"
Write-Host "---------------"
Write-Host ("Capture id: {0}" -f $captureBaseName)
Write-Host ("Label: {0}" -f $(if ($label) { $label } else { "<none>" }))
Write-Host ("Staging directory: {0}" -f $stagingDir)
Write-Host "Archive files:"
foreach ($archiveFile in $archiveFiles) {
  Write-Host ("  {0}" -f $archiveFile)
}
Write-Host ("Split size: {0}" -f $manifestSplitSize)
Write-Host ("Remove staging: {0}" -f $removeStaging.ToString().ToLowerInvariant())
