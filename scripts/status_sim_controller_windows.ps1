$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\status-sim-controller.ps1") @args
