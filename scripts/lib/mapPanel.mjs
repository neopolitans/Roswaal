/**
 * The map panel's behaviour, for the documentation site.
 *
 * Bundled from `src/app/mapPanel.ts` — the module the editor's own Docs window
 * calls — so selecting a row on the published page behaves the same way it
 * does in the app, and neither can drift from the other.
 *
 * Bundled rather than spliced in with `toString()`, for the reason written up
 * at length in `graphViewer.mjs`: tsx compiles with `keepNames`, so a function
 * serialised out of a module carries `__name(...)` calls to a helper that only
 * exists in the module it left behind, and the script throws on its first line
 * of every page without saying so.
 *
 * Its own module, beside the toolbar linker's, so a test can build it without
 * running the whole docs build — the tests run before the docs are built.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The map panel, as a self-contained script for the documentation site. */
export async function buildMapPanel() {
	const bundled = await build({
		stdin: {
			contents: [
				'import { attachMapPanels } from "./src/app/mapPanel.ts";',
				"attachMapPanels(document);",
			].join(String.fromCharCode(10)),
			resolveDir: root,
			loader: "ts",
		},
		bundle: true,
		format: "iife",
		target: "es2020",
		write: false,
		legalComments: "none",
	});
	return bundled.outputFiles[0].text;
}
