/**
 * The links between Roswaal's three pages.
 *
 * These were seven absolute strings — `window.open("/docs")` and friends —
 * which is correct exactly once: when the daemon is serving the bundle from the
 * root of a host. A project site on github.io is served from `/<repo>/`, so
 * every one of them pointed at somebody else's space on that domain, and a
 * static host has no `index.html` fallback, so the clean routes they named do
 * not exist there at all.
 *
 * Both facts are invisible while developing — the daemon makes all seven work —
 * and neither produces an error when wrong. They produce a published site whose
 * Docs button 404s, which is the kind of thing a stranger finds in the first
 * minute and the author never does.
 *
 * So the decision is pure and the tests go at it directly: the flag and the
 * base are compiled in, and a build can only ever be one of the two shapes.
 */

import { describe, expect, it, afterEach, vi } from "vitest";

import { hrefFor, pageAt, PAGE_TARGET, type Page, pagesShareTab, pageTarget } from "../src/app/pages.js";

const PAGES: Page[] = ["editor", "docs", "designer"];

describe("where a page is, with a daemon serving it", () => {
	const href = (page: Page, hash?: string) => hrefFor("/", false, page, hash);

	it("uses the clean routes the daemon answers", () => {
		expect(href("editor")).toBe("/");
		expect(href("docs")).toBe("/docs");
		expect(href("designer")).toBe("/designer");
	});

	it("carries a fragment through", () => {
		expect(href("docs", "creating-custom-nodes")).toBe("/docs#creating-custom-nodes");
	});
});

describe("where a page is, on a static host", () => {
	const href = (page: Page, hash?: string) => hrefFor("/", true, page, hash);

	/**
	 * Files, because nothing is going to fall back to `index.html` for a path
	 * that has no file behind it.
	 */
	it("names a file for each page of the bundle", () => {
		expect(href("editor")).toBe("/try.html");
		expect(href("designer")).toBe("/designer.html");
	});

	/** Not a page of the bundle at all: the separate static site. */
	it("sends the documentation to the built site", () => {
		expect(href("docs")).toBe("/docs/");
		expect(href("docs", "wires-and-pins")).toBe("/docs/#wires-and-pins");
	});
});

describe("where a page is, under a sub-path", () => {
	/** What a project site on github.io actually is, before a domain is bought. */
	const href = (page: Page, hash?: string) => hrefFor("/Roswaal/", true, page, hash);

	it("keeps every link inside the site", () => {
		expect(href("editor")).toBe("/Roswaal/try.html");
		expect(href("designer")).toBe("/Roswaal/designer.html");
		expect(href("docs")).toBe("/Roswaal/docs/");
	});

	it("never produces a link that climbs out of it", () => {
		for (const page of PAGES) {
			expect([page, href(page).startsWith("/Roswaal/")]).toEqual([page, true]);
		}
	});

	/** A base without its trailing slash must not glue two segments together. */
	it("tolerates a base written without a trailing slash", () => {
		expect(hrefFor("/Roswaal", true, "docs")).toBe("/Roswaal/docs/");
		expect(hrefFor("/Roswaal", false, "designer")).toBe("/Roswaal/designer");
	});
});

describe("which page a path is", () => {
	it("reads the daemon's routes", () => {
		expect(pageAt("/")).toBe("editor");
		expect(pageAt("/docs")).toBe("docs");
		expect(pageAt("/designer")).toBe("designer");
	});

	it("reads a static host's files", () => {
		expect(pageAt("/try.html")).toBe("editor");
		expect(pageAt("/designer.html")).toBe("designer");
	});

	it("reads them under a sub-path", () => {
		expect(pageAt("/Roswaal/try.html")).toBe("editor");
		expect(pageAt("/Roswaal/designer.html")).toBe("designer");
		expect(pageAt("/Roswaal/docs/")).toBe("docs");
		expect(pageAt("/Roswaal/")).toBe("editor");
	});

	/** A trailing slash is not a different page. */
	it("ignores trailing slashes", () => {
		expect(pageAt("/docs/")).toBe("docs");
		expect(pageAt("/designer//")).toBe("designer");
	});

	/**
	 * Every href the bundle produces has to be readable by the thing that reads
	 * the address bar, or a page opens as the wrong page. Checked both ways
	 * round rather than trusting that two regexes and three template strings
	 * agree — except the documentation on a static host, which is not a page of
	 * the bundle and is never read back.
	 */
	it("round-trips every link the bundle writes", () => {
		for (const base of ["/", "/Roswaal/"]) {
			for (const staticHost of [false, true]) {
				for (const page of PAGES) {
					if (staticHost && page === "docs") continue;
					const href = hrefFor(base, staticHost, page);
					expect([base, staticHost, page, pageAt(href)])
						.toEqual([base, staticHost, page, page]);
				}
			}
		}
	});
});

describe("the window each page opens into", () => {
	/** Named, so a second click reuses the tab rather than stacking another. */
	it("gives every page a distinct target", () => {
		const targets = PAGES.map((page) => PAGE_TARGET[page]);
		expect(new Set(targets).size).toBe(PAGES.length);
	});
});

describe("which tab a page opens in", () => {
	const touchFirst = (matches: boolean) => {
		vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * iPadOS loads a page into a named tab that is already open without
	 * bringing it forward, so the second press of Node Design looked like
	 * nothing. On a touch-first screen the pages take turns in one tab.
	 */
	it("keeps to this tab on a touch-first screen", () => {
		touchFirst(true);
		expect(pagesShareTab()).toBe(true);
		expect(pageTarget("designer")).toBe("_self");
		expect(pageTarget("docs")).toBe("_self");
	});

	it("gives each page its own named tab everywhere else", () => {
		touchFirst(false);
		expect(pagesShareTab()).toBe(false);
		expect(pageTarget("designer")).toBe(PAGE_TARGET.designer);
		expect(pageTarget("editor")).toBe(PAGE_TARGET.editor);
	});
});
