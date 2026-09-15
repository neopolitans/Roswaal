/**
 * The demo project, read off disk and handed to the bundle as a module.
 *
 * This was an `import.meta.glob` in `src/web/seed.ts`, which is the obvious
 * tool for the job and quietly the wrong one: **Vite resolves a dot directory
 * in dev and not in a production build.** The dev server and Vitest both saw
 * all eleven of the demo's files; `vite build` saw the five that are not under
 * `.roswaal/`, which is to say it saw the compiled Luau and nothing that
 * produced it. The playground ran, opened a project, showed a tree, and had no
 * graphs in it — and only in the built copy, which is the one a stranger loads.
 *
 * So the walk happens here, once, in code that does not care what a file is
 * called. Dev, build and test all import the same module and get the same
 * bytes, which is the property that was actually wanted — `tests/seed.test.ts`
 * now proves something about the site rather than about the dev server.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const VIRTUAL_ID = "virtual:roswaal-seed";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

/** Every file under `dir`, keyed by its path relative to it, forward slashes. */
async function readProject(dir) {
	const files = {};

	const walk = async (at) => {
		for (const entry of await readdir(at, { withFileTypes: true })) {
			const abs = join(at, entry.name);
			if (entry.isDirectory()) {
				await walk(abs);
				continue;
			}
			files[relative(dir, abs).split(sep).join("/")] = await readFile(abs, "utf8");
		}
	};

	await walk(dir);
	return files;
}

/**
 * Serves `virtual:roswaal-seed`: the demo's files as `{ path: contents }`.
 *
 * Mounted by both Vite configs — by the web one because the playground needs
 * it, and by the daemon one because Vitest reads that config and the seed test
 * imports the module it feeds. The daemon's own bundle never imports it, so
 * being present there costs nothing.
 */
export function demoSeedPlugin(projectDir) {
	return {
		name: "roswaal-demo-seed",

		resolveId(id) {
			return id === VIRTUAL_ID ? RESOLVED_ID : null;
		},

		async load(id) {
			if (id !== RESOLVED_ID) return null;

			const files = await readProject(projectDir);
			// So editing the demo reloads the playground, the way editing any
			// other source file does.
			for (const relPath of Object.keys(files)) {
				this.addWatchFile(join(projectDir, relPath));
			}
			return `export default ${JSON.stringify(files)};\n`;
		},
	};
}
