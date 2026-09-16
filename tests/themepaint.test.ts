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
