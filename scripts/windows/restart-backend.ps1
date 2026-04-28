$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "..\restart_backend_windows.ps1") @args
