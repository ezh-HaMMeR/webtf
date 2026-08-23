param(
    [string]$ClientRoot = "C:\Games\ezquake-tf",
    [string]$DemoPath = "",
    [string]$MapName = "",
    [ValidateSet("auto", "qw", "fortress")]
    [string]$GameDir = "auto"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PublicRoot = Join-Path $ProjectRoot "public"
$VendorRoot = Join-Path $PublicRoot "vendor\fte"
$LocalRoot = Join-Path $PublicRoot "local"
$GameRoot = Join-Path $LocalRoot "game"
$DemoRoot = Join-Path $LocalRoot "demos"

if (-not (Test-Path -LiteralPath $ClientRoot -PathType Container)) {
    throw "Client root does not exist: $ClientRoot"
}

if (-not $DemoPath) {
    $DemoPath = Join-Path $ClientRoot "ezquake\ezquake\help\manual\demos\speed-4.mvd"
}
if (-not (Test-Path -LiteralPath $DemoPath -PathType Leaf)) {
    throw "Demo file does not exist: $DemoPath"
}

$DemoBytes = [IO.File]::ReadAllBytes($DemoPath)
$DemoText = [Text.Encoding]::ASCII.GetString($DemoBytes)

if (-not $MapName) {
    $MapMatch = [regex]::Match($DemoText, '\\map\\([A-Za-z0-9_+.-]+)')
    if ($MapMatch.Success) {
        $MapName = $MapMatch.Groups[1].Value
    }
}
if (-not $MapName) {
    throw "Could not infer map name from the demo. Pass -MapName explicitly."
}

if ($GameDir -eq "auto") {
    $GameMatch = [regex]::Match($DemoText, '\\gamedir\\([A-Za-z0-9_+.-]+)')
    $DetectedGameDir = if ($GameMatch.Success) { $GameMatch.Groups[1].Value.ToLowerInvariant() } else { "qw" }
    $GameDir = if ($DetectedGameDir -eq "fortress") { "fortress" } else { "qw" }
}

New-Item -ItemType Directory -Force -Path $VendorRoot, $GameRoot, $DemoRoot | Out-Null

$EngineFiles = @(
    @{
        Name = "ftewebgl.js"
        Url = "https://a.quake.world/fte/versions/004/ftewebgl.js"
        Sha256 = "9351089FE508FF3281969A911A02DF46CABE399BA0D3792E31759AC7C4376529"
    },
    @{
        Name = "ftewebgl.wasm"
        Url = "https://a.quake.world/fte/versions/004/ftewebgl.wasm"
        Sha256 = "745EDDAF54D299D61A82CE60631CCAFA86660FEF274DAAB6143FA5D3E1183DE1"
    },
    @{
        Name = "default.fmf"
        Url = "https://a.quake.world/fte/default.fmf"
        Sha256 = "D3734BB8F49D49247C3DF16C7CAA7B3EB1E0BC53B503D4AD02F8A5F60B1F3AC2"
    },
    @{
        Name = "csaddon.dat"
        Url = "https://a.quake.world/fte/csaddon/csaddon_003.dat"
        Sha256 = "965A8059F24626B3E1C9C849B86010967DEDD30C2F720DED4CD73DE5AD1774ED"
    }
)

foreach ($EngineFile in $EngineFiles) {
    $Target = Join-Path $VendorRoot $EngineFile.Name
    $Download = $true
    if (Test-Path -LiteralPath $Target -PathType Leaf) {
        $CurrentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Target).Hash
        $Download = $CurrentHash -ne $EngineFile.Sha256
    }
    if ($Download) {
        Write-Host "Downloading $($EngineFile.Name)..."
        Invoke-WebRequest -UseBasicParsing -Uri $EngineFile.Url -OutFile $Target
    }
    $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Target).Hash
    if ($ActualHash -ne $EngineFile.Sha256) {
        throw "SHA-256 mismatch for $($EngineFile.Name)"
    }
}

function Copy-RequiredFile {
    param([string]$Source, [string]$Target)
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "Required client file does not exist: $Source"
    }
    $TargetDirectory = Split-Path -Parent $Target
    New-Item -ItemType Directory -Force -Path $TargetDirectory | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Target -Force
}

$Id1PakTarget = Join-Path $GameRoot "id1\pak0.pak"
Copy-RequiredFile (Join-Path $ClientRoot "id1\pak0.pak") $Id1PakTarget

$Files = [ordered]@{
    "id1/pak0.pak" = "/local/game/id1/pak0.pak"
    "id1/config.cfg" = "/local/config.cfg"
    "qw/csaddon.dat" = "/vendor/fte/csaddon.dat"
}

if ($GameDir -eq "fortress") {
    foreach ($PakName in @("pak0.pak", "pak1.pak", "misc.pak")) {
        $PakTarget = Join-Path $GameRoot "fortress\$PakName"
        Copy-RequiredFile (Join-Path $ClientRoot "fortress\$PakName") $PakTarget
        $Files["fortress/$PakName"] = "/local/game/fortress/$PakName"
    }

    $MapTarget = Join-Path $GameRoot "fortress\maps\$MapName.bsp"
    Copy-RequiredFile (Join-Path $ClientRoot "fortress\maps\$MapName.bsp") $MapTarget
    $Files["fortress/maps/$MapName.bsp"] = "/local/game/fortress/maps/$MapName.bsp"
}

$DemoExtension = if ($DemoPath.ToLowerInvariant().EndsWith(".mvd.gz")) { ".mvd.gz" } else { ".mvd" }
$PreparedDemoName = "match$DemoExtension"
$PreparedDemoPath = Join-Path $DemoRoot $PreparedDemoName
Copy-Item -LiteralPath $DemoPath -Destination $PreparedDemoPath -Force
$Files["$GameDir/$PreparedDemoName"] = "/local/demos/$PreparedDemoName"

$Config = @"
cfg_reset
unbindall
gamedir $GameDir
in_windowed_mouse 0
con_stayhidden 1
con_textsize 8
vid_conautoscale 0
fov 110
r_drawviewmodel 0.6
cl_bobup 0
cl_rollangle 0
v_kickroll 0
v_kickpitch 0
gl_texturemode2d gl_nearest
gl_texturemode gl_nearest_mipmap_linear
scr_scoreboard_fillalpha 1
scr_scoreboard_drawtitle 1
scr_scoreboard_showfrags 1
cl_maxfps 240
cl_maxfps_slop 0
snd_samplebits 32
volume 0.2
plug_sbar 3
alias f_demoend "demo_setspeed 0"
playdemo match
"@
[IO.File]::WriteAllText((Join-Path $LocalRoot "config.cfg"), $Config, [Text.UTF8Encoding]::new($false))

$Manifest = [ordered]@{
    title = [IO.Path]::GetFileName($DemoPath)
    map = $MapName
    gamedir = $GameDir
    files = $Files
}
$ManifestJson = $Manifest | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $LocalRoot "manifest.json"), $ManifestJson, [Text.UTF8Encoding]::new($false))

Write-Host "Prepared WebTF assets"
Write-Host "  Demo: $DemoPath"
Write-Host "  Map: $MapName"
Write-Host "  Gamedir: $GameDir"
Write-Host "  Manifest: $(Join-Path $LocalRoot 'manifest.json')"
