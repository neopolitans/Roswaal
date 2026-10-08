# Attributions

Roswaal itself is licensed 0BSD; see [LICENSE](LICENSE). What follows is everything that
does not cover: what Roswaal uses, how, and under which licence.

**Roswaal is not affiliated with, endorsed by, or approved by anyone listed here.**
Trademarks belong to their owners, and are named only to say what something is.

The same list is a page in the documentation, **Attributions**, under Learn, with each
licence Roswaal carries shown in full. `tests/attributions.test.ts` checks that neither
copy lists something the other does not.

## The name

**Roswaal** is named after Roswaal L. Mathers, a character in *Re:Zero − Starting Life in
Another World* by Tappei Nagatsuki, published by KADOKAWA. The name is a fan's homage.

Roswaal is not affiliated with, endorsed by, or approved by KADOKAWA, Tappei Nagatsuki, or
the Re:Zero project, and claims no rights in their names or work. No artwork, likeness or
text from it is used, and the mark in `assets/` is original.

Roswaal is 0BSD and is not sold by its authors. What anyone else does with it, and anything
that follows from that, is theirs.

## What Roswaal is designed for

The language and runtimes the code Roswaal generates is written for.

| Platform | By | Licence | What Roswaal does with it | Where |
| --- | --- | --- | --- | --- |
| [Luau](https://luau.org/) | Roblox Corporation | MIT (the logo) | Writes Luau code; this file is the attribution Luau asks for. | In the canary build only, the `.luau` file icon is the Luau logo, carried with its licence. |
| [Roblox](https://create.roblox.com/docs) | Roblox Corporation | None needed | Compiles to Luau that Roblox runs, and names the engine's classes, enums and services. | Nothing of theirs ships. |
| [Lune](https://lune-org.github.io/docs) | Filip Tibell and contributors | None needed | Compiles a graph to a `.luau` file that Lune runs. | Nothing of theirs ships. |

Luau's README asks for this:

> When Luau is integrated into external projects, we ask that you honor the license
> agreement and include Luau attribution into the user-facing product documentation.

## What Roswaal is built on

What ships inside Roswaal, and the tools and formats it works with.

| Project | By | Licence | What Roswaal does with it | Where |
| --- | --- | --- | --- | --- |
| [Material Symbols](https://fonts.google.com/icons) | Google LLC | Apache-2.0 | Draws every icon in the editor from it. | `src/app/icons.tsx`; licence in `notices/upstream/material-symbols.txt` |
| [CodeMirror 6](https://codemirror.net/) | Marijn Haverbeke and contributors | MIT | Its code editor, source view and licence viewer are built on it. | The editor bundle; licence in `THIRD-PARTY-NOTICES.txt` |
| [Node.js](https://nodejs.org/) | OpenJS Foundation and Node.js contributors | MIT | The release binaries contain the Node.js runtime. | Release binaries; its licence in `THIRD-PARTY-NOTICES.txt` in each zip |
| Open-source packages | Their authors | MIT, ISC and BSD-3-Clause | Includes the packages it is built with, React and Express among them. | Each build's `THIRD-PARTY-NOTICES.txt`, and every release zip |
| [Lua](https://www.lua.org/) | PUC-Rio | None needed | Luau, which Roswaal writes, is based on Lua. | Nothing of theirs ships. PUC-Rio's copyright line is in the Luau logo's licence. |
| [Tokyo Night](https://github.com/tokyo-night/tokyo-night-vscode-theme) | Enkia | MIT | Includes two Tokyo Night colour schemes. | `themes/tokyo-night.json`, `themes/tokyo-night-storm.json` |
| [Catppuccin](https://github.com/catppuccin/catppuccin) | Catppuccin | MIT | Includes Catppuccin Mocha as a colour scheme. | `themes/catppuccin-mocha.json` |
| [Nord](https://github.com/nordtheme/nord) | Sven Greb | MIT | Includes Nord as a colour scheme. | `themes/nord.json` |
| [Rojo](https://rojo.space/) | rojo-rbx and contributors | None needed | Writes the files Rojo syncs into a place. | Nothing of theirs ships. |
| [Wally](https://github.com/UpliftGames/wally) | Uplift Games and contributors | None needed | Reads Wally packages, and searches the public Wally registry. | Nothing of theirs ships. |
| [Moonwave](https://github.com/evaera/moonwave) | Eryn L. K. and contributors | None needed | Reads Moonwave-style doc comments for hover, with its own parser. | Nothing of theirs ships. |
| [Roblox Creator Documentation](https://github.com/Roblox/creator-docs) | Roblox Corporation | CC-BY-4.0 | Shows one-sentence summaries of the engine's API. Changed: shortened, and markup removed. | `src/core/robloxEngine.json`, `src/core/robloxMembers.ts`; licence in `notices/upstream/creator-docs.txt` |
| [Lune's type definitions](https://github.com/lune-org/lune) | Filip Tibell and contributors | MPL-2.0 | Shows Lune's function signatures and parameter descriptions, unchanged, from v0.10.5. | `src/core/luneApi.ts`; licence in `notices/upstream/lune.txt` |

**Text that stays under its own licence**, not Roswaal's 0BSD: the summaries from Roblox's
Creator Documentation, © Roblox Corporation, under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); and Lune's descriptions, under
the [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/), whose source is the
[Lune repository](https://github.com/lune-org/lune).

**The licences Roswaal carries** are copied byte for byte into `notices/upstream/` (see its
README for where each came from) and shown in full under **Settings → Licences** and on the
Attributions page. Every package a build bundles is listed, with its own licence file, in
the `THIRD-PARTY-NOTICES.txt` written beside that build and zipped with every release.

**Roswaal Light**, **Roswaal Dark** and **Aquatic** are the maintainer's own work, carry no
third-party claim, and ship 0BSD with the rest of the repository.

## What Roswaal is tested with

Libraries named in the documentation as examples. Nothing of theirs ships.

| Library | By | What Roswaal does with it |
| --- | --- | --- |
| [Sift](https://github.com/cxmeel/sift) | csqrl | Its hover was tested on Sift, and its release notes name it. |
| [Signal](https://github.com/Sleitnick/RbxUtil) | Stephen Leitnick | Its docs and tests use Signal as the example Wally package. |
| [Promise](https://github.com/evaera/roblox-lua-promise) | Eryn L. K. | Its pictures show Promise as a package not installed yet. |
| [Roact](https://github.com/Roblox/roact) | Roblox Corporation | Its docs use `@roact` as the example of an alias. |

## What Roswaal is inspired by

Conventions Roswaal learned from. No code, assets, content or dependency.

| Project | By | What Roswaal does with it |
| --- | --- | --- |
| [Unreal Engine](https://www.unrealengine.com/) | Epic Games, Inc. | Its graphs read like Blueprints: execution and data wires, and pins coloured by type. |
| [Unity Visual Scripting (Bolt)](https://unity.com/features/unity-visual-scripting) | Unity Technologies | Draws execution pins as triangles outside the node, as Bolt does. |
| [Blender](https://www.blender.org/) | Blender Foundation | Sets sockets on the node's border, as Blender does. |
| [Affinity](https://www.affinity.studio/) | Canva | Its mode strip follows Affinity's: icons beside the mark, and a box that slides. |
| [Procreate](https://procreate.com/) | Savage Interactive Pty Ltd | Floats its tools in small clusters at the window's edge, as Procreate does. |

## Trademarks

- Luau is a trademark of Roblox Corporation. Roblox, and the names of the engine's classes
  and services, belong to Roblox Corporation.
- Unreal, Unreal Engine and Blueprint are trademarks or registered trademarks of Epic Games,
  Inc. in the United States of America and elsewhere.
- Unity and Bolt are trademarks or registered trademarks of Unity Technologies.
- Blender is a registered trademark of the Blender Foundation.
- Affinity is a trademark of Canva, its affiliates or its licensors.
- Procreate® is a registered trademark of Savage Interactive Pty Ltd. Roswaal is not owned
  or endorsed by, or affiliated with, Procreate.

## How Roswaal is made

Roswaal is designed and directed by its maintainer, and much of its code is written with
Claude, Anthropic's AI model. The commits Claude helped write credit it as a co-author.

Nothing of Anthropic's is in Roswaal, and Roswaal is not affiliated with or endorsed by
Anthropic.

---

Everything else in this repository is Roswaal's own and is 0BSD: use it, modify it, ship
it, train on it, no attribution required.
