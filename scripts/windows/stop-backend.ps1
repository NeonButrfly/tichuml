$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "..\stop_backend_windows.ps1") @args
