# WebTF architecture

WebTF is not an independent Quake renderer and does not reinterpret MVD packets in JavaScript.
It compiles the ezquake-tf client itself to WebAssembly so that the existing MVD1 parser,
prediction, camera selection, scoreboard, HUD, TeamFortress assets and sound mixer remain the
single source of truth.

## Prototype boundary

The first milestone supports local `.mvd`, `.qwd` and `.dem` playback from a browser file picker
or from the bundled `demos/demo.mvd`. It uses SDL2 for input/audio and an OpenGL ES 2/WebGL 1
compatibility context for rendering.

Native UDP/TCP sockets, the server browser, automatic updates, Discord integration, movie capture,
voice input and QTV discovery are outside the first milestone. Live viewing will be added after demo
playback is stable, using a small WebSocket-to-QTV bridge next to the existing qtv/mvdsv services.

## Data flow

1. Emscripten mounts the prepared Quake filesystem at `/webtf`.
2. The browser UI sends `playdemo` to the original ezquake-tf command buffer.
3. ezquake-tf reads MVD1, loads the recorded `fortress` game directory and map assets, and renders
   through its existing SDL/OpenGL renderer translated to WebGL.
4. Camera switching, HUD and the `Tab` scoreboard stay inside the engine. The HTML shell exposes
   volume, speed, pause, seek/timeline, manual camera, fullscreen and local-file controls. Small
   Emscripten exports provide the authoritative demo time, length and seek operation.

The prepared filesystem includes the reference client's `qw/autoexec.cfg`, Fortress settings/HUD,
TF models and sounds, and both TF/QW replacement texture directories. Windows-only case and parent
path assumptions are normalized in the generated asset copy; the source client installation is
never modified.

The browser data package also contains the complete installed `fortress/maps` and `fortress/lits`
trees. This is intentionally larger than the original single-demo prototype: `/pub` can select any
recorded public match, so the matching BSP and optional colored-light file must already be available
inside Emscripten's read-only game filesystem.

The black/flat-world failure found during the prototype was not an MVD parser problem. It combined
several desktop-OpenGL assumptions: an RGB/RGBA upload mismatch rejected by WebGL, fixed-function
multitexture coordinates selected from hardware capability instead of the active renderer state,
and alias-model VBOs that rely on APIs absent from WebGL 1. The compatibility build uses a
single-texture multipass world path plus CPU-interpolated immediate alias models, preserving the
original textures, lightmaps and models without the unstable legacy VBO/client-array path.

The browser platform renders to a fixed 1280x720 canvas which CSS scales with the embedded 16:9
viewport. Fullscreen reserves a 46-pixel media bar, then preserves 16:9 and centers the largest
fitting picture on black letterbox or pillarbox areas. SDL restores the backing size after
resize/fullscreen events, preventing a stale WebGL viewport from leaving accidental uncovered
strips. `vid_conscale 1`
keeps fullscreen HUD layouts proportional in smaller windows. During active demo playback the HTML
shell repeatedly enforces `cl_sbar 0` and `viewsize 100`, so late Fortress/class configs cannot
restore the classic status bar. SDL audio opens at
48 kHz with linear resampling and a 2048-sample browser buffer to avoid nearest-neighbour hiss and
main-thread underruns. Spectator-camera network writes are suppressed during file MVD playback;
manual selection also disables demo/high-fragger autotracking and locks the selected slot locally.

Because browsers cannot modify the operating system gamma ramp, WebTF treats final-canvas
brightness as a browser presentation setting. `web/player-config.json` supplies a bounded CSS
compositor multiplier which is applied after WebGL renders the complete frame, independently of
the ezQuake `gl_gamma` cvar.

The compatibility path retains CPU alias-model vertices because Fortress configs can change the
renderer after model loading. It allocates the bounded pose workspace lazily and never calls the GL
buffer API when WebGL reports buffers unavailable. With `-noatlas`, solid HUD primitives use the
renderer white texture, so health/armor bars and the speedometer frame remain available.
WebAssembly also requires exact indirect-call signatures, so protected
movement key-up/down dispatch uses direct typed calls; this keeps console text input from aborting
the client. Tracked-player health and armor bars read `HUD_Stats`, matching the other MVD HUD values.

## Production renderer direction

The compatibility renderer keeps the prototype close to the native client and provides a working
reference. The production path should replace legacy immediate-mode emulation incrementally with
the existing shader renderer adapted to WebGL 2, while preserving the same client, protocol and
filesystem layers. Demo behavior can then be compared frame-for-frame with this first milestone.

## Live QTV phase

Browsers cannot open the raw QTV TCP stream. A same-origin service will expose a WebSocket endpoint,
perform the QTV handshake upstream and forward binary stream data without modifying protocol bytes.
The web platform layer will then present the WebSocket as the client's stream transport.
