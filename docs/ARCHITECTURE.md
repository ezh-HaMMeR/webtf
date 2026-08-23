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

The black-screen failure found during the prototype was not an MVD parser problem. The legacy
renderer allocated RGB texture storage but uploaded the decoded Quake textures as RGBA. WebGL
rejects that format mismatch, while desktop OpenGL accepts it more permissively. The Emscripten
path now allocates matching RGBA storage, so the original world, models, HUD and TF assets render.

## Production renderer direction

The compatibility renderer keeps the prototype close to the native client and provides a working
reference. The production path should replace legacy immediate-mode emulation incrementally with
the existing shader renderer adapted to WebGL 2, while preserving the same client, protocol and
filesystem layers. Demo behavior can then be compared frame-for-frame with this first milestone.

## Live QTV phase

Browsers cannot open the raw QTV TCP stream. A same-origin service will expose a WebSocket endpoint,
perform the QTV handshake upstream and forward binary stream data without modifying protocol bytes.
The web platform layer will then present the WebSocket as the client's stream transport.
