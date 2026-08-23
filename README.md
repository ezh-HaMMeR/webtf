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

The page starts the bundled TF2003 MVD, accepts a local demo through the file picker, switches the
tracked player, pauses playback, shows a scoreboard sourced from ezquake-tf state and enters
fullscreen. All of these actions call the compiled client; the browser page does not parse MVD data.

The first load transfers about 215 MiB of locally prepared game data. A production deployment must
split/cache the data package and serve it with compression and long-lived cache headers.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the platform boundary and QTV plan.

## Current limitations

- Rendering currently uses ezQuake's classic renderer through Emscripten's legacy OpenGL-to-WebGL
  compatibility layer. This is suitable for proving complete TF2003 MVD playback, not the final
  production renderer.
- The browser render target is fixed at 1280x720 and scaled responsively by CSS. Dynamic
  device-pixel-ratio sizing belongs in the WebGL 2 production renderer.
- Optional sounds absent from the source `C:\Games\ezquake-tf` installation remain absent in the
  browser build.
- Live QTV transport, touch controls and production asset delivery are the next milestones.
