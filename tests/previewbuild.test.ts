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
	CANARY_BANNER, markChipMarkup, MARK_BESIDE_LINK, MARK_LABEL, MARK_ON_SURFACE,
	PREVIEW_LABEL, PREVIEW_ON_SURFACE, previewChipMarkup,
} from "../src/app/previewMark.js";
import { SOURCE_REPOSITORY } from "../src/core/docs/links.js";
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

/**
 * The canary is the second marked build, and the rule is the same rule: every
 * surface, every link. What is new is that there are now two marks and a build
 * must wear exactly one — a surface saying both is a surface saying neither.
 */
describe("the canary mark", () => {
	it("says one word per mark, and never the same word twice", () => {
		expect(MARK_LABEL.canary).toBe("canary");
		expect(MARK_LABEL.preview).toBe("preview");
		expect(new Set(Object.values(MARK_LABEL)).size).toBe(2);
	});

	it("carries a caveat with each, so neither word is bare", () => {
		for (const mark of ["preview", "canary"] as const) {
			expect(MARK_ON_SURFACE[mark], mark).toBeTruthy();
			expect(MARK_BESIDE_LINK[mark], mark).toBeTruthy();
			expect(markChipMarkup(mark)).toContain(MARK_LABEL[mark]);
			// The chip keeps the shape and changes only the colour, so the
			// stylesheet can style one thing and qualify it.
			expect(markChipMarkup(mark)).toContain(`preview-chip ${mark}`);
		}
	});

	it("says the canary is unreleased rather than merely uninstalled", () => {
		expect(MARK_ON_SURFACE.canary).toMatch(/unreleased/);
		expect(MARK_ON_SURFACE.preview).not.toMatch(/unreleased/);
	});

	/** One gate, so a canary browser build cannot wear both. */
	it("picks the mark in one place", () => {
		const gate = source("src/app/previewBuild.tsx");
		expect(gate).toContain("export function buildMark()");
		// Canary first: an unfinished build is unfinished on either host.
		expect(gate.indexOf("IS_CANARY")).toBeLessThan(gate.indexOf("IS_STATIC_HOST"));
	});

	/** The banner is not the chip, and it says what the chip cannot. */
	it("warns in two wordings, each leading somewhere", () => {
		expect(CANARY_BANNER.app).toMatch(/unreleased/);
		expect(CANARY_BANNER.docs).toMatch(/not be in\s+the version you have|unreleased/);
		expect(CANARY_BANNER.app).not.toBe(CANARY_BANNER.docs);
		expect(CANARY_BANNER.wayOut).toBeTruthy();
	});

	it("puts the banner on every window the canary serves", () => {
		for (const path of ["src/app/App.tsx", "src/app/DesignerPage.tsx", "src/app/DocsPage.tsx"]) {
			expect(source(path), path).toContain("<CanaryBanner");
		}
		// The documentation takes the sharper wording.
		expect(source("src/app/DocsPage.tsx")).toContain('kind="docs"');
	});

	it("styles the yellow variant and the banner", () => {
		const css = source("src/app/theme.css");
		expect(css).toContain(".version.preview-chip.canary");
		expect(css).toContain(".canary-banner");
	});

	/**
	 * The canary chip shipped painted accent blue while reading CANARY.
	 *
	 * `.toolbar .logo .version.preview-chip` is scoped to a context and so
	 * outspecifies a plain `.preview-chip.canary`, so the variant's colour lost
	 * to the base one. The fix is a custom property set on the element: both
	 * variants set it at their own specificity, and no amount of context around
	 * the chip can overrule which claim it is making.
	 *
	 * Same shape as `kind node` inheriting `.node`. Third time in this
	 * stylesheet, hence a test rather than another comment.
	 */
	it("lets the variant decide the colour, not the context around it", () => {
		const css = source("src/app/theme.css");

		// The scoped rule's own body: from its selector list to the brace that
		// closes it. Sliced to the next selector instead, the first attempt fell
		// off the end of the file and asserted against most of the stylesheet.
		const at = css.indexOf(".toolbar .logo .version.preview-chip,");
		expect(at).toBeGreaterThan(-1);
		const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));

		expect(body).toContain("color: var(--chip-ink)");
		expect(body).not.toContain("var(--accent)");

		// And both variants set it on the element itself.
		expect(css).toMatch(/\.version\.preview-chip \{[^}]*--chip-ink: var\(--accent\)/);
		expect(css).toMatch(/\.version\.preview-chip\.canary \{[^}]*--chip-ink: var\(--warning\)/);
	});
});

/**
 * Keeping the canary out of search, and the trap in doing it.
 *
 * Google: "For the noindex rule to be effective, the page or resource must not
 * be blocked by a robots.txt file." A Disallow is therefore worse than nothing
 * — the crawler never reads the noindex, and the URL stays indexed with no way
 * to remove it. So: the meta tag, crawling left open, and no robots.txt.
 */
