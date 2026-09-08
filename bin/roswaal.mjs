#!/usr/bin/env node
/**
 * The launcher npm installs.
 *
 * `bin/roswaal` and `bin/roswaal.cmd` beside this do the same job for anyone who
 * puts this directory on their PATH by hand. This one exists because **npm
 * cannot shim them on Windows**: it reads the `#!/bin/sh` line off the shell
 * script and writes a wrapper that calls `sh`, which a Windows machine does not
 * have, so `npm install -g roswaal` produced a `roswaal` that failed with
 * "the term '/bin/sh.exe' is not recognized". A Node shebang gets a Node
 * wrapper, which works everywhere Node does.
 *
 * Still a script calling an interpreter rather than a packaged executable, for
 * the reason the other two give: Smart App Control blocks unsigned binaries it
 * has not seen before, so every rebuild of a `roswaal.exe` would be blocked
 * afresh. Calling an already-trusted interpreter sidesteps that entirely.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(home, "dist-cli", "roswaal.mjs");

if (!existsSync(entry)) {
	console.error("roswaal: the CLI has not been built yet.");
	console.error(`  Run:  npm install && npm run build`);
	console.error(`  In:   ${home}`);
	process.exit(1);
}

// Where the developer actually is, and where the tool lives. The CLI reads
// ROSWAAL_CWD rather than trusting the process working directory, because a
// global install runs from wherever npm put it.
process.env.ROSWAAL_CWD = process.env.ROSWAAL_CWD ?? process.cwd();
process.env.ROSWAAL_HOME = home;

// Imported rather than spawned: this process is already the Node the shell
// scripts go looking for, and a child would double the startup cost and lose
// the exit code unless it were carefully passed back.
await import(pathToFileURL(entry).href);
