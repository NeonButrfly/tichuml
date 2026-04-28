$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\stop-backend.ps1") @args
