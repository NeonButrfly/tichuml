param(
  [switch]$SkipHelp,
  [Alias("?")]
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help -or $args -contains "--help" -or $args -contains "-h") {
@"
Usage:
  scripts\verify-scripts.ps1 [options]

Purpose:
  Validates canonical script layout, stale references, shared helper wiring,
  Bash syntax when available, PowerShell parsing, executable bits, and help
  entrypoints for the top-level scripts surface.

Options:
  -SkipHelp              Skip invoking each script's help path.
  -Help, -?, --help, -h  Show this help text.

Examples:
  powershell -ExecutionPolicy Bypass -File scripts\verify-scripts.ps1
  powershell -ExecutionPolicy Bypass -File scripts\verify-scripts.ps1 -SkipHelp

Output:
  Prints a readable validation report and writes helper inventory artifacts to
  .runtime\verify-scripts\.
"@ | Write-Host
  exit 0
}

. (Join-Path $PSScriptRoot "common.ps1")
$repoRoot = Enter-RepoRoot -BaseDir $PSScriptRoot
$scriptsDir = Join-Path $repoRoot "scripts"
$artifactDir = Join-Path $repoRoot ".runtime\verify-scripts"
$coreScript = Join-Path $scriptsDir "verify-scripts-core.mjs"
$powerShellExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } elseif (Get-Command powershell -ErrorAction SilentlyContinue) { "powershell" } else { "" }
$bashExeCandidates = @(
  "C:\Program Files\Git\bin\bash.exe",
  "C:\Program Files\Git\usr\bin\bash.exe"
)
$bashExe = @(
  $bashExeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
)[0]
$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure { param([string]$Message) $failures.Add($Message) | Out-Null }
function Add-Warning { param([string]$Message) $warnings.Add($Message) | Out-Null }

function Get-ParserErrorsForFile {
  param([string]$Path)

  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  return @{
    Ast = $ast
    Errors = @($errors)
  }
}

function Get-PowerShellFunctionNames {
  param([System.Management.Automation.Language.Ast]$Ast)

  return @(
    $Ast.FindAll(
      { param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] },
      $true
    ) | ForEach-Object { $_.Name }
  )
}

function Get-PowerShellSourcePaths {
  param(
    [string]$Path,
    [string]$Content
  )

  $baseDir = Split-Path -Parent $Path
  $repoRootNormalized = $repoRoot
  $results = New-Object System.Collections.Generic.List[string]
  foreach ($match in [regex]::Matches($Content, '\.\s+\(Join-Path\s+\$PSScriptRoot\s+"([^"]+)"\)')) {
    $candidate = Join-Path $baseDir $match.Groups[1].Value
    if (Test-Path -LiteralPath $candidate) {
      $results.Add((Resolve-Path -LiteralPath $candidate).Path) | Out-Null
    }
  }
  foreach ($match in [regex]::Matches($Content, '\.\s+"([^"]+\.ps1)"')) {
    $literal = $match.Groups[1].Value.
      Replace('$PSScriptRoot', $baseDir).
      Replace('${PSScriptRoot}', $baseDir).
      Replace('$BACKEND_REPO_ROOT', $repoRootNormalized).
      Replace('${BACKEND_REPO_ROOT}', $repoRootNormalized).
      Replace('$RepoRoot', $repoRootNormalized).
      Replace('${RepoRoot}', $repoRootNormalized)
    $candidate = if ([System.IO.Path]::IsPathRooted($literal)) {
      $literal
    } else {
      Join-Path $baseDir $literal
    }
    if (Test-Path -LiteralPath $candidate) {
      $results.Add((Resolve-Path -LiteralPath $candidate).Path) | Out-Null
    }
  }
  return @($results | Select-Object -Unique)
}

