$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "..\status_backend_windows.ps1") @args
