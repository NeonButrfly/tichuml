$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\update-backend.ps1") @args
