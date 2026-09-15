/**
 * The project the playground opens with.
 *
 * `examples/demo` itself, read at build time, rather than a fixture written out
 * here. The demo is the project the daemon's own tests open and the one the
 * README points a first-time reader at, so baking it in means the thing a
 * stranger tries in a browser tab is the thing a developer gets on their
 * machine — including its two node packs, which are most of what makes it worth
 * opening at all.
 *
 * Read by `scripts/demo-seed.mjs`, not by a glob in this file. The glob is the
 * obvious way to do it and it does not survive a production build: Vite
 * descends into a dot directory in dev and not in `vite build`, and everything
 * in a Roswaal project that is not compiled output lives under `.roswaal/`.
 * That comment is in the plugin, with what it cost.
 */

import files from "virtual:roswaal-seed";

/**
 * Where the project is mounted on the volume.
 *
 * Absolute and posix, because that is what the volume is. It shows in the
 * editor wherever a project root shows — the window title, the project menu —
 * so it is named for what it is rather than given a path that pretends to be
 * somebody's disk.
 */
export const PLAYGROUND_ROOT = "/demo";

/** The demo's files, keyed by where each one goes on the volume. */
export function playgroundFiles(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [relPath, contents] of Object.entries(files)) {
		out[`${PLAYGROUND_ROOT}/${relPath}`] = contents;
	}
	return out;
}
