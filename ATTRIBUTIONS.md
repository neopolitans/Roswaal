# Attributions

Roswaal itself is licensed 0BSD; see [LICENSE](LICENSE). What follows is everything that
does not cover: what Roswaal uses, how, and under which licence. Find your name in the
table, by rights holder.

**Roswaal is not affiliated with, endorsed by, or approved by anyone listed here.**
Trademarks belong to their owners, and are named only to say what something is.

The same list is a page in the documentation, **Attributions**, under Learn, where it can
be searched and filtered and each licence Roswaal carries opens in full.
`tests/attributions.test.ts` checks that neither copy lists something the other does not.

## How something is used

| Usage | What it means |
| --- | --- |
| Included | Code or assets that ship inside Roswaal. Its licence travels with it, in full. |
| Quoted | Someone's words, shipped inside Roswaal under their licence. Marked as theirs and not 0BSD, with what was changed. |
| Written for | What the code Roswaal generates is written for. Named to say what Roswaal works with; nothing of theirs ships. |
| Works with | Tools and formats Roswaal reads or writes. Nothing of theirs ships, and Roswaal does not run their software. |
| Example | Named in the docs, pictures or tests as a real-world example. Nothing copied. |
| Inspired by | Conventions Roswaal learned from. No code, assets, content or dependency. |
| Named after | A name used as homage. Not licensed, and no rights claimed. |

## Who and what

The licence is the licence of what Roswaal carries: **None needed** where nothing of theirs
ships.

