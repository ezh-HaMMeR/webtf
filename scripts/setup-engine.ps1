param(
    [string]$SourcePath = 'C:\PythonProjects\ezquake-tf'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourceRoot = (Resolve-Path -LiteralPath $SourcePath).Path
$workRoot = Join-Path $projectRoot '.work'
$engineRoot = Join-Path $workRoot 'ezquake-tf'
$commit = (Get-Content -LiteralPath (Join-Path $projectRoot 'engine\ezquake.commit') -Raw).Trim()
$patch = Join-Path $projectRoot 'patches\ezquake-web.patch'

[IO.Directory]::CreateDirectory($workRoot) | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $engineRoot '.git'))) {
    git clone --local --no-hardlinks $sourceRoot $engineRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to clone ezquake-tf source.' }
}

git -C $engineRoot apply --reverse --check $patch 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "WebTF engine patch is already applied in $engineRoot"
    exit 0
}

$dirty = git -C $engineRoot status --porcelain
if ($dirty) {
    throw "The disposable engine checkout has unrelated changes: $engineRoot"
}

git -C $engineRoot checkout --detach $commit
if ($LASTEXITCODE -ne 0) { throw "Unable to select ezquake-tf commit $commit." }
git -C $engineRoot submodule update --init src/qwprot vcpkg
if ($LASTEXITCODE -ne 0) { throw 'Unable to initialize ezquake-tf submodules.' }

git -C $engineRoot apply --check $patch
if ($LASTEXITCODE -ne 0) { throw 'The WebTF engine patch does not apply cleanly.' }
git -C $engineRoot apply $patch
if ($LASTEXITCODE -ne 0) { throw 'Unable to apply the WebTF engine patch.' }

Write-Host "Prepared ezquake-tf $commit in $engineRoot"
