# Contributing to Roswaal

Thank you for helping. The full guide, with where help is wanted and how the
docs are reviewed, is [Contributing](https://roswaal.app/docs/contributing.html)
in the docs; this page is the short version.

## Reporting a problem or asking for something

[Open an issue](https://github.com/neopolitans/Roswaal/issues/new/choose) on
this repository. Say which version (beside the name on the start screen, or
`roswaal version`), the platform, what you did and what happened. Every docs
page has an edit button that opens an issue for that page.

A security problem is reported privately instead: see [SECURITY.md](SECURITY.md).

## Where changes go

New work lands on [roswaal-canary](https://github.com/neopolitans/roswaal-canary)
first, is tried on [canary.roswaal.app](https://canary.roswaal.app), and reaches
this repository in a stable release. Pull requests are welcome on either; one
against the canary is the quickest to try.

## Building it

```sh
npm install
npm run dev          # the daemon and the editor, reloading as you edit
npm test             # the test suite
npm run typecheck    # the code and the build scripts
npm run lint         # formatting, import order and the style rules
npm run build        # themes, the editor and the command line
```

## What a change brings with it

- **Tests**, in `tests/`, run with `npm test`.
- **A release-notes entry** at the top of the newest file in
  `src/core/docs/releases/`, and the version bumped in `version.json` and
  `package.json`.
- **Code that follows [STYLE.md](STYLE.md).** `npm run format` fixes what a tool
  can; format only the files you changed.

## Licence and conduct

Roswaal is 0BSD, and so is anything contributed to it. Everyone taking part
follows the [Code of Conduct](CODE_OF_CONDUCT.md).
