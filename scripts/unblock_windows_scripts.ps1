$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows\\common.ps1")

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$target = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\unblock-scripts.ps1" -Description "Unblock scripts launcher"
& $target @args
exit $LASTEXITCODE
