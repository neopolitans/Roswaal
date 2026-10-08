/**
 * The page's own checkboxes, its device tabs, walkthroughs and the
 * attributions browser, for the documentation site.
 *
 * Bundled from `src/app/docsToggle.ts` — the module the editor's own Docs
 * window uses — so a preference set on the published site and one set in the
 * app are the same preference, read and written the same way. See
 * `bundleBrowser.mjs` for why it is bundled.
 */

import { bundleBrowser } from "./bundleBrowser.mjs";

/** The toggles, as a self-contained script for the documentation site. */
export async function buildDocsToggle() {
	return bundleBrowser([
		'import { attachDocsToggles } from "./src/app/docsToggle.ts";',
		'import { attachDeviceTabs } from "./src/app/docsDevice.ts";',
		'import { attachWalkthroughs } from "./src/app/docsWalk.ts";',
		'import { attachAttributions } from "./src/app/attributionsBrowser.ts";',
		"attachDocsToggles(document);",
		// The published site is the web app's, so a computer is its Desktop (Webapp).
		"attachDeviceTabs(document, false);",
		"attachWalkthroughs(document);",
		// The Attributions page's browser: search, filters and the licence dialog.
		"attachAttributions(document);",
	]);
}
