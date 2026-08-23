# Third-party components

WebTF links and redistributes generated output from third-party open-source projects. Their source
trees and license texts are not vendored into this repository; the build downloads them from their
upstream projects or through vcpkg.

- **ezquake-tf / ezQuake** — GNU General Public License v2 or later. The prototype pins commit
  `32b7f835a322f18f42696d5ed314dfb0aec32f55` from
  <https://github.com/ezh-HaMMeR/ezquake-tf> and stores the WebAssembly changes as a patch.
- **Emscripten SDK** — MIT and component licenses; pinned to 6.0.8.
- **SDL 2** — zlib license; supplied by the Emscripten port.
- **vcpkg-built libraries** — each package installs its own copyright information into the local
  build tree. The current prototype uses Expat, libjpeg-turbo, Jansson, MiniZip, PCRE2, libpng,
  libsndfile, zlib, curl, FreeType, Speex and SpeexDSP.

Quake and TeamFortress game data under `assets/` is not committed or redistributed by this
repository. A local build stages it from the user's existing `C:\Games\ezquake-tf` installation.
