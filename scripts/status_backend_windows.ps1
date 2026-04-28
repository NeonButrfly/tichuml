$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\status-backend.ps1") @args
