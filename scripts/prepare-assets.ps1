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

# Retain TF code/models/sounds, but only the map and colored-light file used by the reference demo.
# Replacement texture packs and the other 77 BSPs are unnecessary for this playback milestone.
[IO.Directory]::CreateDirectory((Join-Path $assetRoot 'fortress')) | Out-Null
Get-ChildItem -LiteralPath (Join-Path $clientRoot 'fortress') -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $assetRoot 'fortress') -Force
}
foreach ($directory in @('fortress\GFX', 'fortress\locs', 'fortress\progs', 'fortress\skins', 'fortress\sound')) {
    Copy-Tree $directory
}

# Emscripten's filesystem is case-sensitive, unlike the Windows client tree.
$countUpper = Join-Path $assetRoot 'fortress\sound\COUNT.WAV'
$countLower = Join-Path $assetRoot 'fortress\sound\count.wav'
if (Test-Path -LiteralPath $countUpper) {
    $countTemporary = Join-Path $assetRoot 'fortress\sound\count.webtf.tmp'
    Move-Item -LiteralPath $countUpper -Destination $countTemporary -Force
    Move-Item -LiteralPath $countTemporary -Destination $countLower -Force
}

foreach ($file in @('fortress\maps\bastion.bsp', 'fortress\maps\bastion.ent', 'fortress\lits\bastion.lit')) {
    Copy-File $file
}

# Client-side presentation assets. Large replacement texture packs and unrelated maps are excluded.
foreach ($directory in @('qw\crosshairs', 'qw\env', 'qw\gfx', 'qw\img', 'qw\nquake', 'qw\skins', 'qw\sound')) {
    Copy-Tree $directory
}
foreach ($file in @('qw\nquake.pk3', 'qw\models.pk3', 'qw\scoreboard_flags.pk3')) {
    Copy-File $file
}

$demoDirectory = Join-Path $assetRoot 'demos'
[IO.Directory]::CreateDirectory($demoDirectory) | Out-Null
Copy-Item -LiteralPath $demo -Destination (Join-Path $demoDirectory 'demo.mvd') -Force

$bytes = (Get-ChildItem -LiteralPath $assetRoot -Recurse -File | Measure-Object Length -Sum).Sum
$demoHash = (Get-FileHash -LiteralPath (Join-Path $demoDirectory 'demo.mvd') -Algorithm SHA256).Hash
Write-Host ("Prepared {0:N1} MiB in {1}" -f ($bytes / 1MB), $assetRoot)
Write-Host "demo.mvd SHA-256: $demoHash"
