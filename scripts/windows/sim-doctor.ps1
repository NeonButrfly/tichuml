$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $repoRoot
try {
  & npm.cmd run sim:doctor -- @args
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & npm.cmd run telemetry:truth -- --backend-url "http://127.0.0.1:4310" --require-rows
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
