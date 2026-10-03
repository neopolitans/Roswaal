/**
 * The site's search and chrome, for the documentation site.
 *
 * `docsSearch.ts` first, because it publishes the index and the ranking that
 * `docsChrome.js` reads off the window. See `bundleBrowser.mjs` for why both
 * are bundled.
 */

import { bundleBrowser } from "./bundleBrowser.mjs";

/** The sidebar search, the Copy buttons, the settings and the palette. */
export async function buildDocsClient() {
	return bundleBrowser([
		'import "./scripts/lib/docsSearch.ts";',
		'import "./scripts/lib/docsChrome.js";',
	]);
}
