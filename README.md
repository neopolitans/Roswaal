# Roswaal

Visual scripting for Roblox Luau and Lune Luau. Graphs live on disk as
`.nodescript` files and compile to plain `.luau` that Rojo syncs like any other
source file.

```
.roswaal/scripts/*.nodescript  →  roswaal  →  src/*.luau  →  rojo  →  Studio
```

> Prototype. The compiler and its tests are the load-bearing parts and are
> solid; the editor is complete enough to build real graphs with. **Lune support
> is experimental** — Roswaal is built and checked against Roblox.

## Install

```sh
git clone https://github.com/neopolitans/Roswaal
cd Roswaal
npm install
npm run build
npm link
```

`npm link` puts `roswaal` on your PATH pointing at this checkout, so a rebuild
takes effect without reinstalling, and `npm unlink -g roswaal` undoes it. To
avoid a global install, add this checkout's `bin/` to your PATH instead — note
that PATH changes only apply to terminals opened afterwards.

## Start

```sh
cd path/to/your/roblox/project
roswaal init      # writes roswaal.json and .roswaal/. Once per project.
roswaal serve     # editor on http://127.0.0.1:4471, docs at /docs
```

There is a project you can open without writing anything first in
[`examples/demo`](examples/demo): `cd` into it and run `roswaal serve`.

`roswaal help` lists every command. Restart the daemon after rebuilding —
`serve` loads the CLI bundle once, so a rebuild does not reach a daemon that is
already running.

## The documentation

**Everything else is in the docs**, served by the daemon at
<http://127.0.0.1:4471/docs>: the guides, a reference page for every node
including your own packs, the controls, and *Coming from Blueprints* for anyone
arriving from Unreal Engine. It opens in its own window, so it can sit beside
the graph you are reading about.

A published copy will follow once there is a release worth publishing.

```sh
npm run dev        # daemon on :4471, editor on :4470 with hot reload
npm test           # the compiler, the emitter, and the editor's pure parts
npm run build:docs # the documentation as a static site, into dist-docs/
```

## Licence

Roswaal is **0BSD**: use it, modify it, ship it, train on it, no attribution
required. Two bundled things keep their own terms — the icons (Material Symbols,
Apache-2.0) and CodeMirror (MIT) — and three of the seven colour schemes are
somebody else's design, MIT licensed and credited in full. See
[NOTICE.md](NOTICE.md).

Unreal Engine, Unreal and Blueprint are trademarks of Epic Games, Inc. They
appear in the documentation to name Epic's product while explaining this one.
Roswaal is not affiliated with, endorsed by, or derived from Epic Games.

## For anyone picking this up

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the module map, the
  invariants each layer holds, how one node becomes Luau, and where to cut in to
  add a node or a canvas gesture.
- **[NOTES.md](NOTES.md)** — the working state: what is done, what is next, the
  decisions worth not re-litigating, and the traps that cost real time to find.
- **Contributing** — in the docs, built from this repository's own scripts and
  tests, including where help is wanted.
