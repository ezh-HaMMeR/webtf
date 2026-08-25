# WebTF

WebTF is a working browser player for QuakeWorld MVD demos. It compiles a compatible
**ezQuake / ezquake-tf** client to WebAssembly and WebGL, preserving the engine's MVD parser,
renderer, sound mixer, spectator cameras, scoreboard and configurable HUD. WebTF is currently used
for online demo playback on [QWTF.NET](https://qwtf.net/pub/).

WebTF does not use FTE and does not reinterpret MVD packets in JavaScript. The browser runs the
patched ezQuake client itself; JavaScript provides the page shell, downloads runtime assets and
exposes media-style controls.

Current features include:

- `.mvd`, `.qwd` and `.dem` playback from HTTP or a local file;
- automatic playback, restart, pause, speed control and timeline seeking;
- tracked-player switching and the original `Tab` scoreboard;
- original Team Fortress models, sounds, textures, particles and HUD configuration;
- a responsive 16:9 player with fullscreen letterboxing instead of image stretching;
- separately cached engine, common-resource and per-map packages;
- same-origin iframe integration for match-statistics pages.

## 1. Building on Windows

### Requirements

- Windows 10 or 11 x64;
- PowerShell 7, Git, Python 3, CMake and Ninja available on `PATH`;
- a local compatible ezQuake or ezquake-tf Git checkout;
- an existing ezQuake client installation containing registered Quake data and the required game
  assets (`id1`, `qw`, `ezquake` and, for QWTF builds, `fortress`);
- a reference demo for local playback and asset validation.

The source checkout, client installation and demo may be stored anywhere. The directory name is not
significant: an `ezquake` installation can be used instead of `ezquake-tf`. Pass the actual paths to
the scripts rather than reproducing the example directory layout.

### Build steps

Clone WebTF and define paths appropriate for your machine:

```powershell
git clone https://github.com/ezh-HaMMeR/webtf.git
Set-Location webtf

$engineSource = 'D:\Source\ezquake'
$clientPath = 'D:\Games\ezquake'
$demoPath = 'D:\Demos\reference.mvd'
```

Install the pinned Emscripten SDK, prepare a disposable patched engine checkout and build the player:

```powershell
.\scripts\install-toolchain.ps1
.\scripts\setup-engine.ps1 -SourcePath $engineSource
.\scripts\build.ps1 -ClientPath $clientPath -DemoPath $demoPath
```

By default `setup-engine.ps1` selects the reproducible revision stored in
`engine/ezquake.commit`. If another compatible ezQuake checkout is used and does not contain that
revision, explicitly select a revision from that checkout; the WebTF patch must apply cleanly:

```powershell
.\scripts\setup-engine.ps1 -SourcePath $engineSource -EngineRevision HEAD
```

The first build downloads and compiles the WebAssembly vcpkg dependencies. Generated and staged
game data is intentionally excluded from Git. The deployable output is produced in:

```text
web/build/              WebAssembly, JavaScript loader, data file and .gz siblings
web/packs/              compressed common and per-map runtime packages
web/config/hud.cfg      runtime HUD configuration
web/                    complete static player shell
```

Start the development server:

```powershell
.\scripts\serve.ps1
```

Then open <http://localhost:3000/>. The development server publishes the generated `web` directory
and maps `/demos/` to the repository's local `demos` directory.

For subsequent builds, `-SkipDependencies` keeps the existing vcpkg output. Use `-SkipAssets` only
when the staged client assets and generated packs are already current:

```powershell
.\scripts\build.ps1 -ClientPath $clientPath -DemoPath $demoPath -SkipDependencies
```

### Runtime configuration

`web/config/hud.cfg` is the authoritative HUD. The browser fetches it without caching and replaces
the virtual `fortress/hud.cfg`, so class configs that execute `settings.cfg` reload the same HUD.
Editing this file requires only a page reload, not a WebAssembly rebuild.

Browser-only presentation settings live in `web/player-config.json`. `brightness` is a final-canvas
multiplier (`1` is unchanged) and is independent of the ezQuake hardware-gamma cvars.

A same-origin demo can be opened directly with:

```text
/webtf/?demo=/webtf/demos/pub/<match-id>.mvd&map=<map-name>
```

Add `embed=1&autoplay=1` when the player is placed in an iframe.

## 2. Deploying on a Linux server

The Linux server does not compile WebTF. Build it on Windows and upload the complete generated
`web/` directory. Game data and generated packs ignored by Git must be included in the upload.

### Server requirements

- a current Linux distribution with a static-file web server;
- Nginx with the `gzip_static` module (the standard Ubuntu/Debian package includes it);
- HTTPS for normal browser audio, fullscreen and pointer-lock behavior;
- permission to run `nginx -t` and reload Nginx;
- `rsync`, `gzip` and `curl` for deployment and verification;
- disk space for the generated player, runtime/map packages and the MVD archive. Reserve at least
  512 MiB for the player and additional space according to the number of demos.

Python, Node.js, a database and a permanently running WebTF service are not required for the
standalone player. Site-specific statistics integration may have its own requirements.

### Recommended directory layout

```text
/var/www/webtf/
├── web/                 contents of the generated Windows web/ directory
└── demos/
    └── pub/             public <match-id>.mvd files
```

Create the directories and copy the generated output:

```bash
sudo install -d -m 0755 /var/www/webtf/web
sudo install -d -m 2775 /var/www/webtf/demos/pub
sudo rsync -a /tmp/webtf-web/ /var/www/webtf/web/
```

Copy `deploy/nginx-webtf.conf.example` to the server, replace `/var/www/webtf` if necessary and
include the file inside the HTTPS `server { ... }` block:

```bash
sudo install -m 0644 deploy/nginx-webtf.conf.example /etc/nginx/snippets/webtf.conf
```

```nginx
include /etc/nginx/snippets/webtf.conf;
```

Validate and activate the configuration:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Nginx needs to be reloaded only after its configuration changes. Replacing WebTF files, adding MVDs
or editing `hud.cfg` does not require restarting Nginx or any application service.

### Publishing demos

The filename must match the match ID used by the statistics page:

```text
/var/www/webtf/demos/pub/<match-id>.mvd
```

Create a precompressed sibling so Nginx can transfer the demo efficiently without changing its URL:

```bash
cd /var/www/webtf/demos/pub
gzip -9 -c '<match-id>.mvd' > '<match-id>.mvd.gz'
chmod 0664 '<match-id>.mvd' '<match-id>.mvd.gz'
```

### Verification

```bash
curl -I https://example.org/webtf/
curl -I https://example.org/webtf/build/ezquake.wasm
curl -I https://example.org/webtf/config/hud.cfg
curl -I https://example.org/webtf/packs/common.wtpak.gz
curl -I https://example.org/webtf/demos/pub/<match-id>.mvd
```

The large build files and runtime/map packages use versioned URLs and long-lived browser caching.
The HUD and player configuration are served without persistent caching. After the first visit,
viewing another match normally transfers only its MVD and a map package that is not already cached.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for implementation details.

### Licenses

WebTF is distributed under the [GNU General Public License v2](LICENSE). The generated player links
and redistributes components with compatible open-source licenses, including ezQuake/ezquake-tf
(GPL v2 or later), Emscripten SDK (MIT and component licenses), SDL 2 (zlib license) and libraries
built through vcpkg under their respective licenses. See [THIRD_PARTY.md](THIRD_PARTY.md) for the
complete stack summary.

Quake and Team Fortress game data is not included in this repository. Builders and server operators
must supply and distribute game data only when they have the right to do so.
