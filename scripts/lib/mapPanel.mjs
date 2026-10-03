/**
 * The map panel's behaviour, for the documentation site.
 *
 * Bundled from `src/app/mapPanel.ts` — the module the editor's own Docs window
 * calls — so selecting a row on the published page behaves the same way it
 * does in the app, and neither can drift from the other. See
 * `bundleBrowser.mjs` for why it is bundled.
 *
 * Its own module, beside the toolbar linker's, so a test can build it without
 * running the whole docs build — the tests run before the docs are built.
 */

import { bundleBrowser } from "./bundleBrowser.mjs";

/** The map panel, as a self-contained script for the documentation site. */
export async function buildMapPanel() {
	return bundleBrowser([
		'import { attachMapPanels } from "./src/app/mapPanel.ts";',
		"attachMapPanels(document);",
	]);
}
