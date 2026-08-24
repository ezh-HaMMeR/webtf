# WebTF

Technical prototype of the actual **ezquake-tf** client compiled to WebAssembly/WebGL. The goal is
full playback of QWTF/TF2003 MVD demos first, followed by live QTV viewing from qwtf.net servers.

This repository deliberately does not use FTE or a JavaScript MVD renderer. The engine patch is
applied to the pinned ezquake-tf revision in `engine/ezquake.commit`.

## Local requirements

- Windows 10/11, PowerShell 7, Git, CMake and Ninja
- ezquake-tf source at `C:\PythonProjects\ezquake-tf`
- client assets at `C:\Games\ezquake-tf`
- test demo at `demos\demo.mvd`

## Build

```powershell
cd C:\PythonProjects\qwtf.net\webtf
.\scripts\install-toolchain.ps1
.\scripts\prepare-assets.ps1
.\scripts\setup-engine.ps1
.\scripts\build.ps1
.\scripts\serve.ps1
```

Open `http://localhost:3000/`. Build output and prepared proprietary/game assets are intentionally
not committed.

The page starts the bundled TF2003 MVD, accepts a local demo through the file picker and provides a
qwtf.net-styled media bar for volume/mute, pause, playback speed, timeline seeking,
tracked-player switching and fullscreen. Demo duration, position and seeking are supplied by the
compiled client rather than parsed in JavaScript. The original ezquake-tf scoreboard is available
on `Tab`.

The asset payload is split instead of embedding the complete client in every launch. The current
build contains about 71 MiB of core data, a 65 MiB compressed common runtime pack and a small pack
for each map (for example, `flib10b` is about 0.3 MiB). The selected MVD is also a separate HTTP
file. Core and runtime/map packs use versioned URLs and long-lived immutable browser caching, so
opening another match normally transfers only its MVD and a map pack that is not cached yet.
Opening the player page itself does not download the engine or game resources; initialization starts
only after the user presses the demo launch button or selects a local MVD.

HUD WAD replacement pictures are deliberately kept in the core package: ezQuake caches status-bar
digits during renderer initialization, before the deferred common pack is installed.

The standalone page downloads its external reference demo. A same-origin public demo can be selected
with `?demo=/webtf/demos/pub/<match-id>.mvd&map=<map-name>`; `&embed=1` removes the prototype header,
local file picker and engine console for iframe integration. For safety the player accepts only
`.mvd` paths under the WebTF demo directories on the current origin.

Browser-only presentation settings live in `web/player-config.json`. `brightness` is a final-canvas
multiplier (`1` is unchanged, `1.08` is 8% brighter) and does not depend on ezQuake hardware gamma.
It takes effect after a page reload and does not require rebuilding WebAssembly or game assets.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the platform boundary and QTV plan.

## Current limitations

- Rendering currently uses ezQuake's classic renderer through Emscripten's legacy OpenGL-to-WebGL
  compatibility layer. This is suitable for proving complete TF2003 MVD playback, not the final
  production renderer.
- The embedded player keeps a 16:9 viewport and the browser scales a fixed 1280x720 render target.
  Fullscreen uses the standard browser Fullscreen API, reserves a compact bottom control bar and
  fits the remaining 16:9 picture without stretching; wider or taller displays use centered black
  letterboxing. SDL restores the
  1280x720 canvas backing after every browser resize so the WebGL viewport cannot leave accidental
  black strips. WebTF uses
  `vid_conscale 1` so a fullscreen HUD configuration scales down with the complete canvas.
- Demo playback forces `cl_sbar 0` and `viewsize 100`, keeping the classic Quake status bar hidden
  even when a late Fortress/class configuration tries to restore it.
- Optional sounds absent from the source `C:\Games\ezquake-tf` installation remain absent in the
  browser build.
- Live QTV transport, touch controls and production asset delivery are the next milestones.
