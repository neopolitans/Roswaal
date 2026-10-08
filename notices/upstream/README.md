# Vendored upstream licences

Each file here is another project's own `LICENSE`, copied **byte for byte**. Nothing in this folder
is written by hand, edited, reformatted, or reconstructed from a template.

| File | Copied from | Retrieved |
| --- | --- | --- |
| `tokyo-night.txt` | [`tokyo-night/tokyo-night-vscode-theme` · `LICENSE.txt`](https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/master/LICENSE.txt) | 2026-08-31 |
| `catppuccin.txt` | [`catppuccin/catppuccin` · `LICENSE`](https://github.com/catppuccin/catppuccin/blob/main/LICENSE) | 2026-08-31 |
| `nord.txt` | [`nordtheme/nord` · `license`](https://github.com/nordtheme/nord/blob/develop/license) | 2026-08-31 |
| `luau-site.txt` | [`luau-lang/site` · `LICENSE.md`](https://github.com/luau-lang/site/blob/master/LICENSE.md) | 2026-10-05 |
| `material-symbols.txt` | [`google/material-design-icons` · `LICENSE`](https://github.com/google/material-design-icons/blob/master/LICENSE) | 2026-10-08 |
| `lune.txt` | [`lune-org/lune` · `LICENSE.txt` at `v0.10.5`](https://github.com/lune-org/lune/blob/v0.10.5/LICENSE.txt) | 2026-10-08 |
| `creator-docs.txt` | [`Roblox/creator-docs` · `LICENSE`](https://github.com/Roblox/creator-docs/blob/main/LICENSE) | 2026-10-08 |

`luau-site.txt` covers the Luau logo, whose two squares are the `.luau` file icon. It was fetched
directly, and reaches a user under **Settings → Licences** as the theme licences do.

`material-symbols.txt` covers the editor's icons, which `src/app/icons.tsx` inlines as path data
rather than installing as a package, so nothing generated would find their licence. `lune.txt`
covers the descriptions in `src/core/luneApi.ts`, taken at the tag they were generated from, and
`creator-docs.txt` the summaries in `src/core/robloxEngine.json` and `src/core/robloxMembers.ts`.
The upstream repository has no `NOTICE` file for the icons, so the licence is all Apache-2.0 asks
to carry.

Every file was vendored on the date above from the upstream file linked in the table, and is kept
exactly as it was fetched.

## Why these are vendored rather than generated

"MIT" is not one document. Of these three files, one is headed `MIT License`, one `MIT License (MIT)`
and one `The MIT License (MIT)`, and Nord's copyright line carries an email address and a homepage
that no template would have produced. Filling a template in produces something that is *nearly* each
author's licence, and nearly is the one thing an attribution may not be.

This has gone wrong before: two of three attribution lines written for these schemes were wrong
until they were checked against the files themselves, both of them plausible, both written from the
shape an MIT licence usually has rather than from the one the author wrote. Starting from the files
here means that mistake is not available to make.

## How they reach a user

`scripts/build-themes.mjs` reads each one and compiles it into `src/core/themeData.ts`, so the text
travels with the editor and is shown in full under **Settings → Licences**. A theme naming a file
that is not here fails the build rather than shipping a scheme whose terms resolve to nothing.

## Keeping them honest

These are copies, and copies go stale — an upstream can relicense, move, or correct its own file.
The build checks that each one is present and reaches the panel; it cannot check them against the
internet. When a theme's `source` URL changes, re-fetch the licence at the same time.
