/**
 * The page's watch over its own start (`src/app/bootGuard.ts`), bundled as a
 * classic script for the app pages' heads: see `theme-shell.mjs`, which emits
 * it as `boot-guard.js` and puts it before `theme.js`, so it is listening
 * before any of the app's module scripts run.
 */

import { bundleBrowser } from "./bundleBrowser.mjs";

export function buildBootGuard() {
	return bundleBrowser(
		['import { installBootGuard } from "./src/app/bootGuard.ts";', "installBootGuard();"],
		{ minify: true },
	);
}
