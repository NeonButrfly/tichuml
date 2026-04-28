$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\install-backend.ps1") @args
