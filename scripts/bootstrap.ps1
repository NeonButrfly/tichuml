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

function Wait-ForDocker {
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    try {
      docker info | Out-Null
      if ($LASTEXITCODE -eq 0) {
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Docker did not become ready within the timeout window."
}

function Ensure-DockerRunning {
  try {
    docker info | Out-Null
    if ($LASTEXITCODE -eq 0) {
      return
    }
  } catch {
    $dockerDesktopCandidates = @(
      "$Env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe",
      "$Env:LocalAppData\\Docker\\Docker Desktop.exe"
    )
    $dockerDesktop = $dockerDesktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($dockerDesktop) {
      Write-Step "Starting Docker Desktop"
      Start-Process -FilePath $dockerDesktop | Out-Null
    }
  }

  Wait-ForDocker
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
Require-Command "python"

if (-not (Test-Path ".env")) {
  Write-Step "Creating .env from .env.example"
  Copy-Item ".env.example" ".env"
}

Import-EnvFile ".env"

Write-Step "Ensuring Docker is running"
Ensure-DockerRunning

Write-Step "Installing workspace dependencies"
npm install

$composeArgs = @(
  "compose",
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

Write-Step "Preparing Python virtual environment"
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

$venvPython = Join-Path $repoRoot ".venv\\Scripts\\python.exe"
if (-not (Test-Path $venvPython)) {
  throw "Expected Python virtual environment interpreter at $venvPython."
}

Write-Step "Installing ML dependencies"
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r "ml/requirements.txt"

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
