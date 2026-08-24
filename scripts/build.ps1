param(
    [switch]$SkipDependencies,
    [switch]$SkipAssets
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$engineRoot = Join-Path $projectRoot '.work\ezquake-tf'
$buildRoot = Join-Path $projectRoot '.work\build-web'
$assetRoot = Join-Path $projectRoot 'assets'
$packRoot = Join-Path $projectRoot 'web\packs'
$outputRoot = Join-Path $projectRoot 'web\build'
$emsdkRoot = Join-Path $projectRoot '.tools\emsdk'
$emscriptenRoot = Join-Path $emsdkRoot 'upstream\emscripten'
$vcpkgRoot = Join-Path $engineRoot 'vcpkg'
$emscriptenToolchain = Join-Path $emscriptenRoot 'cmake\Modules\Platform\Emscripten.cmake'

if (-not (Test-Path -LiteralPath (Join-Path $emscriptenRoot 'emcc.exe'))) {
    throw 'Emscripten is missing. Run scripts\install-toolchain.ps1 first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $engineRoot 'CMakeLists.txt'))) {
    throw 'Patched engine checkout is missing. Run scripts\setup-engine.ps1 first.'
}
if (-not $SkipAssets) {
    & (Join-Path $PSScriptRoot 'prepare-assets.ps1')
    & (Join-Path $PSScriptRoot 'build-packs.ps1')
}
if (-not (Test-Path -LiteralPath (Join-Path $assetRoot 'id1\pak0.pak'))) {
    throw 'Prepared assets are missing. Run scripts\prepare-assets.ps1 first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $packRoot 'common.wtpak.gz'))) {
    throw 'Runtime packs are missing. Run scripts\build-packs.ps1 first.'
}

$env:EMSDK = $emsdkRoot.Replace('\', '/')
$env:EMSCRIPTEN_ROOT = $emscriptenRoot
$env:PATH = "$emsdkRoot;$emscriptenRoot;$env:PATH"

if (-not $SkipDependencies) {
    & (Join-Path $vcpkgRoot 'bootstrap-vcpkg.bat') -disableMetrics
    if ($LASTEXITCODE -ne 0) { throw 'Unable to bootstrap vcpkg.' }

    $packages = @(
        'expat', 'libjpeg-turbo', 'jansson', 'minizip', 'pcre2', 'libpng',
        'libsndfile', 'zlib', 'curl', 'freetype', 'speex', 'speexdsp'
    )
    & (Join-Path $vcpkgRoot 'vcpkg.exe') install --classic --triplet wasm32-emscripten @packages
    if ($LASTEXITCODE -ne 0) { throw 'Unable to build WebAssembly dependencies.' }
}

$toolchain = Join-Path $vcpkgRoot 'scripts\buildsystems\vcpkg.cmake'
cmake -S $engineRoot -B $buildRoot -G Ninja `
    "-DCMAKE_TOOLCHAIN_FILE=$toolchain" `
    "-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=$emscriptenToolchain" `
    '-DVCPKG_TARGET_TRIPLET=wasm32-emscripten' `
    '-DVCPKG_MANIFEST_MODE=OFF' `
    '-DUSE_SYSTEM_LIBS=OFF' `
    '-DENABLE_LTO=OFF' `
    '-DBUILD_CFG_EDITOR_TESTS=OFF' `
    '-DRENDERER_MODERN_OPENGL=OFF' `
    '-DRENDERER_CLASSIC_OPENGL=ON' `
    '-DRENDERING_TRACE=OFF' `
    '-DCMAKE_BUILD_TYPE=Release' `
    "-DWEBTF_ASSET_DIR=$assetRoot"
if ($LASTEXITCODE -ne 0) { throw 'Unable to configure ezquake-tf for WebAssembly.' }

# Asset files are embedded at link time but are not ordinary Ninja inputs.
# Removing only final products forces a relink without recompiling all objects.
if (-not $SkipAssets) {
    foreach ($name in @('ezquake.js', 'ezquake.wasm', 'ezquake.data')) {
        [IO.File]::Delete((Join-Path $buildRoot $name))
    }
}

cmake --build $buildRoot --target ezquake --parallel
if ($LASTEXITCODE -ne 0) { throw 'ezquake-tf WebAssembly build failed.' }

[IO.Directory]::CreateDirectory($outputRoot) | Out-Null
foreach ($name in @('ezquake.js', 'ezquake.wasm', 'ezquake.data')) {
    $source = Join-Path $buildRoot $name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Expected build output is missing: $source"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $outputRoot $name) -Force
}

# Nginx serves these precompressed siblings through `gzip_static on`. The
# browser still sees the original URL and transparently receives fewer bytes.
foreach ($name in @('ezquake.js', 'ezquake.wasm', 'ezquake.data')) {
    $source = Join-Path $outputRoot $name
    $destination = "$source.gz"
    $input = [IO.File]::OpenRead($source)
    try {
        $output = [IO.File]::Open($destination, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            $gzip = [IO.Compression.GZipStream]::new($output, [IO.Compression.CompressionLevel]::Optimal, $true)
            try { $input.CopyTo($gzip) } finally { $gzip.Dispose() }
        } finally {
            $output.Dispose()
        }
    } finally {
        $input.Dispose()
    }
}

Get-ChildItem -LiteralPath $outputRoot -File | Select-Object Name,Length
Write-Host 'WebTF build completed. Run scripts\serve.ps1.'
