# D-Smart Go App — build: src/*.js -> app.js
# Usage: pwsh tools/build.ps1
# Concatenates src/*.js (sorted by name: 00, 10, 20, ...) into a single IIFE that
# index.html loads. Unlike the mod there is NO hostname guard — an "apps" module
# runs on its own origin. Edit modules under src/ -> rebuild -> commit app.js.

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..'
$src = Join-Path $root 'src'
$out = Join-Path $root 'app.js'

$files = Get-ChildItem (Join-Path $src '*.js') | Sort-Object Name
if (-not $files) { throw "no .js files under src/" }

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("/* =============================================================================")
[void]$sb.AppendLine(" * D-Smart Go App  —  app.js  (AUTO-GENERATED — do not edit by hand)")
[void]$sb.AppendLine(" * Source: src/  ·  Rebuild: pwsh tools/build.ps1")
[void]$sb.AppendLine(" * ============================================================================= */")
[void]$sb.AppendLine("(function () {")
[void]$sb.AppendLine("  'use strict';")
foreach ($f in $files) {
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("/* ======================== src/$($f.Name) ======================== */")
  [void]$sb.AppendLine((Get-Content -Raw -Encoding UTF8 $f.FullName).TrimEnd())
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("})();")

# Write UTF-8 without BOM
$enc = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($out, $sb.ToString(), $enc)
Write-Host "Build done: $out  ($($files.Count) modules)"
