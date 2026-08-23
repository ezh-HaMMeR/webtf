# Third-party components

## FTEQW

- Source: https://github.com/fte-team/fteqw
- License: GNU General Public License version 2
- Browser build reference: `FTE_TARGET=web`

Prototype engine binaries are downloaded locally by
`scripts/prepare-local-assets.ps1`, verified by SHA-256, and excluded from this
repository. A production release should publish its pinned FTEQW source commit
and reproducible build instructions alongside the WebAssembly artifacts.

## QuakeWorld Hub

- Source: https://github.com/quakeworldnu/hub.quakeworld.nu
- License: MIT

Its public demo-player and QTV integrations were used as an architectural
reference for the FTEQW JavaScript bridge and browser controls.

## Game data

Quake and Team Fortress PAK files, maps, models, textures, and sounds are not
part of this repository. They remain in the user's installed client and are
copied only into a gitignored local test directory.
