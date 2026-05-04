Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  param([string]$BaseDir = $PSScriptRoot)

  $current = (Resolve-Path -LiteralPath $BaseDir).Path
  while ($true) {
    if (Test-Path -LiteralPath (Join-Path $current "package.json")) {
      return $current
    }

    $parent = Split-Path -Parent $current
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) {
      break
    }

    $current = $parent
  }

  throw "Could not resolve repo root from $BaseDir"
}

function Assert-RepoRoot {
  param([string]$RepoRoot)

  if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Resolved repo root does not exist: $RepoRoot"
  }

  $packageJson = Join-Path $RepoRoot "package.json"
  if (-not (Test-Path -LiteralPath $packageJson)) {
    throw "Resolved repo root is missing package.json: $RepoRoot"
  }
}

function Resolve-RepoPath {
  param(
    [string]$RepoRoot,
    [string]$RelativePath
  )

  Assert-RepoRoot -RepoRoot $RepoRoot
  return (Join-Path $RepoRoot $RelativePath)
}

function Assert-RepoPath {
  param(
    [string]$RepoRoot,
    [string]$RelativePath,
    [string]$Description = "Required repo path"
  )

  $resolved = Resolve-RepoPath -RepoRoot $RepoRoot -RelativePath $RelativePath
  if (-not (Test-Path -LiteralPath $resolved)) {
    throw "${Description} is missing: $resolved"
  }

  return $resolved
}

function Enter-RepoRoot {
  param([string]$BaseDir = $PSScriptRoot)

  $repoRoot = Get-RepoRoot -BaseDir $BaseDir
  Assert-RepoRoot -RepoRoot $repoRoot
  Set-Location -LiteralPath $repoRoot
  return $repoRoot
}

function Invoke-WindowsScriptTarget {
  param(
    [string]$BaseDir,
    [string]$TargetRelativePath,
    [string[]]$ArgumentList = @()
  )

  $repoRoot = Enter-RepoRoot -BaseDir $BaseDir
  $targetPath = Assert-RepoPath -RepoRoot $repoRoot -RelativePath $TargetRelativePath -Description "Target script"
  & $targetPath @ArgumentList
  return $LASTEXITCODE
}
