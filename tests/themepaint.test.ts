/**
 * The documentation site, in the reader's own colour scheme.
 *
 * The site shipped `theme.css` and nothing else, so it followed the operating
 * system — a developer on Nord who clicked Docs got the reference in whatever
 * the OS was set to, and said so. The fix is not a second implementation of
 * theming: it is the editor's own `applyTheme`, bundled, reading the same
 * `localStorage` key the editor writes.
 *
 * These hold the parts that are easy to break from a distance: the script has
 * to be *in the head and blocking*, or the page paints twice; and it has to be
 * built from the app's modules, or it is a copy that can disagree.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { buildSite, findPage } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { buildThemePaint } from "../scripts/lib/themePaint.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { landingPage } from "../scripts/lib/landing.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { notFoundPage } from "../scripts/lib/notFound.mjs";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { themeShellPlugin } from "../scripts/theme-shell.mjs";

const registry = createRegistry();
const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));

describe("the site's colour scheme", () => {
	const page = findPage(site, "functions")!;
	const html = renderPage(site, page, { version: "9.9.9" });

	it("loads the scheme in the head, before anything paints", () => {
		const head = html.slice(0, html.indexOf("</head>"));
		expect(head).toContain("theme.js");
		// `defer` would run it after the document parses, which is a page
		// painted in the stylesheet's colours and then corrected -- a flash on
		// every page of the site, every time.
		expect(head).not.toMatch(/theme\.js[^>]*defer/);
	});

	/** Pages sits behind a ten-minute cache it cannot be told to shorten. */
	it("stamps it with the version, the way the other two assets are", () => {
		expect(html).toContain("theme.js?v=9.9.9");
		expect(html).toContain("theme.css?v=9.9.9");
	});

	/** A page in a subdirectory reaches back up to the one copy. */
	it("points at the site root from a nested page", () => {
		const nested = site.sections
			.flatMap((section) => section.pages)
			.find((page) => page.slug.includes("/"));
		expect(nested, "no nested page to check").toBeDefined();
		expect(renderPage(site, nested!, { version: "9.9.9" }))
			.toContain('src="../theme.js?v=9.9.9"');
	});
});

/**
 * The first page on the site, which is built almost entirely from theme
 * tokens and so had the same problem the documentation had: it was one page
 * over from the fix and nothing pointed that out.
 */
describe("the landing page", () => {
	const html: string = landingPage("9.9.9", { canary: false });

	it("loads the scheme, from the copy the docs ship", () => {
		const head = html.slice(0, html.indexOf("</head>"));
		expect(head).toContain("docs/theme.js?v=9.9.9");
		expect(head).not.toMatch(/theme\.js[^>]*defer/);
	});
});

/**
 * The page sent for any address with nothing behind it, which therefore cannot
 * reach a neighbour and must read correctly with nothing else loaded.
 */
describe("the 404 page", () => {
	const html = notFoundPage("/Roswaal/", "9.9.9") as string;

	it("reaches its assets from the site root, not from its neighbours", () => {
		expect(html).toContain('href="/Roswaal/docs/theme.css?v=9.9.9"');
		expect(html).toContain('src="/Roswaal/docs/theme.js?v=9.9.9"');
		// A relative path is wrong from every address but one.
		expect(html).not.toMatch(/(?:href|src)="(?:\.\.?\/|docs\/)/);
	});

	/**
	 * The colours it always had are still there as fallbacks, so the page a
	 * failed stylesheet leaves behind is the page this used to be rather than
	 * black text on white.
	 */
	it("takes a scheme, and still reads without one", () => {
		expect(html).toContain("var(--bg-app, #14161c)");
		expect(html).toContain("var(--fg, #d6dae4)");
		expect(html).toContain("var(--fg-muted, #9aa2b4)");
		expect(html).toContain("var(--accent, #8fa6dd)");
		// It used to pin itself dark, which is the claim a theme has to beat.
		expect(html).not.toContain("color-scheme: dark");
	});
});

/**
 * The app's three shells, which paint before their bundle can run.
 *
 * The plugin is the whole fix, so the thing worth holding is what it writes:
 * a classic script, in the head, that blocks.
 */
describe("the app shell", () => {
	const SHELL = [
		"<!doctype html>",
		"<html lang=\"en\">",
		"\t<head>",
		"\t\t<title>Roswaal</title>",
		"\t</head>",
		"\t<body></body>",
		"</html>",
	].join("\n");

	const inject = async (base: string) => {
		const plugin = themeShellPlugin();
		await plugin.configResolved({ base });
		return plugin.transformIndexHtml.handler(SHELL) as string;
	};

	it("blocks: no defer, no module", async () => {
		const html = await inject("/");
		const tag = html.match(/<script[^>]*theme\.js[^>]*>/)![0];
		// Either one puts the scheme back behind the first paint, which is the
		// entire bug this exists for.
		expect(tag).not.toContain("defer");
		expect(tag).not.toContain("module");
		expect(tag).not.toContain("async");
	});

	it("goes in the head, ahead of the bundle", async () => {
		const html = await inject("/");
		expect(html.indexOf("theme.js")).toBeLessThan(html.indexOf("</head>"));
	});

	/** A project site is served from `/<repo>/`, and Vite writes that in. */
	it("follows the base the site is mounted at", async () => {
		expect(await inject("/Roswaal/")).toContain('src="/Roswaal/theme.js?v=');
	});
});

describe("building it", () => {
	it("is the editor's own theming, not a copy of it", async () => {
		const script = (await buildThemePaint()) as string;

		// The same key the editor writes, so the site cannot read a different
		// preference from the one that was set.
		expect(script).toContain("roswaal.preferences");
		// Applied as inline custom properties, which is what beats a stylesheet
		// that declares the same token twice for light and dark.
		expect(script).toContain("bg-app");
		expect(script).toContain("data-theme");
		// And the shape preferences, which are not colours but are read here.
		expect(script).toContain("node-radius");
		expect(script).toContain("docsFont");

		// It follows the editor while both are open, the way the app's own
		// windows follow each other.
		expect(script).toContain("storage");

		// Self-contained: nothing left to resolve at load time.
		expect(script).not.toContain("import ");
		expect(script).not.toContain("require(");
	}, 30_000);
});
