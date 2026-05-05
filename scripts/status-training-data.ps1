$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows\\common.ps1")

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$target = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\status-training-data.ps1" -Description "Training data status launcher"
& $target @args
exit $LASTEXITCODE