| Rights holder | Entry | Usage | Licence | What Roswaal does with it | Where |
| --- | --- | --- | --- | --- | --- |
| Blender Foundation | [Blender](https://www.blender.org/) | Inspired by | None needed | Sets sockets on the node's border, as Blender does. | Nothing of theirs ships. |
| Canva | [Affinity](https://www.affinity.studio/) | Inspired by | None needed | Its mode strip follows Affinity's: icons beside the mark, and a box that slides. | Nothing of theirs ships. |
| Catppuccin | [Catppuccin](https://github.com/catppuccin/catppuccin) | Included | MIT | Includes Catppuccin Mocha as a colour scheme. | `themes/catppuccin-mocha.json` |
| csqrl | [Sift](https://github.com/cxmeel/sift) | Example | None needed | Its hover was tested on Sift, and its release notes name it. | Nothing of theirs ships. |
| Enkia | [Tokyo Night](https://github.com/tokyo-night/tokyo-night-vscode-theme) | Included | MIT | Includes two Tokyo Night colour schemes. | `themes/tokyo-night.json`, `themes/tokyo-night-storm.json` |
| Epic Games, Inc. | [Unreal Engine](https://www.unrealengine.com/) | Inspired by | None needed | Its graphs read like Blueprints: execution and data wires, and pins coloured by type. | Nothing of theirs ships. |
| Eryn L. K. | [Promise](https://github.com/evaera/roblox-lua-promise) | Example | None needed | Its pictures show Promise as a package not installed yet. | Nothing of theirs ships. |
| Eryn L. K. and contributors | [Moonwave](https://github.com/evaera/moonwave) | Works with | None needed | Reads Moonwave-style doc comments for hover, with its own parser. | Nothing of theirs ships. |
| Filip Tibell and contributors | [Lune](https://lune-org.github.io/docs) | Written for | None needed | Compiles a graph to a `.luau` file that Lune runs. | Nothing of theirs ships. |
| Filip Tibell and contributors | [Lune's type definitions](https://github.com/lune-org/lune) | Quoted | MPL-2.0 | Shows Lune's function signatures and parameter descriptions, unchanged, from v0.10.5. | `src/core/luneApi.ts`; licence in `notices/upstream/lune.txt` |
| Google LLC | [Material Symbols](https://fonts.google.com/icons) | Included | Apache-2.0 | Draws every icon in the editor from it. | `src/app/icons.tsx`; licence in `notices/upstream/material-symbols.txt` |
| KADOKAWA · Tappei Nagatsuki | The name “Roswaal” | Named after | None needed | Named after Roswaal L. Mathers, a character in *Re:Zero − Starting Life in Another World*. | The name only. |
| Marijn Haverbeke and contributors | [CodeMirror 6](https://codemirror.net/) | Included | MIT | Its code editor, source view and licence viewer are built on it. | The editor bundle; licence in `THIRD-PARTY-NOTICES.txt` |
| OpenJS Foundation and Node.js contributors | [Node.js](https://nodejs.org/) | Included | MIT | The release binaries contain the Node.js runtime. | Release binaries; its licence in `THIRD-PARTY-NOTICES.txt` in each zip |
| PUC-Rio | [Lua](https://www.lua.org/) | Works with | None needed | Luau, which Roswaal writes, is based on Lua. | Nothing of theirs ships. PUC-Rio's copyright line is in the Luau logo's licence. |
| Roblox Corporation | [Luau](https://luau.org/) | Written for | MIT (the logo) | Writes Luau code; this file is the attribution Luau asks for. | In the canary build only, the `.luau` file icon is the Luau logo, carried with its licence. |
| Roblox Corporation | [Roblox](https://create.roblox.com/docs) | Written for | None needed | Compiles to Luau that Roblox runs, and names the engine's classes, enums and services. | Nothing of theirs ships. |
| Roblox Corporation | [Roblox Creator Documentation](https://github.com/Roblox/creator-docs) | Quoted | CC-BY-4.0 | Shows one-sentence summaries of the engine's API. Changed: shortened, and markup removed. | `src/core/robloxEngine.json`, `src/core/robloxMembers.ts`; licence in `notices/upstream/creator-docs.txt` |
| Roblox Corporation | [Roact](https://github.com/Roblox/roact) | Example | None needed | Its docs use `@roact` as the example of an alias. | Nothing of theirs ships. |
| rojo-rbx and contributors | [Rojo](https://rojo.space/) | Works with | None needed | Writes the files Rojo syncs into a place. | Nothing of theirs ships. |
| Savage Interactive Pty Ltd | [Procreate](https://procreate.com/) | Inspired by | None needed | Floats its tools in small clusters at the window's edge, as Procreate does. | Nothing of theirs ships. |
| Stephen Leitnick | [Signal](https://github.com/Sleitnick/RbxUtil) | Example | None needed | Its docs and tests use Signal as the example Wally package. | Nothing of theirs ships. |
| Sven Greb | [Nord](https://github.com/nordtheme/nord) | Included | MIT | Includes Nord as a colour scheme. | `themes/nord.json` |
| Their authors | Open-source packages | Included | MIT, ISC and BSD-3-Clause | Includes the packages it is built with, React and Express among them. | Each build's `THIRD-PARTY-NOTICES.txt`, and every release zip |
| Unity Technologies | [Unity Visual Scripting (Bolt)](https://unity.com/features/unity-visual-scripting) | Inspired by | None needed | Draws execution pins as triangles outside the node, as Bolt does. | Nothing of theirs ships. |
| Uplift Games and contributors | [Wally](https://github.com/UpliftGames/wally) | Works with | None needed | Reads Wally packages, and searches the public Wally registry. | Nothing of theirs ships. |

Luau's README asks for this:

> When Luau is integrated into external projects, we ask that you honor the license
> agreement and include Luau attribution into the user-facing product documentation.

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

## The name

**Roswaal** is named after Roswaal L. Mathers, a character in *Re:Zero − Starting Life in
Another World* by Tappei Nagatsuki, published by KADOKAWA. The name is a fan's homage.

Roswaal is not affiliated with, endorsed by, or approved by KADOKAWA, Tappei Nagatsuki, or
the Re:Zero project, and claims no rights in their names or work. No artwork, likeness or
text from it is used, and the mark in `assets/` is original.

Roswaal is 0BSD and is not sold by its authors. What anyone else does with it, and anything
that follows from that, is theirs.

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
