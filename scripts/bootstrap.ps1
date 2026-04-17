param(
  [switch]$Dev
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Import-EnvFile([string]$Path) {
  Get-Content $Path | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_) -or $_.Trim().StartsWith("#")) {
      return
    }

    $parts = $_ -split "=", 2
    if ($parts.Length -ne 2) {
      return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Step "Checking prerequisites"
Require-Command "node"
Require-Command "npm"
Require-Command "docker"

if (-not (Test-Path ".env")) {
  Write-Step "Creating .env from .env.example"
  Copy-Item ".env.example" ".env"
}

Import-EnvFile ".env"

Write-Step "Installing workspace dependencies"
npm install

$composeArgs = @(
  "compose",
  "-f",
  "infra/docker/docker-compose.yml",
  "--env-file",
  ".env"
)

Write-Step "Starting Postgres via Docker"
docker @composeArgs up -d postgres

$postgresUser = $env:POSTGRES_USER
if ([string]::IsNullOrWhiteSpace($postgresUser)) {
  $postgresUser = "postgres"
}

$postgresDb = $env:POSTGRES_DB
if ([string]::IsNullOrWhiteSpace($postgresDb)) {
  $postgresDb = "tichuml"
}

Write-Step "Waiting for Postgres readiness"
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  try {
    docker @composeArgs exec -T postgres pg_isready -U $postgresUser -d $postgresDb | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
    continue
  }

  Start-Sleep -Seconds 2
}

if (-not $ready) {
  throw "Postgres did not report ready within the timeout window."
}

Write-Step "Running database migrations"
npm run db:migrate

if ($Dev) {
  Write-Step "Starting backend server in watch mode"
  npm run dev:server
  exit $LASTEXITCODE
}

Write-Step "Building shared packages required by the server"
npm run build:shared
npm run build:engine
npm run build:telemetry
npm run build:ai
npm run build:server

Write-Step "Starting backend server"
npm run start:server
