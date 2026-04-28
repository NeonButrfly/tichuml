$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\start-backend.ps1") @args
