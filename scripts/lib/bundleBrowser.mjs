/**
 * One esbuild call for every script the documentation site runs.
 *
 * Each script the site ships is the editor's own module, bundled, so the page
 * and the app run the same code. Bundled rather than spliced in with
 * `toString()`: tsx compiles with `keepNames`, so a function serialised out of
 * a module carries `__name(...)` calls to a helper that exists only in the
 * module it left behind, and the pasted script throws on its first line.
 *
 * Not for the landing page, which builds its own script.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * An entry module, bundled into one self-contained IIFE for a browser.
 *
 * @param {string | string[]} entry The entry's source, as lines or one string.
 *   Its imports resolve from the repository root: `./src/app/graphView.ts`.
 * @param {{ minify?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function bundleBrowser(entry, options = {}) {
	const bundled = await build({
		stdin: {
			contents: Array.isArray(entry) ? entry.join(String.fromCharCode(10)) : entry,
			resolveDir: root,
			loader: "ts",
		},
		bundle: true,
		format: "iife",
		target: "es2020",
		...(options.minify ? { minify: true } : {}),
		write: false,
		legalComments: "none",
	});
	return bundled.outputFiles[0].text;
}
