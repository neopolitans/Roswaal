# Vendored upstream licences

Each file here is another project's own `LICENSE`, copied **byte for byte**. Nothing in this folder
is written by hand, edited, reformatted, or reconstructed from a template.

| File | Copied from | Retrieved |
| --- | --- | --- |
| `tokyo-night.txt` | [`tokyo-night/tokyo-night-vscode-theme` · `LICENSE.txt`](https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/master/LICENSE.txt) | 2026-08-31 |
| `catppuccin.txt` | [`catppuccin/catppuccin` · `LICENSE`](https://github.com/catppuccin/catppuccin/blob/main/LICENSE) | 2026-08-31 |
| `nord.txt` | [`nordtheme/nord` · `license`](https://github.com/nordtheme/nord/blob/develop/license) | 2026-08-31 |

All three arrived by way of [Beako](https://github.com/neopolitans/Beako), which vendored them on the
date above and carries the same three colour schemes. They are copied across rather than re-fetched
so that the two tools ship the same bytes.

## Why these are vendored rather than generated

"MIT" is not one document. Of these three files, one is headed `MIT License`, one `MIT License (MIT)`
and one `The MIT License (MIT)`, and Nord's copyright line carries an email address and a homepage
that no template would have produced. Filling a template in produces something that is *nearly* each
author's licence, and nearly is the one thing an attribution may not be.

Beako learned this the expensive way — two of its three attribution lines were wrong until they were
checked against the files themselves, both of them plausible, both written from the shape an MIT
licence usually has rather than from the one the author wrote. Starting from the files here means
that mistake is not available to make.

## How they reach a user

`scripts/build-themes.mjs` reads each one and compiles it into `src/core/themeData.ts`, so the text
travels with the editor and is shown in full under **Settings → Licences**. A theme naming a file
that is not here fails the build rather than shipping a scheme whose terms resolve to nothing.

## Keeping them honest

These are copies, and copies go stale — an upstream can relicense, move, or correct its own file.
The build checks that each one is present and reaches the panel; it cannot check them against the
internet. When a theme's `source` URL changes, re-fetch the licence at the same time.
