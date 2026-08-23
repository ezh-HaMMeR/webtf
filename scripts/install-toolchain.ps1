$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$emsdkRoot = Join-Path $projectRoot '.tools\emsdk'
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'engine\emsdk.version') -Raw).Trim()

[IO.Directory]::CreateDirectory((Join-Path $projectRoot '.tools')) | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $emsdkRoot 'emsdk.bat'))) {
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git $emsdkRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to clone emsdk.' }
}

& (Join-Path $emsdkRoot 'emsdk.bat') install $version
if ($LASTEXITCODE -ne 0) { throw "Unable to install Emscripten $version." }
& (Join-Path $emsdkRoot 'emsdk.bat') activate $version
if ($LASTEXITCODE -ne 0) { throw "Unable to activate Emscripten $version." }

Write-Host "Emscripten $version is ready in $emsdkRoot"
