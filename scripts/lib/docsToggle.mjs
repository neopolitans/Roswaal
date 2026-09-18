/**
 * The page's own checkboxes, and its device tabs, for the documentation site.
 *
 * Bundled from `src/app/docsToggle.ts` — the module the editor's own Docs
 * window uses — so a preference set on the published site and one set in the
 * app are the same preference, read and written the same way.
 *
 * Bundled rather than spliced in with `toString()`, for the reason written up
 * at length in `graphViewer.mjs`: tsx compiles with `keepNames`, so a function
 * serialised out of a module carries `__name(...)` calls to a helper that only
 * exists in the module it left behind.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The toggles, as a self-contained script for the documentation site. */
export async function buildDocsToggle() {
	const bundled = await build({
		stdin: {
			contents: [
				'import { attachDocsToggles } from "./src/app/docsToggle.ts";',
				'import { attachDeviceTabs } from "./src/app/docsDevice.ts";',
				"attachDocsToggles(document);",
				// The published site is the web app's, so a computer is its Desktop (Webapp).
				"attachDeviceTabs(document, false);",
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
