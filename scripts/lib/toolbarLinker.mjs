/**
 * The toolbar highlighting that runs on the documentation site.
 *
 * Bundled from `src/app/toolbarLink.ts` — the module the editor's own Docs
 * window calls — so hovering a button on the published page behaves the same
 * way it does in the app, and neither can drift from the other. See
 * `bundleBrowser.mjs` for why it is bundled.
 *
 * Its own module, beside the graph viewer's, so a test can build it without
 * running the whole docs build — the tests run before the docs are built.
 */

import { bundleBrowser } from "./bundleBrowser.mjs";

/** The highlighting, as a self-contained script for the documentation site. */
export async function buildToolbarLinker() {
	return bundleBrowser([
		'import { attachToolbarLinks } from "./src/app/toolbarLink.ts";',
		"attachToolbarLinks(document);",
	]);
}
