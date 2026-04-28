$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "windows\\start-sim-controller.ps1") @args
