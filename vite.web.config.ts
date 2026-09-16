/**
 * The hosted build: Roswaal as a website, with no daemon behind it.
 *
 * Separate from `vite.config.ts` rather than a mode flag on it, because the two
 * differ in exactly one interesting way and it is worth being able to read what
 * that is. The daemon build talks to `/api` on localhost. This one substitutes
 * `src/server/host.ts` — the filesystem, the path arithmetic and the formatter
 * that `project.ts` runs on — for a volume in memory, and everything else about
 * the editor is the same code.
 *
 * Output goes to `dist-site/`, which is the website: `try.html` is the editor,
 * and the landing page and the documentation join it there.
 */

import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { demoSeedPlugin } from "./scripts/demo-seed.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { themeShellPlugin } from "./scripts/theme-shell.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const DEMO = fileURLToPath(new URL("examples/demo", import.meta.url));

/**
 * The web host's path, spelled the way Vite spells one.
 *
 * `fileURLToPath` hands back a Windows path with backslashes, and Vite's own
 * resolution produces forward slashes — so returning the former from
 * `resolveId` gave rolldown **two module ids for one file**. It bundled
 * `src/web/host.ts` twice, and each copy ran `new Volume()`: the worker mounted
 * the demo into one volume and the project layer read the other, which was
 * empty. The playground came up on `Not a directory: /demo`.
 *
 * Only in a production build, and only on Windows — dev normalises ids before
 * this matters, and a posix machine has nothing to normalise.
 */
const WEB_HOST = fileURLToPath(new URL("src/web/host.ts", import.meta.url))
	.replace(/\\/g, "/");

/**
 * Points the project layer at the volume instead of the disk.
 *
 * Narrow on purpose: only the literal `./host.js`, and only when the file
 * asking is one of the server's own. A blanket alias on the specifier would
 * catch any future `host.js` anywhere in the tree and substitute it silently,
 * which is the kind of build-time surprise that costs an afternoon.
 */
function roswaalWebHost(): Plugin {
	return {
		name: "roswaal-web-host",
		enforce: "pre",
		resolveId(source, importer) {
			if (source !== "./host.js" || !importer) return null;
			if (!/[\\/]src[\\/]server[\\/]/.test(importer)) return null;
			return WEB_HOST;
		},
	};
}

/**
 * Keeps the canary's own pages out of search indexes.
 *
 * The three entry HTML files are checked-in static files shared by both
 * channels, so the tag is injected at build time rather than written into them.
 * A meta tag rather than a `robots.txt` because GitHub Pages cannot set an
 * `X-Robots-Tag` header, a project site cannot host a `robots.txt` at all --
 * crawlers read one only from the host root -- and a `Disallow` would be worse
 * than nothing: a page nobody may crawl is a page whose `noindex` is never
 * read, so it stays indexed as a bare URL forever.
 */
function noindexOnCanary(): Plugin {
	return {
		name: "roswaal-noindex",
		transformIndexHtml: {
			order: "pre",
			handler(html) {
				if (process.env.ROSWAAL_CHANNEL !== "canary") return html;
				return html.replace(
					"</head>",
					'\t\t<meta name="robots" content="noindex" />\n\t</head>',
				);
			},
		},
	};
}

export default defineConfig({
	/**
	 * Where the site is mounted.
	 *
	 * A project site on github.io is served from `/<repo>/`, an apex domain from
	 * `/`. Vite writes it into every asset URL, and `pages.ts` reads it back out
	 * of `import.meta.env.BASE_URL` for the links between the three pages -- so
	 * moving the site is this one variable and nothing else.
	 */
	base: process.env.ROSWAAL_BASE ?? "/",
	/**
	 * There is no server here to fall back to `index.html`, so a page is a file
	 * and the documentation is the static site rather than the editor's own
	 * docs window. `pages.ts` is the only thing that reads this.
	 */
	// `static` says what serves this; `channel` says which line it came from.
	// A canary build wears its mark on either host. See `src/app/previewMark.ts`.
	define: {
		__ROSWAAL_STATIC__: "true",
		__ROSWAAL_CHANNEL__: JSON.stringify(
			process.env.ROSWAAL_CHANNEL === "canary" ? "canary" : "stable",
		),
	},
	plugins: [react(), roswaalWebHost(), demoSeedPlugin(DEMO), noindexOnCanary(), themeShellPlugin()],
	// Module workers, so the worker can import the route table rather than being
	// handed a bundled copy of it.
	worker: { format: "es", plugins: () => [roswaalWebHost(), demoSeedPlugin(DEMO)] },
	server: {
		port: 4472,
		/**
		 * Build output is not source. `dist-pages/` is assembled by deleting and
		 * rewriting a tree inside the project root, and the dev server's watcher
		 * followed it in and died on a half-written file with EBUSY. Vite ignores
		 * a config's own `outDir` for exactly this reason; this directory is no
		 * config's outDir, so it has to be named.
		 */
		watch: {
			ignored: [
				"**/node_modules/**", "**/.git/**",
				"**/dist/**", "**/dist-site/**", "**/dist-docs/**",
				"**/dist-cli/**", "**/dist-pages/**",
			],
		},
	},
	build: {
		outDir: "dist-site",
		emptyOutDir: true,
		// Two pages, one bundle: the editor and Node Design, which share every
		// chunk and differ only in what `pages.ts` reports they are.
		rollupOptions: { input: [here + "try.html", here + "designer.html"] },
	},
});
