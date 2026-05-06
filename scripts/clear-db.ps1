Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "common.ps1")

function Show-Usage {
@"
Usage:
  scripts\clear-db.ps1 --yes

Purpose:
  Clears application data from the existing Postgres database without dropping
  the database, container, schema, roles, extensions, or migration bookkeeping.

Options:
  --yes           Required destructive confirmation.
  --help, -help   Show this help text.

Environment:
  Uses DATABASE_URL from the current environment when explicitly set.
  Otherwise reads DATABASE_URL from .env at the repo root.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\clear-db.ps1 --yes
  `$env:DATABASE_URL = "postgres://user:pw@localhost:5432/tichu"
  powershell -ExecutionPolicy Bypass -File scripts\clear-db.ps1 --yes
"@ | Write-Host
}

function ConvertTo-SafeDatabaseUrl {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  return ($Value -replace "//([^:/@]+):([^@/]+)@", '//$1:***@')
}

function Get-DatabaseUrlFromDotEnv {
  param([string]$RepoRoot)

  $envPath = Join-Path $RepoRoot ".env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw ".env file is missing: $envPath"
  }

  foreach ($line in Get-Content -LiteralPath $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }
    if ($trimmed.StartsWith("DATABASE_URL=")) {
      $value = $trimmed.Substring("DATABASE_URL=".Length).Trim()
      return $value.Trim('"')
    }
  }

  throw "DATABASE_URL is missing from $envPath"
}

function Test-MigrationTable {
  param([string]$TableName)

  $value = $TableName.ToLowerInvariant()
  if ($value -in @(
      "schema_migrations",
      "__drizzle_migrations",
      "drizzle_migrations",
      "knex_migrations",
      "knex_migrations_lock",
      "flyway_schema_history",
      "alembic_version",
      "typeorm_metadata",
      "django_migrations",
      "sequelize_meta",
      "goose_db_version"
    )) {
    return $true
  }

  return $value.Contains("migration") -or $value.Contains("schema_history")
}

function Invoke-Psql {
  param(
    [string]$DatabaseUrl,
    [string]$Sql
  )

  $output = & psql $DatabaseUrl "--no-psqlrc" "-v" "ON_ERROR_STOP=1" "-At" "-c" $Sql
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
  }
  return @($output)
}

$confirm = $false
foreach ($arg in $args) {
  switch ($arg.ToLowerInvariant()) {
    "--yes" { $confirm = $true; continue }
    "--help" { Show-Usage; exit 0 }
    "-help" { Show-Usage; exit 0 }
    default {
      Write-Error "Unknown clear-db option: $arg"
      Show-Usage
      exit 2
    }
  }
}

if (-not $confirm) {
  Write-Error "Refusing to clear database data without --yes."
  exit 2
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "Required command missing: psql"
}

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$databaseUrl =
  if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
    $env:DATABASE_URL
  } else {
    Get-DatabaseUrlFromDotEnv -RepoRoot $repoRoot
  }

$tableDiscoverySql = "SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname ASC, tablename ASC;"

$discoveredTables = @(Invoke-Psql -DatabaseUrl $databaseUrl -Sql $tableDiscoverySql | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$tablesToClear = New-Object System.Collections.Generic.List[string]
$preservedTables = New-Object System.Collections.Generic.List[string]

foreach ($table in $discoveredTables) {
  $bareName = ($table -split "\.")[-1].Replace('"', "")
  if (Test-MigrationTable -TableName $bareName) {
    $preservedTables.Add($table) | Out-Null
  } else {
    $tablesToClear.Add($table) | Out-Null
  }
}

Write-Host ("[INFO] Repo root: {0}" -f $repoRoot)
Write-Host ("[INFO] Database URL: {0}" -f (ConvertTo-SafeDatabaseUrl $databaseUrl))
Write-Host "Tables to clear:"
if ($tablesToClear.Count -eq 0) {
  Write-Host "  (none)"
} else {
  foreach ($table in $tablesToClear) {
    Write-Host ("  {0}" -f $table)
  }
}

if ($preservedTables.Count -gt 0) {
  Write-Host "Preserved migration tables:"
  foreach ($table in $preservedTables) {
    Write-Host ("  {0}" -f $table)
  }
}

if ($tablesToClear.Count -eq 0) {
  Write-Host "[OK] No application tables needed clearing."
  exit 0
}

$truncateSql = "TRUNCATE TABLE {0} RESTART IDENTITY CASCADE;" -f ($tablesToClear -join ", ")
Write-Host "[INFO] Clearing application tables with TRUNCATE ... RESTART IDENTITY CASCADE."
[void](Invoke-Psql -DatabaseUrl $databaseUrl -Sql $truncateSql)

Write-Host "Row counts after clear:"
$nonZeroCounts = @()
foreach ($table in $tablesToClear) {
  $count = (Invoke-Psql -DatabaseUrl $databaseUrl -Sql ("SELECT COUNT(*) FROM {0};" -f $table) | Select-Object -First 1).Trim()
  Write-Host ("  {0}: {1}" -f $table, $count)
  if ($count -ne "0") {
    $nonZeroCounts += $table
  }
}

if ($nonZeroCounts.Count -gt 0) {
  throw "One or more cleared tables still contain rows: $($nonZeroCounts -join ', ')"
}

Write-Host "[OK] Application data tables were cleared without touching schema or migration bookkeeping."
