/**
 * The graph viewer that runs on the documentation site.
 *
 * Bundled from `src/app/graphView.ts` — the module the editor's own canvas
 * uses — so the drawn graphs in the docs pan and zoom with the same code and
 * cannot drift from it. See `bundleBrowser.mjs` for why it is bundled rather
 * than serialised with `toString()`: a viewer that throws leaves every graph
 * drawn at its natural size, hanging out of its frame, and says nothing.
 *
 * Its own module so the test can build it without running the whole docs build,
 * which matters because the tests run before the docs are built.
 */

import { bundleBrowser } from "./bundleBrowser.mjs";

/** The viewer, as a self-contained script for the documentation site. */
export async function buildGraphViewer() {
	return bundleBrowser([
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
	]);
}
