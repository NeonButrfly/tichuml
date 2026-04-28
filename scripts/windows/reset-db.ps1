$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "..\reset_postgres_windows.ps1") @args
