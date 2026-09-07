# Notices

Roswaal itself is licensed 0BSD; see [LICENSE](LICENSE). What follows is what
that does not cover: work by other people that Roswaal ships or stands on, and
names that are not ours.

The same list is a page in the documentation — **Attributions**, under Learn —
because the people who need to read it are not all reading the repository. The
two are kept in step by hand and a test checks that neither has gained an entry
the other is missing.

## The names

**Roswaal** and its sibling tool **Beako** are named after characters from
*Re:Zero − Starting Life in Another World* — Roswaal L. Mathers and Beatrice —
created by Tappei Nagatsuki and published by KADOKAWA. The names are a fan's
homage, chosen because each character suited what each tool does.

**This project is not affiliated with, endorsed by, or approved by KADOKAWA,
Tappei Nagatsuki, or the Re:Zero project**, and claims no rights in those names
or in anything from that work.

Nothing from Re:Zero is distributed here: no artwork, no likenesses, no text,
and not the series title. The mark in `assets/` is original work.

Roswaal is released under 0BSD and is not sold by its authors. 0BSD places no
restriction on what anyone else does with it, commercially or otherwise — those
choices, and any obligations that follow from them, belong to whoever makes
them.

## Unreal Engine

**Unreal Engine**, **Unreal** and **Blueprint** are trademarks of **Epic Games,
Inc.** They appear in Roswaal's documentation — chiefly *Coming from
Blueprints* — to name Epic's product while explaining this one. That is the
only use they are put to: they describe Epic's software, never Roswaal's.

Roswaal is **not affiliated with, endorsed by, or derived from Epic Games**. It
contains no Unreal Engine code, is not built with Unreal Engine, and is not
bound by the Unreal Engine EULA.

Source: <https://www.unrealengine.com/>

## Luau

Roswaal writes **Luau**, the language by **Roblox Corporation**, which is MIT
licensed. Luau is not bundled here; Roswaal produces it and Luau runs it.

Luau's own README asks that projects integrating it carry an attribution in
user-facing documentation, which is what this section and the Attributions page
are:

> When Luau is integrated into external projects, we ask that you honor the
> license agreement and include Luau attribution into the user-facing product
> documentation.

Luau and the Luau logo belong to Roblox. Roswaal is not affiliated with or
endorsed by Roblox.

Source: <https://luau.org/>

## Lua

Luau is based on the **Lua** 5.x implementation by **PUC-Rio**, MIT licensed.
Listed because the chain would otherwise stop one link short of where it
started.

Source: <https://www.lua.org/>

## Rojo

**Rojo** by **rojo-rbx and contributors**, MPL-2.0. Not a dependency, and listed
anyway: the whole workflow assumes it, and a tool whose documentation tells you
to run `rojo serve` should say whose work that is.

Source: <https://rojo.space/>

## Material Symbols

The icons in `src/app/icons.tsx` are **Material Symbols** by Google, inlined as
SVG path data. They reached Roswaal by way of the icon set used in beako, a
sibling tool in the same workflow.

Material Symbols is licensed under the **Apache License, Version 2.0**:

> Copyright Google LLC
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not
> use these files except in compliance with the License. You may obtain a copy
> of the License at
>
>     http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software
> distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
> WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
> License for the specific language governing permissions and limitations under
> the License.

Source: <https://fonts.google.com/icons>

## CodeMirror

The pop-out Luau editor is built on **CodeMirror 6**, which is MIT licensed.
It is a runtime dependency rather than vendored source; see `package.json` and
the licence text in `node_modules/@codemirror/*/LICENSE`.

---

Everything else in this repository is Roswaal's own and is 0BSD: use it, modify
it, ship it, train on it, no attribution required.