function Get-PowerShellGraph {
  param([System.IO.FileInfo[]]$Files)

  $nodes = @{}
  foreach ($file in $Files) {
    $parse = Get-ParserErrorsForFile -Path $file.FullName
    foreach ($error in $parse.Errors) {
      Add-Failure "PowerShell parse failed for scripts/$($file.Name): $($error.Message)"
    }
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $nodes[$file.FullName] = [ordered]@{
      File = $file
      Content = $content
      Ast = $parse.Ast
      FunctionNames = @(Get-PowerShellFunctionNames -Ast $parse.Ast)
      SourcePaths = @(Get-PowerShellSourcePaths -Path $file.FullName -Content $content)
      AvailableFunctions = @()
    }
  }

  $memo = @{}
  function Resolve-Functions([string]$FilePath, [System.Collections.Generic.HashSet[string]]$Stack) {
    if ($memo.ContainsKey($FilePath)) {
      return @($memo[$FilePath])
    }
    if ($Stack.Contains($FilePath)) {
      return @()
    }

    $null = $Stack.Add($FilePath)
    $resolved = New-Object System.Collections.Generic.HashSet[string]
    foreach ($name in $nodes[$FilePath].FunctionNames) {
      $null = $resolved.Add($name)
    }
    foreach ($sourcePath in @($nodes[$FilePath].SourcePaths)) {
      if ($nodes.ContainsKey($sourcePath)) {
        foreach ($name in Resolve-Functions $sourcePath $Stack) {
          $null = $resolved.Add($name)
        }
      }
    }
    $null = $Stack.Remove($FilePath)
    $memo[$FilePath] = @($resolved)
    return @($resolved)
  }

  foreach ($path in $nodes.Keys) {
    $nodes[$path].AvailableFunctions = @(Resolve-Functions $path ([System.Collections.Generic.HashSet[string]]::new()))
  }

  return $nodes
}

