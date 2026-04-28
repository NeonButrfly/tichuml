$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\stop-sim-controller.ps1") @args
