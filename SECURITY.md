# Security policy

## Reporting a vulnerability

Report it privately, through GitHub: on
[neopolitans/Roswaal](https://github.com/neopolitans/Roswaal), open
**Security › Report a vulnerability**
([direct link](https://github.com/neopolitans/Roswaal/security/advisories/new)).
Only the maintainer sees the report. Please do not open a public issue for it.

Say what is affected, how to reproduce it, and what it lets someone do. A proof
of concept helps, as do the version (beside the name on the start screen, or
`roswaal version`) and the platform.

## What happens next

- **A first reply within 7 days**, and sooner where possible: Roswaal is kept by
  one person, so the aim is 7 days and best efforts are made to answer earlier.
- **A fix, or a plan for one,** agreed with you before anything is published.
- **A published advisory** once the fix is released, crediting you if you wish,
  as with
  [GHSA-2c7q-r3r3-267v](https://github.com/neopolitans/Roswaal/security/advisories/GHSA-2c7q-r3r3-267v)
  and
  [GHSA-x8ww-6jq2-6fj8](https://github.com/neopolitans/Roswaal/security/advisories/GHSA-x8ww-6jq2-6fj8).

## Supported versions

| Version | Fixed |
| --- | --- |
| The latest stable release (1.x) | Yes: a patch release |
| Canary builds ([roswaal-canary](https://github.com/neopolitans/roswaal-canary), canary.roswaal.app) | Yes: in the next canary build |
| 0.x | No: update to the latest release |

## In scope

- **The daemon** (`roswaal serve`): its local HTTP API, what it reads and writes
  on disk, the folders it opens, and what it downloads (Wally packages, GitHub
  repositories).
- **The website** ([roswaal.app](https://roswaal.app) and
  [canary.roswaal.app](https://canary.roswaal.app)): the editor running in the
  browser, and the folders and storage it is given.
- **Sign in with Roblox**: how the sign-in is kept, and what it downloads.
- **The release binaries**, and the Luau Roswaal generates.

## Out of scope

- Roblox itself, Roblox Studio and Rojo: report those to their owners.
- The services the website runs on (GitHub Pages, Cloudflare), unless Roswaal's
  own configuration is at fault.
- Findings that need an attacker who already controls your computer or your
  browser profile.

## Good faith

Research done in good faith to find and report a problem is welcome. Test
against your own installation and your own data, never other people's, and give
a reasonable time for a fix before saying anything in public.