function Test-IsAllowedExternalCommand {
  param([string]$Name)

  $allowList = @(
    "7z", "7zz", "awk", "bash", "cat", "curl", "cut", "docker", "find",
    "git", "grep", "head", "mkdir", "mv", "node", "npm", "npm.cmd",
    "pg_dump", "pg_restore", "pg_isready", "psql", "python", "python3",
    "pwsh", "powershell", "rm", "sed", "sha256sum", "sleep", "sort",
    "tar", "tee", "timeout", "tsx", "wc"
  )
  if ($Name -in $allowList) {
    return $true
  }
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-PowerShellHelperInventory {
  param([hashtable]$Graph)

  $inventory = New-Object System.Collections.Generic.List[object]
  foreach ($path in ($Graph.Keys | Sort-Object)) {
    $fileName = Split-Path -Leaf $path
    if ($fileName -notmatch 'common|helper') {
      continue
    }
    foreach ($functionName in @($Graph[$path].FunctionNames | Sort-Object -Unique)) {
      $usedBy = New-Object System.Collections.Generic.List[string]
      foreach ($otherPath in $Graph.Keys) {
        if ($otherPath -eq $path) {
          continue
        }
        $commands = @(
          $Graph[$otherPath].Ast.FindAll(
            { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
            $true
          )
        )
        foreach ($command in $commands) {
          if ($command.GetCommandName() -eq $functionName) {
            $usedBy.Add((Resolve-Path -LiteralPath $otherPath -Relative).TrimStart(".\")) | Out-Null
            break
          }
        }
      }
      $inventory.Add([pscustomobject]@{
        helper_name = $functionName
        defining_file = (Resolve-Path -LiteralPath $path -Relative).TrimStart(".\")
        used_by = @($usedBy | Sort-Object -Unique)
      }) | Out-Null
    }
  }

  $jsonPath = Join-Path $artifactDir "powershell-helper-inventory.json"
  $txtPath = Join-Path $artifactDir "powershell-helper-inventory.txt"
  $inventory | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("PowerShell helper inventory") | Out-Null
  $lines.Add("===========================") | Out-Null
  $lines.Add("") | Out-Null
  foreach ($item in $inventory) {
    $lines.Add($item.helper_name) | Out-Null
    $lines.Add("  defining file: $($item.defining_file)") | Out-Null
    $usedBy = if (@($item.used_by).Count -gt 0) { $item.used_by -join ", " } else { "(none)" }
    $lines.Add("  used by: $usedBy") | Out-Null
    $lines.Add("") | Out-Null
  }
  $lines | Set-Content -LiteralPath $txtPath -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null

if (-not (Test-Path -LiteralPath $coreScript)) {
  Add-Failure "Missing scripts/verify-scripts-core.mjs"
} else {
  & node $coreScript --repo-root $repoRoot
  if ($LASTEXITCODE -ne 0) {
    Add-Failure "verify-scripts core checks failed"
  }
}

$scriptFiles = @(Get-ChildItem -LiteralPath $scriptsDir -File | Where-Object { $_.Extension -in ".ps1", ".sh" } | Sort-Object Name)
$psFiles = @($scriptFiles | Where-Object Extension -eq ".ps1")
$shFiles = @($scriptFiles | Where-Object Extension -eq ".sh")
$graph = Get-PowerShellGraph -Files $psFiles
Write-PowerShellHelperInventory -Graph $graph

foreach ($node in $graph.Values) {
  $commands = @(
    $node.Ast.FindAll(
      { param($astNode) $astNode -is [System.Management.Automation.Language.CommandAst] },
      $true
    )
  )
  foreach ($command in $commands) {
    $name = $command.GetCommandName()
    if ([string]::IsNullOrWhiteSpace($name)) {
      continue
    }
    if ($name -in $node.AvailableFunctions) {
      continue
    }
    if (Test-IsAllowedExternalCommand -Name $name) {
      continue
    }
    $line = $command.Extent.StartLineNumber
    Add-Failure "$((Resolve-Path -LiteralPath $node.File.FullName -Relative).TrimStart('.\')):$line unresolved command/helper '$name'"
  }
}

if (-not [string]::IsNullOrWhiteSpace($bashExe)) {
  foreach ($file in $shFiles) {
    & $bashExe -n $file.FullName
    if ($LASTEXITCODE -ne 0) {
      Add-Failure "bash -n failed for scripts/$($file.Name)"
    }
  }
} else {
  Add-Warning "Git Bash unavailable; skipping bash -n checks from PowerShell."
}

foreach ($file in $shFiles) {
  $modeLine = (& git -C $repoRoot ls-files --stage -- ("scripts/" + $file.Name) 2>$null | Select-Object -First 1)
  if (-not [string]::IsNullOrWhiteSpace($modeLine)) {
    $mode = (($modeLine -split '\s+')[0]).Trim()
    if ($mode -ne "100755") {
      Add-Failure "Git executable bit is not set for scripts/$($file.Name) (mode: $mode)"
    }
  }
}

if (-not $SkipHelp) {
  foreach ($file in $psFiles) {
    if ([string]::IsNullOrWhiteSpace($powerShellExe)) {
      Add-Failure "No PowerShell executable is available to run help for scripts/$($file.Name)"
      continue
    }
    $result = & $powerShellExe -NoProfile -ExecutionPolicy Bypass -File $file.FullName -Help 2>&1
    if ($LASTEXITCODE -ne 0) {
      Add-Failure "Help failed for $($file.Name): $($result | Select-Object -First 1)"
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($bashExe)) {
    foreach ($file in $shFiles) {
      & $bashExe $file.FullName --help *> (Join-Path $artifactDir ("help-" + $file.Name + ".txt"))
      if ($LASTEXITCODE -ne 0) {
        Add-Failure "Help failed for scripts/$($file.Name)"
      }
    }
  }
}

foreach ($warning in $warnings) {
  Write-Warning $warning
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "[OK] Script layout, helper wiring, syntax, executable bits, and help checks passed."
