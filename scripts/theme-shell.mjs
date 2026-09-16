/**
 * The colour scheme, before the app's first paint.
 *
 * ## The flash
 *
 * `index.html`, `try.html` and `designer.html` are a `<div id="root">` and a
 * `<script type="module">`, and a module script is deferred *by definition* —
 * it runs after the document is parsed. Vite extracts `theme.css` into a
 * render-blocking `<link>`, so the order was:
 *
 * 1. the stylesheet paints the page in light or dark, following the OS;
 * 2. the bundle loads;
 * 3. `bootEditor` applies the scheme the developer actually picked.
 *
 * Step 1 is a frame of the wrong colours on every load — worst on a cold cache,
 * and worst of all for the developer whose scheme disagrees with their OS,
 * which is the whole reason for picking one. `bootEditor` was already applying
 * the theme as early as a module can; the problem is that a module cannot be
 * early enough.
 *
 * So the scheme goes in a classic script in the head, which blocks. It is the
 * same bundle the documentation site loads, built by the same function, for the
 * same reason spelled out in `themePaint.mjs`: a second implementation of
 * `applyTheme` is the one thing that must not exist.
 *
 * ## Where the file goes
 *
 * `theme.js` at the root of the output, referenced through Vite's `base`, so
 * the daemon build (`/`) and a project site (`/Roswaal/`) both reach it. The
 * daemon serves it because `express.static` runs before the SPA fallback, so
 * this is a real file and not another copy of `index.html`.
 *
 * Unhashed, unlike every other asset here, because the HTML names it — which is
 * why it carries the version query the documentation's assets carry, for the
 * ten minutes of Pages caching that the docs build learned about the hard way.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildThemePaint } from "./lib/themePaint.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Applies the developer's scheme before anything paints. */
export function themeShellPlugin() {
	let built;
	let base = "/";
	let version = "";

	// Built once per process: the same bytes serve three HTML entries, and in
	// dev every reload would otherwise pay for an esbuild run.
	const script = () => (built ??= buildThemePaint());

	return {
		name: "roswaal-theme-shell",

		async configResolved(config) {
			base = config.base ?? "/";
			const manifest = JSON.parse(await readFile(join(root, "version.json"), "utf8"));
			version = manifest.version;
		},

		// Dev has no build output to serve it from, so the server answers for it.
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? "").split("?")[0];
				if (!path.endsWith("/theme.js")) return next();
				void script().then((body) => {
					res.setHeader("Content-Type", "text/javascript; charset=utf-8");
					// Dev only, and the file is rebuilt per process rather than
					// per request -- a cached copy here would outlive an edit.
					res.setHeader("Cache-Control", "no-store");
					res.end(body);
				}, next);
			});
		},

		async generateBundle() {
			this.emitFile({ type: "asset", fileName: "theme.js", source: await script() });
		},

		transformIndexHtml: {
			order: "pre",
			handler(html) {
				const src = `${base}theme.js?v=${encodeURIComponent(version)}`;
				// No `defer` and no `type="module"`: either one puts this back
				// behind the first paint, which is the entire bug.
				// Matched with its indentation, so the tag lands level with the
				// rest of the head rather than one tab in from it.
				return html.replace(
					/([ \t]*)<\/head>/,
					(_all, indent) =>
						`${indent}\t<script src="${src}"></script>\n${indent}</head>`,
				);
			},
		},
	};
}
