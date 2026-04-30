. "$PSScriptRoot\backend-common.ps1"
Write-Step "Updating Windows backend repository"
Ensure-RuntimeDirs
Ensure-EnvFile
Import-DotEnv
Force-RefreshRepo
$result = $script:LastRepoRefreshResult
if ($result) {
  Write-Info "Before local commit: $($result.BeforeLocalCommit)"
  Write-Info "Before live remote commit: $($result.BeforeRemoteCommitLive)"
  Write-Info "After local commit: $($result.AfterLocalCommit)"
  Write-Info "After live remote commit: $($result.AfterRemoteCommitLive)"
  Write-Info "Code changed: $($result.CodeChanged)"
  Write-Ok $result.Message
} else {
  Write-Ok "Repository force-refreshed from live origin."
}
