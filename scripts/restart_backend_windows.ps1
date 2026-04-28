$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\restart-backend.ps1") @args
