param()

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$packAssetRoot = Join-Path $projectRoot 'pack-assets'
$commonRoot = Join-Path $packAssetRoot 'common'
$mapsRoot = Join-Path $packAssetRoot 'maps'
$outputRoot = Join-Path $projectRoot 'web\packs'
$mapOutputRoot = Join-Path $outputRoot 'maps'

if (-not (Test-Path -LiteralPath $commonRoot -PathType Container)) {
    throw 'Runtime pack staging is missing. Run scripts\prepare-assets.ps1 first.'
}
if (-not (Test-Path -LiteralPath $mapsRoot -PathType Container)) {
    throw 'Map pack staging is missing. Run scripts\prepare-assets.ps1 first.'
}
if (-not $outputRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe pack output directory: $outputRoot"
}

if (Test-Path -LiteralPath $outputRoot) {
    Get-ChildItem -LiteralPath $outputRoot -Recurse -Force -File | ForEach-Object { $_.IsReadOnly = $false }
    [IO.Directory]::Delete($outputRoot, $true)
}
[IO.Directory]::CreateDirectory($mapOutputRoot) | Out-Null

function Get-PackEntry([IO.FileInfo]$file, [string]$sourceRoot) {
    $relative = [IO.Path]::GetRelativePath($sourceRoot, $file.FullName).Replace('\', '/')
    return [PSCustomObject]@{
        Source = $file.FullName
        Path = "/webtf/$relative"
        Size = [long]$file.Length
    }
}

function Write-Pack([object[]]$entries, [string]$destination) {
    $sorted = @($entries | Sort-Object Path)
    if ($sorted.Count -eq 0) { throw "Cannot create an empty pack: $destination" }

    $manifestFiles = @($sorted | ForEach-Object {
        [ordered]@{ path = $_.Path; size = $_.Size }
    })
    $manifest = [ordered]@{ version = 1; files = $manifestFiles }
    $json = $manifest | ConvertTo-Json -Depth 5 -Compress
    $jsonBytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
    $magic = [Text.Encoding]::ASCII.GetBytes('WEBTFPK1')
    $lengthBytes = [BitConverter]::GetBytes([int]$jsonBytes.Length)

    $fileStream = [IO.File]::Open($destination, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $gzip = [IO.Compression.GZipStream]::new($fileStream, [IO.Compression.CompressionLevel]::Optimal, $true)
        try {
            $gzip.Write($magic, 0, $magic.Length)
            $gzip.Write($lengthBytes, 0, $lengthBytes.Length)
            $gzip.Write($jsonBytes, 0, $jsonBytes.Length)
            foreach ($entry in $sorted) {
                $source = [IO.File]::OpenRead($entry.Source)
                try { $source.CopyTo($gzip) } finally { $source.Dispose() }
            }
        } finally {
            $gzip.Dispose()
        }
    } finally {
        $fileStream.Dispose()
    }

    return [PSCustomObject]@{
        Bytes = [long](Get-Item -LiteralPath $destination).Length
        Files = $sorted.Count
    }
}

$commonEntries = @(Get-ChildItem -LiteralPath $commonRoot -Recurse -File | ForEach-Object {
    Get-PackEntry $_ $commonRoot
})
$commonDestination = Join-Path $outputRoot 'common.wtpak.gz'
$commonResult = Write-Pack $commonEntries $commonDestination

$mapManifests = [ordered]@{}
$bspRoot = Join-Path $mapsRoot 'fortress\maps'
$litRoot = Join-Path $mapsRoot 'fortress\lits'
$bspFiles = @(Get-ChildItem -LiteralPath $bspRoot -File -Filter '*.bsp')
foreach ($bsp in ($bspFiles | Sort-Object BaseName)) {
    $mapName = $bsp.BaseName.ToLowerInvariant()
    if ($mapManifests.Contains($mapName)) { continue }

    $entries = @()
    $entries += @(Get-ChildItem -LiteralPath $bspRoot -File | Where-Object {
        $_.BaseName.Equals($bsp.BaseName, [StringComparison]::OrdinalIgnoreCase)
    } | ForEach-Object { Get-PackEntry $_ $mapsRoot })
    if (Test-Path -LiteralPath $litRoot -PathType Container) {
        $entries += @(Get-ChildItem -LiteralPath $litRoot -File | Where-Object {
            $_.BaseName.Equals($bsp.BaseName, [StringComparison]::OrdinalIgnoreCase)
        } | ForEach-Object { Get-PackEntry $_ $mapsRoot })
    }

    $destination = Join-Path $mapOutputRoot "$mapName.wtpak.gz"
    $result = Write-Pack $entries $destination
    $mapManifests[$mapName] = [ordered]@{
        url = "/webtf/packs/maps/$mapName.wtpak.gz"
        bytes = $result.Bytes
        files = $result.Files
    }
}

$publicManifest = [ordered]@{
    version = 1
    common = [ordered]@{
        url = '/webtf/packs/common.wtpak.gz'
        bytes = $commonResult.Bytes
        files = $commonResult.Files
    }
    maps = $mapManifests
}
$manifestPath = Join-Path $outputRoot 'manifest.json'
[IO.File]::WriteAllText(
    $manifestPath,
    ($publicManifest | ConvertTo-Json -Depth 6),
    [Text.UTF8Encoding]::new($false)
)

Write-Host ("Common runtime pack: {0:N1} MiB, {1} files" -f ($commonResult.Bytes / 1MB), $commonResult.Files)
Write-Host ("Map packs: {0} files, {1:N1} MiB total" -f $mapManifests.Count, ((Get-ChildItem -LiteralPath $mapOutputRoot -File | Measure-Object Length -Sum).Sum / 1MB))
