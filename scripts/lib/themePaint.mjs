/**
 * The colour scheme, for the documentation site.
 *
 * The site ships `theme.css`, which follows the operating system — so a
 * developer who picked Nord in the editor and clicked Docs got the reference in
 * whatever the OS was set to. The editor's Docs *window* never had this problem
 * because it is the same bundle; the published site is plain HTML and had no
 * way to ask.
 *
 * It can ask, because a preference lives in `localStorage` and the site is the
 * same origin as the editor. That is the whole reason preferences are stored
 * there rather than by the daemon — written up in `preferences.ts` — and this
 * is the case it was stored there for.
 *
 * Bundled from the editor's own modules for the reason `toolbarLinker.mjs`
 * gives: a scheme applied by a copy of `applyTheme` would be a second
 * implementation of the one thing that must not disagree between the app and
 * the site.
 *
 * ## Why it blocks
 *
 * The tag is not `defer`. A deferred script runs after the document is parsed,
 * which means the page paints in the stylesheet's colours and then corrects
 * itself — a white flash on the way into a dark theme, on every page, every
 * time. Blocking costs a few kilobytes of parse before first paint and is the
 * right trade for the thing a reader sees first.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The developer's scheme, as a self-contained script for the site. */
export async function buildThemePaint() {
	const bundled = await build({
		stdin: {
			contents: [
				'import { PREFERENCES_KEY, readPreferences } from "./src/app/preferences.ts";',
				'import { applyChrome, applyTheme, findTheme } from "./src/app/theme.ts";',
				"",
				"function paint() {",
				"\tconst prefs = readPreferences();",
				"\tapplyTheme(findTheme(prefs.theme));",
				"\tapplyChrome(prefs);",
				"}",
				"",
				"paint();",
				"",
				"// The editor is open in another tab and the reader just changed scheme.",
				"// The same event the app's own windows listen for, for the same reason.",
				"addEventListener('storage', (event) => {",
				"\tif (event.key !== null && event.key !== PREFERENCES_KEY) return;",
				"\tpaint();",
				"});",
			].join(String.fromCharCode(10)),
			resolveDir: root,
			loader: "ts",
		},
		bundle: true,
		format: "iife",
		target: "es2020",
		minify: true,
		write: false,
		legalComments: "none",
	});
	return bundled.outputFiles[0].text;
}
