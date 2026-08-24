param(
    [string]$ClientPath = 'C:\Games\ezquake-tf',
    [string]$DemoPath = (Join-Path $PSScriptRoot '..\demos\demo.mvd')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$assetRoot = Join-Path $projectRoot 'assets'
$clientRoot = (Resolve-Path -LiteralPath $ClientPath).Path
$demo = (Resolve-Path -LiteralPath $DemoPath).Path

if (-not $assetRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe asset directory: $assetRoot"
}

if (Test-Path -LiteralPath $assetRoot) {
    Get-ChildItem -LiteralPath $assetRoot -Recurse -Force -File | ForEach-Object { $_.IsReadOnly = $false }
    [IO.Directory]::Delete($assetRoot, $true)
}
[IO.Directory]::CreateDirectory($assetRoot) | Out-Null

function Copy-Tree([string]$relativePath) {
    $source = Join-Path $clientRoot $relativePath
    $destination = Join-Path $assetRoot $relativePath
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Required client asset is missing: $source"
    }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

function Copy-File([string]$relativePath) {
    $source = Join-Path $clientRoot $relativePath
    $destination = Join-Path $assetRoot $relativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required client asset is missing: $source"
    }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

# Base Quake data is read from the original registered PAK files.
Copy-File 'id1\pak0.pak'
Copy-File 'id1\PAK1.PAK'
Copy-Tree 'ezquake'

# Retain TF code, models, sounds, replacement textures and every installed TF
# map. Pub integration can select any recorded match, so a single reference map
# is no longer sufficient.
[IO.Directory]::CreateDirectory((Join-Path $assetRoot 'fortress')) | Out-Null
Get-ChildItem -LiteralPath (Join-Path $clientRoot 'fortress') -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $assetRoot 'fortress') -Force
}
foreach ($directory in @('fortress\GFX', 'fortress\locs', 'fortress\progs', 'fortress\skins', 'fortress\sound', 'fortress\textures')) {
    Copy-Tree $directory
}

# Windows treats GFX and gfx as the same directory; Emscripten does not. The
# renderer always requests lowercase gfx/, so normalize through a temporary
# name to make the case-only rename effective on Windows.
$gfxUpper = Join-Path $assetRoot 'fortress\GFX'
$gfxLower = Join-Path $assetRoot 'fortress\gfx'
if (Test-Path -LiteralPath $gfxUpper) {
    $gfxTemporary = Join-Path $assetRoot 'fortress\gfx.webtf.tmp'
    Move-Item -LiteralPath $gfxUpper -Destination $gfxTemporary -Force
    Move-Item -LiteralPath $gfxTemporary -Destination $gfxLower -Force
}

# Emscripten's filesystem is case-sensitive, unlike the Windows client tree.
$countUpper = Join-Path $assetRoot 'fortress\sound\COUNT.WAV'
$countLower = Join-Path $assetRoot 'fortress\sound\count.wav'
if (Test-Path -LiteralPath $countUpper) {
    $countTemporary = Join-Path $assetRoot 'fortress\sound\count.webtf.tmp'
    Move-Item -LiteralPath $countUpper -Destination $countTemporary -Force
    Move-Item -LiteralPath $countTemporary -Destination $countLower -Force
}

foreach ($directory in @('fortress\maps', 'fortress\lits')) {
    if (Test-Path -LiteralPath (Join-Path $clientRoot $directory)) {
        Copy-Tree $directory
    }
}

# Client-side presentation assets and replacement textures.
foreach ($directory in @('qw\crosshairs', 'qw\env', 'qw\gfx', 'qw\img', 'qw\nquake', 'qw\skins', 'qw\sound', 'qw\textures')) {
    Copy-Tree $directory
}
foreach ($file in @('qw\nquake.pk3', 'qw\models.pk3', 'qw\scoreboard_flags.pk3')) {
    Copy-File $file
}
foreach ($file in @('qw\autoexec.cfg', 'qw\config.cfg', 'qw\fragfile.dat', 'qw\chaticons.png')) {
    Copy-File $file
}

# The native HUD config reaches shared images through ../qw/img. The Emscripten
# virtual filesystem intentionally rejects parent-directory traversal in game
# asset lookups. HUD group pictures are automatically prefixed with gfx/, so
# stage the four referenced images under a lowercase browser-safe gfx path and
# rewrite only those paths in the generated asset copy.
foreach ($file in @('redpix.png', 'bluepix.png', 'spacer.png')) {
    $source = Join-Path $assetRoot "qw\img\$file"
    $destination = Join-Path $assetRoot "fortress\gfx\webtf\$file"
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}
$weaponBaseDestination = Join-Path $assetRoot 'fortress\gfx\webtf\weap\base.png'
[IO.Directory]::CreateDirectory((Split-Path -Parent $weaponBaseDestination)) | Out-Null
Copy-Item -LiteralPath (Join-Path $assetRoot 'qw\img\weap\base.png') -Destination $weaponBaseDestination -Force

$hudConfig = Join-Path $assetRoot 'fortress\hud.cfg'
$hudText = [IO.File]::ReadAllText($hudConfig)
$hudText = $hudText.Replace('../qw/img/', 'webtf/')
[IO.File]::WriteAllText($hudConfig, $hudText, [Text.UTF8Encoding]::new($false))

$demoDirectory = Join-Path $assetRoot 'demos'
[IO.Directory]::CreateDirectory($demoDirectory) | Out-Null
Copy-Item -LiteralPath $demo -Destination (Join-Path $demoDirectory 'demo.mvd') -Force

$bytes = (Get-ChildItem -LiteralPath $assetRoot -Recurse -File | Measure-Object Length -Sum).Sum
$demoHash = (Get-FileHash -LiteralPath (Join-Path $demoDirectory 'demo.mvd') -Algorithm SHA256).Hash
Write-Host ("Prepared {0:N1} MiB in {1}" -f ($bytes / 1MB), $assetRoot)
Write-Host "demo.mvd SHA-256: $demoHash"
