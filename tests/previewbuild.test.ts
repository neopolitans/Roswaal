/**
 * The mark that says you are in the browser build.
 *
 * The rule is in `src/app/previewBuild.tsx`: **every surface of that build
 * carries the mark, and every link into it is labelled with it.** It is written
 * down there because it is a claim about the product — the browser build is a
 * way to try Roswaal, not Roswaal — and somebody who arrives through it has no
 * other way to find that out.
 *
 * It is tested here because a rule of the form "on every page" decays one new
 * page at a time and never announces it. It had already: the chip was a span in
 * the editor's toolbar, Node Design was a whole window of the same build
 * carrying nothing, and the front page's door into it said only "Try it in your
 * browser" — a description of the mechanism, not a statement about the product.
 *
 * ## Why some of these read source rather than render
 *
 * The three headers are React inside page components that want a daemon, a
 * registry and a router to mount. What is being checked is not what they paint
 * but whether they went through the one component — which is the rule, and
 * which is a property of the source. A header that builds its own span passes
 * no test worth writing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { landingPage } from "../scripts/lib/landing.mjs";
import {
	PREVIEW_LABEL, PREVIEW_ON_SURFACE, previewChipMarkup,
} from "../src/app/previewMark.js";
import { BROWSER_TOOLBARS, TOOLBARS, toolbarHtml, type ToolbarArt } from "../src/core/docs/toolbars.js";
import { ICONS, VIEW_BOX } from "../src/app/icons.js";
import { logoMarkup } from "../src/app/logo.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { buildSite, findPage } from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

/**
 * Every window the browser build serves, and the component each one must go
 * through. `try.html` and `designer.html` are the two it actually ships; the
 * docs window is in the bundle and is listed so it cannot be the exception
 * somebody discovers later.
 */
const SURFACES = [
	"src/app/Toolbar.tsx",
	"src/app/DesignerPage.tsx",
	"src/app/DocsPage.tsx",
];

describe("the rule", () => {
	it("puts every surface of the browser build through one component", () => {
		for (const path of SURFACES) {
			expect(source(path), path).toContain("<PreviewChip");
			expect(source(path), path).toContain("previewBuild.jsx");
		}
	});

	/**
	 * The point of a single component: a surface that spells the chip itself is
	 * a surface that can spell it differently, or stop spelling it at all
	 * without anything noticing.
	 */
	it("leaves no surface hand-rolling the chip", () => {
		for (const path of SURFACES) {
			expect(source(path), path).not.toContain('className="version preview-chip"');
		}
	});

	it("says one word, in one place", () => {
		expect(PREVIEW_LABEL).toBe("preview");
		expect(previewChipMarkup()).toContain(PREVIEW_LABEL);
		// And the caveat travels with it, so the word is never bare.
		expect(previewChipMarkup()).toContain("not on your disk");
		expect(PREVIEW_ON_SURFACE).toMatch(/kept in this browser/);
	});

	/** The stylesheet has to reach every header, not only the editor's. */
	/**
	 * The words have to stay reachable from a build script. They were in the
	 * same file as the component, which imports `pages.ts` for the host flag --
	 * and `pages.ts` reads a Vite `define`, so the front page and the docs site
	 * both died on import the moment they asked for the wording.
	 */
	it("keeps the wording out of anything that asks which build this is", () => {
		expect(source("src/app/previewMark.ts")).not.toContain("pages.js");
		expect(source("src/app/previewBuild.tsx")).toContain("pages.js");
	});

	it("styles the chip wherever the rule puts it", () => {
		const css = source("src/app/theme.css");
		expect(css).toContain(".toolbar .logo .version.preview-chip");
		expect(css).toContain(".docs-page-head .logo .version.preview-chip");
		expect(css).toContain(".docs-page-head a.tb .version.preview-chip");
	});
});

describe("links into the browser build", () => {
	const html: string = landingPage("9.9.9");

	it("labels the front page's door, rather than only describing it", () => {
		expect(html).toContain('href="try.html"');
		const door = html.slice(html.indexOf('href="try.html"'));
		expect(door.slice(0, 400)).toContain(PREVIEW_LABEL);
	});

	it("says on the front page what the preview is, in prose as well", () => {
		const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
		expect(text).toMatch(/preview/i);
		expect(text).toContain("kept");
		expect(text).toContain("in your browser");
	});

	/**
	 * The front page's own tag is the version, not "preview". That was a
	 * deliberate change at 0.59.1 and this rule does not undo it: Roswaal is not
	 * a preview, the thing behind one door is.
	 */
	it("does not put the word back on the product itself", () => {
		// The markup, not the stylesheet above it, which names the class first.
		const head = html.slice(
			html.indexOf('<div class="landing-head">'),
			html.indexOf('<p class="landing-lede">'),
		);
		expect(head).toContain("9.9.9");
		expect(head).not.toContain(PREVIEW_LABEL);
	});

	it("labels the documentation header's link too", () => {
		const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
		const page = findPage(site, "toolbars")!;
		const rendered = renderPage(site, page, {
			version: "test", previewChip: previewChipMarkup(),
		});
		expect(rendered).toContain(`Try it in your browser${previewChipMarkup()}`);
	});

	/** Passed in, so a build that forgets it renders a link and not a broken one. */
	it("renders the header without one rather than breaking", () => {
		const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
		const page = findPage(site, "toolbars")!;
		const rendered = renderPage(site, page, { version: "test" });
		expect(rendered).toContain("Try it in your browser</a>");
	});
});

describe("the bars the documentation draws", () => {
	const art: ToolbarArt = {
		viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), version: "test",
	};

	it("marks every browser bar and no daemon bar", () => {
		for (const bar of BROWSER_TOOLBARS) {
			expect(toolbarHtml(bar, art), bar.id).toContain("preview-chip");
		}
		for (const bar of TOOLBARS.filter((b) => !BROWSER_TOOLBARS.includes(b))) {
			expect(toolbarHtml(bar, art), bar.id).not.toContain("preview-chip");
		}
	});

	/**
	 * Both windows the browser build actually serves are drawn. The docs window
	 * is not, because that build does not serve it — Docs there opens the
	 * published site, which has its own drawn header.
	 */
	it("draws both of the windows that build serves", () => {
		expect(BROWSER_TOOLBARS.map((bar) => bar.id)).toEqual([
			"editor-bar-browser", "designer-bar-browser",
		]);
	});

	it("tells a reader what the chip means", () => {
		const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
		const page = findPage(site, "toolbars")!;
		const rendered = renderPage(site, page, { version: "test", toolbars: art });
		expect(rendered).toContain("your work is in this browser and not on your disk");
	});
});
