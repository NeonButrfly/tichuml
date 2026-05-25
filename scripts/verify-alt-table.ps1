[CmdletBinding()]
param(
  [string]$Url,
  [string]$Output,
  [string]$Metadata,
  [int]$WaitTimeoutMs = 45000,
  [int]$SettleMs = 1500,
  [int]$DevPort = 4275,
  [string]$BrowserPath,
  [switch]$NoStartDevWeb,
  [switch]$Help
)

if ($Help) {
  Write-Output "Usage: powershell -ExecutionPolicy Bypass -File scripts\verify-alt-table.ps1 [-Url <url>] [-Output <path>] [-Metadata <path>] [-WaitTimeoutMs <ms>] [-SettleMs <ms>] [-DevPort <port>] [-BrowserPath <path>] [-NoStartDevWeb]"
  exit 0
}

$tsxArgs = @(
  "tsx",
  "scripts/browser-verify.ts",
  "--wait-timeout-ms",
  "$WaitTimeoutMs",
  "--settle-ms",
  "$SettleMs",
  "--dev-port",
  "$DevPort"
)

if (-not $NoStartDevWeb) {
  $tsxArgs += "--start-dev-web"
}

if ($Url) {
  $tsxArgs += @("--url", $Url)
}

if ($Output) {
  $tsxArgs += @("--output", $Output)
}

if ($Metadata) {
  $tsxArgs += @("--metadata", $Metadata)
}

if ($BrowserPath) {
  $tsxArgs += @("--browser-path", $BrowserPath)
}

& npm exec -- @tsxArgs
exit $LASTEXITCODE
