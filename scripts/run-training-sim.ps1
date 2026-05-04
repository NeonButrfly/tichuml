$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows\\common.ps1")

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$target = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\run-training-sim.ps1" -Description "Training simulator loop launcher"
& $target @args
exit $LASTEXITCODE
