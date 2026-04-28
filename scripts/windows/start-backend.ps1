$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "..\start_backend_windows.ps1") @args
