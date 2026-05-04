$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows\\common.ps1")

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$target = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\verify-sim-one-game-fixed.ps1" -Description "Simulator verification launcher"
& $target @args
exit $LASTEXITCODE
