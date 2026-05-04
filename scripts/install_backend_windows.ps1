$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows\\common.ps1")

$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$target = Assert-RepoPath -RepoRoot $repoRoot -RelativePath "scripts\\windows\\install-backend.ps1" -Description "Backend install launcher"
& $target @args
exit $LASTEXITCODE