describe("keeping the canary out of search", () => {
	const site = buildSite(createRegistry(), new Set(BUILTIN_NODES.map((d) => d.id)));
	const page = findPage(site, "toolbars")!;

	it("marks a canary page noindex and a stable one not", () => {
		expect(renderPage(site, page, { version: "t", noindex: true }))
			.toContain('<meta name="robots" content="noindex">');
		expect(renderPage(site, page, { version: "t" })).not.toContain("noindex");
	});

	/**
	 * Asserted against what is *emitted*, not against the prose explaining it —
	 * both of these files talk about `robots.txt` at length, in comments saying
	 * why there is not one.
	 */
	it("does not also disallow crawling, which would defeat it", () => {
		const build = source("scripts/build-docs.mjs");
		const web = source("vite.web.config.ts");

		for (const [name, text] of [["build-docs", build], ["vite.web.config", web]] as const) {
			// No robots.txt is written anywhere.
			expect(text, name).not.toMatch(/writeFile\([^)]*robots\.txt/);
			// And no Disallow directive is emitted in any form.
			expect(text, name).not.toMatch(/Disallow\s*:/);
		}

		// The rule we do emit is exactly `noindex`. Not `nofollow` with it: the
		// crawler has to follow canary links to reach the other canary pages and
		// read *their* noindex.
		const emitted = [
			...build.matchAll(/name="robots" content="([^"]+)"/g),
			...web.matchAll(/name="robots" content="([^"]+)"/g),
			...source("src/core/docs/html.ts").matchAll(/name="robots" content="([^"]+)"/g),
			...source("scripts/lib/landing.mjs").matchAll(/name="robots" content="([^"]+)"/g),
		].map((found) => found[1]);

		expect(emitted.length).toBeGreaterThan(0);
		for (const rule of emitted) expect(rule).toBe("noindex");
	});

	it("injects it into the entry pages at build time, not into the files", () => {
		expect(source("vite.web.config.ts")).toContain("roswaal-noindex");
		for (const file of ["try.html", "designer.html", "index.html"]) {
			expect(source(file), file).not.toContain("noindex");
		}
	});
});

/**
 * The canary deploys from a private repository, so "the repository that built
 * this" is a 404 for every visitor but the author.
 */
describe("the Source link", () => {
	it("points at the public repository, whatever built the site", () => {
		expect(SOURCE_REPOSITORY).toBe("https://github.com/neopolitans/Roswaal");
		expect(SOURCE_REPOSITORY).not.toContain("canary");
	});

	it("is not derived from the channel anywhere", () => {
		for (const path of ["src/core/docs/html.ts", "scripts/lib/landing.mjs"]) {
			const text = source(path);
			const canaryLines = text
				.split(/\r?\n/)
				.filter((line) => /canary/i.test(line) && /SOURCE_REPO/.test(line));
			expect(canaryLines, path).toEqual([]);
		}
	});
});

describe("links into the browser build", () => {
	// The stable page, stated rather than inherited. See landingpage.test.ts.
	const html: string = landingPage("9.9.9", { canary: false });

	it("labels the front page's door, rather than only describing it", () => {
		expect(html).toContain('href="try.html"');
		const door = html.slice(html.indexOf('href="try.html"'));
		expect(door.slice(0, 400)).toContain(PREVIEW_LABEL);
	});

	/**
	 * The door's chip and the sentence under it are two statements about the
	 * same thing, and they were written at different times. On the canary the
	 * chip said CANARY and the prose still said preview.
	 */
	it("does not let the door and the prose under it disagree", () => {
		const canary: string = landingPage("9.9.9", { canary: true });
		// From the door forwards, not from the first mention of the class: the
		// stylesheet names every one of these before the markup uses it.
		const door = canary.indexOf('href="try.html"');
		const note = canary.indexOf('class="landing-note"', door);
		expect(door).toBeGreaterThan(-1);
		expect(note).toBeGreaterThan(door);

		const doorMark = canary.slice(door, note);
		expect(doorMark).toContain(MARK_LABEL.canary);
		expect(doorMark).not.toContain(PREVIEW_LABEL);

		// And the sentence under it agrees with the chip above it.
		expect(canary.slice(note, note + 400)).toContain("canary");
		expect(canary.slice(note, note + 400)).not.toContain(PREVIEW_LABEL);

		// The stable build still says preview in both places. Checked against the
		// markup rather than the whole file: the stylesheet is shared and names
		// the canary's classes whether or not this build uses them.
		const stable: string = landingPage("9.9.9", { canary: false });
		const body = stable.slice(stable.indexOf("</style>"));
		expect(body).toContain(PREVIEW_LABEL);
		expect(body).not.toContain(MARK_LABEL.canary);
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
