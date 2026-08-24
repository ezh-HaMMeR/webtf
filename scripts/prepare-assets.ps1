param(
    [string]$ClientPath = 'C:\Games\ezquake-tf',
    [string]$DemoPath = (Join-Path $PSScriptRoot '..\demos\demo.mvd')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$assetRoot = Join-Path $projectRoot 'assets'
$packAssetRoot = Join-Path $projectRoot 'pack-assets'
$commonAssetRoot = Join-Path $packAssetRoot 'common'
$mapAssetRoot = Join-Path $packAssetRoot 'maps'
$clientRoot = (Resolve-Path -LiteralPath $ClientPath).Path
$demo = (Resolve-Path -LiteralPath $DemoPath).Path

foreach ($generatedRoot in @($assetRoot, $packAssetRoot)) {
    if (-not $generatedRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe generated asset directory: $generatedRoot"
    }
}

foreach ($generatedRoot in @($assetRoot, $packAssetRoot)) {
    if (Test-Path -LiteralPath $generatedRoot) {
        Get-ChildItem -LiteralPath $generatedRoot -Recurse -Force -File | ForEach-Object { $_.IsReadOnly = $false }
        [IO.Directory]::Delete($generatedRoot, $true)
    }
    [IO.Directory]::CreateDirectory($generatedRoot) | Out-Null
}

function Copy-TreeTo([string]$relativePath, [string]$destinationRoot) {
    $source = Join-Path $clientRoot $relativePath
    $destination = Join-Path $destinationRoot $relativePath
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Required client asset is missing: $source"
    }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

function Copy-Tree([string]$relativePath) {
    Copy-TreeTo $relativePath $assetRoot
}

function Copy-CommonTree([string]$relativePath) {
    Copy-TreeTo $relativePath $commonAssetRoot
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

# Keep startup configs and the small browser HUD in the core package. Models,
# sounds, replacement textures and maps are installed into MEMFS on demand.
[IO.Directory]::CreateDirectory((Join-Path $assetRoot 'fortress')) | Out-Null
Get-ChildItem -LiteralPath (Join-Path $clientRoot 'fortress') -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $assetRoot 'fortress') -Force
}
$externalHudConfig = Join-Path $projectRoot 'web\config\hud.cfg'
if (Test-Path -LiteralPath $externalHudConfig -PathType Leaf) {
    Copy-Item -LiteralPath $externalHudConfig -Destination (Join-Path $assetRoot 'fortress\hud.cfg') -Force
}
foreach ($directory in @('fortress\GFX', 'fortress\locs')) {
    Copy-Tree $directory
}
foreach ($directory in @('fortress\progs', 'fortress\skins', 'fortress\sound', 'fortress\textures')) {
    Copy-CommonTree $directory
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
$countUpper = Join-Path $commonAssetRoot 'fortress\sound\COUNT.WAV'
$countLower = Join-Path $commonAssetRoot 'fortress\sound\count.wav'
if (Test-Path -LiteralPath $countUpper) {
    $countTemporary = Join-Path $commonAssetRoot 'fortress\sound\count.webtf.tmp'
    Move-Item -LiteralPath $countUpper -Destination $countTemporary -Force
    Move-Item -LiteralPath $countTemporary -Destination $countLower -Force
}

foreach ($directory in @('fortress\maps', 'fortress\lits')) {
    if (Test-Path -LiteralPath (Join-Path $clientRoot $directory)) {
        Copy-TreeTo $directory $mapAssetRoot
    }
}

# Startup UI resources stay in the core package.
foreach ($directory in @('qw\crosshairs', 'qw\img', 'qw\textures\charsets', 'qw\textures\wad')) {
    Copy-Tree $directory
}
# Runtime visuals are one immutable common pack. Large menu backgrounds and
# single-player NQuake LIT files are intentionally excluded from the viewer.
foreach ($directory in @(
    'qw\env', 'qw\nquake\configs', 'qw\nquake\progs', 'qw\nquake\sound',
    'qw\nquake\textures', 'qw\skins', 'qw\sound', 'qw\textures\bmodels',
    'qw\textures\grens', 'qw\textures\icons', 'qw\textures\models',
    'qw\textures\scoreboard', 'qw\textures\wad'
)) {
    Copy-CommonTree $directory
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

$bytes = (Get-ChildItem -LiteralPath $assetRoot -Recurse -File | Measure-Object Length -Sum).Sum
$packBytes = (Get-ChildItem -LiteralPath $packAssetRoot -Recurse -File | Measure-Object Length -Sum).Sum
$demoHash = (Get-FileHash -LiteralPath $demo -Algorithm SHA256).Hash
Write-Host ("Prepared core: {0:N1} MiB in {1}" -f ($bytes / 1MB), $assetRoot)
Write-Host ("Prepared runtime packs: {0:N1} MiB in {1}" -f ($packBytes / 1MB), $packAssetRoot)
Write-Host "External demo.mvd SHA-256: $demoHash"
