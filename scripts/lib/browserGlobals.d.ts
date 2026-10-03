/**
 * What the documentation site's scripts hand each other on the window.
 *
 * `theme.js` (`themePaint.mjs`) publishes `__roswaal` before the page is
 * parsed; `docs.js` reads it to draw the settings popover. Declared here so
 * `tsconfig.scripts.json` checks `docsChrome.js` against what is really there.
 * `__roswaalSearch` is declared beside the code that publishes it, in
 * `docsSearch.ts`.
 */

import type { DOCS_FONTS, readPreferences, writePreferences } from "../../src/app/preferences.ts";
import type { Theme } from "../../src/core/theme.ts";

declare global {
	interface Window {
		__roswaal?: {
			read: typeof readPreferences;
			write: typeof writePreferences;
			paint: () => void;
			themes: Theme[];
			fonts: typeof DOCS_FONTS;
		};
	}
}
