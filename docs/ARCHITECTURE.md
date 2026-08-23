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
4. Camera switching and HUD stay engine commands/configuration. The HTML scoreboard reads the
   authoritative player/team/frag/ping state through a narrow exported client bridge; it does not
   parse or duplicate the MVD protocol.

The prepared filesystem includes the reference client's `qw/autoexec.cfg`, Fortress settings/HUD,
TF models and sounds, and both TF/QW replacement texture directories. Windows-only case and parent
path assumptions are normalized in the generated asset copy; the source client installation is
never modified.

The black/flat-world failure found during the prototype was not an MVD parser problem. It combined
several desktop-OpenGL assumptions: an RGB/RGBA upload mismatch rejected by WebGL, fixed-function
multitexture coordinates selected from hardware capability instead of the active renderer state,
and alias-model VBOs that rely on APIs absent from WebGL 1. The compatibility build uses a
single-texture multipass world path plus client-memory alias models, preserving the original
textures, lightmaps and models without the unstable legacy VBO emulation path.

The browser platform also fixes the render target at 1280x720 (CSS scales the complete canvas),
opens SDL audio at 48 kHz, and suppresses spectator-camera network writes during file MVD playback.
The latter prevents the unused reliable netchan buffer from filling while still updating the local
camera exactly as before.

## Production renderer direction

The compatibility renderer keeps the prototype close to the native client and provides a working
reference. The production path should replace legacy immediate-mode emulation incrementally with
the existing shader renderer adapted to WebGL 2, while preserving the same client, protocol and
filesystem layers. Demo behavior can then be compared frame-for-frame with this first milestone.

## Live QTV phase

Browsers cannot open the raw QTV TCP stream. A same-origin service will expose a WebSocket endpoint,
perform the QTV handshake upstream and forward binary stream data without modifying protocol bytes.
The web platform layer will then present the WebSocket as the client's stream transport.
