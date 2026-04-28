$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\reset-db.ps1") @args
