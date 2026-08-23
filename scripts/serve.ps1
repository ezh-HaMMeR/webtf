param([int]$Port = 3000)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $projectRoot 'web'

if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'build\ezquake.js'))) {
    throw 'WebAssembly build is missing. Run scripts\build.ps1 first.'
}

Write-Host "WebTF: http://localhost:$Port/"
python -m http.server $Port --directory $webRoot
