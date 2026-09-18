/**
 * The graph viewer that runs on the documentation site.
 *
 * Bundled from `src/app/graphView.ts` — the module the editor's own canvas
 * uses — so the drawn graphs in the docs pan and zoom with the same code and
 * cannot drift from it.
 *
 * It used to be `attachGraphView.toString()`, spliced into a file with a small
 * bootstrap after it. That is a tempting way to avoid a second copy and it
 * quietly ships the transpiler's scaffolding with the function: tsx compiles
 * with `keepNames`, so every arrow inside `attachGraphView` comes out wrapped
 * in `__name(...)`, and `__name` is a helper that exists only in the module
 * that was transpiled. Pasted into a standalone script it is undefined, and the
 * first thing the viewer does on any page is throw.
 *
 * Nothing said so. The graphs still drew — they are static SVG in the markup —
 * they just never got fitted to their frame or made draggable, so every drawn
 * graph on all 301 pages rendered at its natural size and hung out of its box.
 * A silent failure, in the only script the site has.
 *
 * Its own module so the test can build it without running the whole docs build,
 * which matters because the tests run before the docs are built.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The viewer, as a self-contained script for the documentation site. */
export async function buildGraphViewer() {
	const bundled = await build({
		stdin: {
			contents: [
				'import { attachGraphView } from "./src/app/graphView.ts";',
				'import { ZOOM } from "./src/app/layers.ts";',
				'import { PREFERENCES_KEY, wheelAction } from "./src/app/preferences.ts";',
				// The reader's scroll choice, from the editor's own store: the
				// site and the hosted editor share an origin, so Settings there
				// reaches the graphs here. Automatic when there is none.
				'let choice = "auto";',
				"try {",
				"  const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || \"{}\");",
				'  if (stored && (stored.wheel === "zoom" || stored.wheel === "pan")) choice = stored.wheel;',
				"} catch {}",
				"const wheel = wheelAction(choice);",
				'for (const box of document.querySelectorAll(".graph-viewport")) {',
				"  attachGraphView(box, { ...ZOOM, wheel });",
				"}",
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
