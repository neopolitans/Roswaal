/**
 * The toolbars the documentation draws.
 *
 * The page is a replica rather than a screenshot, which buys one thing a
 * screenshot cannot give: the things that make it wrong are checkable. Two of
 * them matter.
 *
 * A **glyph name that is not in the icon set** draws an empty square. The
 * reader is on this page precisely because they cannot tell the icons apart,
 * so a blank one is worse than the problem it was meant to solve.
 *
 * And the **two renderers must draw the same bar**. The picture is one string
 * from `toolbars.ts`, so it cannot drift; the legend is rendered twice, and
 * that is where a control could be listed on the website and missing in the
 * editor's own Docs panel.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import {
	blockText, buildSearchIndex, buildSite, findPage, searchDocs, type Block,
} from "../src/core/docs/site.js";
import { renderPage } from "../src/core/docs/html.js";
import {
	controlKey, controlsOf, DOCS_SITE_BAR, EDITOR_BAR, EDITOR_BAR_BROWSER, iconsOf, legendOf,
	FUNCTIONS_PANEL, MODULES_PANEL, pointingElsewhere, TOOLBAR_HINT, toolbarConstant,
	toolbarHtml, TOOLBARS, VARIABLES_PAGE_PANEL, VARIABLES_PANEL,
	type ToolbarArt, type ToolbarSpec,
} from "../src/core/docs/toolbars.js";
// @ts-expect-error -- build tooling, plain JS, no declarations to import.
import { buildToolbarLinker } from "../scripts/lib/toolbarLinker.mjs";
import * as toolbars from "../src/core/docs/toolbars.js";
import { pageSource } from "../src/app/PageEditor.jsx";
import { ICONS, VIEW_BOX } from "../src/app/icons.js";
import { logoMarkup } from "../src/app/logo.js";

const registry = createRegistry();
const site = buildSite(registry, new Set(BUILTIN_NODES.map((d) => d.id)));
const art: ToolbarArt = {
	viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), version: "test",
};
/** Built once, at the top level: a describe callback cannot await. */
const linker: string = await buildToolbarLinker();

describe("the toolbar specs", () => {
	it("names only glyphs the icon set has", () => {
		for (const bar of TOOLBARS) {
			for (const name of iconsOf(bar)) {
				expect(ICONS, `${bar.id} draws "${name}"`).toHaveProperty(name);
			}
		}
	});

	it("gives every listed control a name and a line about it", () => {
		for (const bar of TOOLBARS) {
			expect(legendOf(bar).length, bar.id).toBeGreaterThan(0);
			for (const item of legendOf(bar)) {
				expect(item.what, `${bar.id}: ${item.name}`).toBeTruthy();
			}
		}
	});

	/** Two rows called the same thing is a legend the reader cannot use. */
	it("has no two controls on one bar sharing a name", () => {
		for (const bar of TOOLBARS) {
			const names = legendOf(bar).map((item) => item.name);
			expect(new Set(names).size, bar.id).toBe(names.length);
		}
	});

	/**
	 * The name a spec is exported under is derived from its id, so a bar added
	 * with an id that does not spell its constant would have *Suggest an edit*
	 * hand back source naming something that is not there.
	 */
	it("derives each spec's exported name from its id", () => {
		for (const bar of TOOLBARS) {
			const name = toolbarConstant(bar);
			expect(toolbars, bar.id).toHaveProperty(name);
			expect((toolbars as Record<string, unknown>)[name], bar.id).toBe(bar);
		}
	});

	/**
	 * Roswaal is two editors out of one bundle and this page is read from both.
	 * The browser preview's bar is drawn separately because three of its
	 * controls reach something different -- and the one that matters is Docs,
	 * which lands on a site that has no project behind it.
	 */
	it("does not promise a hosted reader a reference for their own packs", () => {
		const daemon = legendOf(EDITOR_BAR).find((item) => item.name === "Docs")!;
		const browser = legendOf(EDITOR_BAR_BROWSER).find((item) => item.name === "Docs")!;

		expect(daemon.what).toContain("packs");
		expect(browser.what).toContain("cannot document");
		expect(browser.what).not.toMatch(/including your project/);
	});

	/**
	 * The chip is the one thing on screen that says which build you are in. Which
	 * bars carry it is the browser build's rule rather than this page's, so it is
	 * held in `previewbuild.test.ts` against `BROWSER_TOOLBARS` — here only as
	 * far as the browser editor having one at all.
	 */
	it("draws the preview chip on the browser editor's bar", () => {
		expect(toolbarHtml(EDITOR_BAR_BROWSER, art)).toContain("preview-chip");
		expect(toolbarHtml(EDITOR_BAR, art)).not.toContain("preview-chip");
	});

	/**
	 * The published header is a different header, not the same buttons pointing
	 * elsewhere -- and it is the one a reader on the project site is looking at
	 * while they read this page.
	 */
	it("draws the published documentation's own header", () => {
		const names = legendOf(DOCS_SITE_BAR).map((item) => item.name);
		expect(names).toContain("Try it in your browser");
		expect(names).toContain("Source");
		expect(names).not.toContain("Settings");
	});

	/**
	 * The three the page exists for. If any of these stops being an icon at the
	 * right-hand end of the editor's bar, the page says something untrue about
	 * where to look — and the wording that points at them is hand-written.
	 */
	it("keeps Docs, Node Design and Settings last on the editor's bar, in that order", () => {
		const editor = TOOLBARS.find((bar) => bar.id === "editor-bar")!;
		const items = controlsOf(editor);
		expect(items.slice(-3).map((item) => item.t === "icon" && item.icon)).toEqual([
			"document", "palette", "settings",
		]);
		expect(items.slice(-3).map((item) => item.name)).toEqual([
			"Docs", "Node Design", "Settings",
		]);
	});
});

describe("drawing one", () => {
	it("draws each control, with the glyph the spec names", () => {
		const editor = TOOLBARS.find((bar) => bar.id === "editor-bar")!;
		const html = toolbarHtml(editor, art);

		expect(html).toContain('class="toolbar"');
		expect(html).toContain(ICONS.palette);
		expect(html).toContain(ICONS.settings);
		// The flexible gap is what puts them at the right-hand end.
		expect(html).toContain('<span class="spacer"></span>');
	});

	it("floats the graph's tools as separate panels", () => {
		const graph = TOOLBARS.find((bar) => bar.id === "graph-bar")!;
		const html = toolbarHtml(graph, art);

		expect(html).toContain('class="floating-tools"');
		expect(html.match(/class="tool-group"/g)).toHaveLength(graph.groups.length);
	});

	/** A page header spells its flexible gap `grow`; the other two `spacer`. */
	it("uses the header's own spacer on a window header", () => {
		const docs = TOOLBARS.find((bar) => bar.id === "docs-bar")!;
		const html = toolbarHtml(docs, art);

		expect(html).toContain('class="docs-page-head"');
		expect(html).toContain('<span class="grow"></span>');
		expect(html).not.toContain('class="spacer"');
	});

	it("takes the version it is given rather than holding one", () => {
		expect(toolbarHtml(TOOLBARS[0], art)).toContain(">test<");
	});

	/** Inert: nothing in the picture is reachable, and none of it is announced. */
	it("leaves nothing in the picture focusable or announced", () => {
		for (const bar of TOOLBARS) {
			const html = toolbarHtml(bar, art);
			expect(html, bar.id).toContain('aria-hidden="true"');
			for (const button of html.match(/<button[^>]*>/g) ?? []) {
				expect(button, bar.id).toContain('tabindex="-1"');
			}
		}
	});

	/** No artwork means no picture, rather than a row of empty squares. */
	it("draws nothing for a glyph the set does not have", () => {
		const bare: ToolbarArt = { ...art, paths: {} };
		expect(toolbarHtml(TOOLBARS[0], bare)).not.toContain("<svg class=\"icon\"");
	});
});

/** Bar ids in page order, walking into tabs the way the renderers do. */
function drawnBars(blocks: readonly Block[]): string[] {
	return blocks.flatMap((block) => {
		if (block.t === "toolbar") return [block.bar.id];
		if (block.t === "tabs") return block.tabs.flatMap((tab) => drawnBars(tab.blocks));
		return [];
	});
}

describe("the Toolbars page", () => {
	const page = findPage(site, "toolbars")!;

	it("is in the site", () => {
		expect(page).toBeDefined();
		expect(page.title).toBe("Toolbars");
	});

	it("draws every bar the specs describe, tabs included", () => {
		expect(drawnBars(page.blocks)).toEqual(TOOLBARS.map((bar) => bar.id));
	});

	/**
	 * The static site switches a tabs block with radios, and names the group
	 * after the tab ids joined together. Two blocks whose tabs are called the
	 * same thing therefore share one radio group, and picking a tab under one
	 * bar silently moves the other. Both switches on this page answer nearly the
	 * same question, so this is one rename away at all times.
	 */
	it("gives each tab switch on a page its own radio group", () => {
		const groups = page.blocks.flatMap((b) =>
			b.t === "tabs" ? [b.tabs.map((tab) => tab.id).join("-")] : [],
		);
		expect(groups.length).toBeGreaterThan(1);
		expect(new Set(groups).size).toBe(groups.length);
	});

	/** Both panels are in the markup, so the page reads with no script at all. */
	it("puts both editors in the page rather than only the open tab", () => {
		const html = renderPage(site, page, { version: "test", toolbars: art });
		expect(html).toContain("The same bar in the browser preview");
		expect(html).toContain("Everything on it acts on the project.");
	});

	/**
	 * The point of the whole exercise: somebody who cannot find Node Design
	 * types "Node Design" and lands here rather than on a node's page.
	 */
	it("is findable by searching for the buttons people cannot find", () => {
		const index = buildSearchIndex(site);
		for (const term of ["node design", "palette icon", "gear icon", "document icon"]) {
			const hits = searchDocs(index, term).map((hit) => hit.slug);
			expect(hits, term).toContain("toolbars");
		}
	});

	it("puts a control's name and its explanation into the search text", () => {
		// Inside a tabs block now, and the index has to walk into it: a reader
		// searching for Node Design must not depend on which tab is open.
		const tabs = page.blocks.find((b) => b.t === "tabs")!;
		const text = blockText(tabs);
		expect(text).toContain("Node Design");
		expect(text).toContain("second icon from the right");
		// Markup is stripped, the way it is for every other block.
		expect(text).not.toContain("[");
		expect(text).not.toContain("**");
	});
});

/**
 * The pairing that makes the page interactive.
 *
 * Both sides derive their handle from the control's name, and the thing that
 * breaks is one side deriving it and the other not — which is silent: the page
 * renders, the hover simply does nothing, and nobody notices until somebody
 * tries it.
 */
describe("pointing between the picture and the list", () => {
	it("gives a control and its row the same handle", () => {
		for (const bar of TOOLBARS) {
			const html = toolbarHtml(bar, art);
			for (const item of legendOf(bar)) {
				expect(html, `${bar.id}: ${item.name}`).toContain(
					`data-control="${controlKey(item.name)}"`,
				);
			}
		}
	});

	/** Furniture is drawn and left out of the pairing: nothing to point at. */
	it("leaves a control the legend does not list unhandled", () => {
		const graph = TOOLBARS.find((bar) => bar.id === "graph-bar")!;
		const html = toolbarHtml(graph, art);
		const handles = [...html.matchAll(/data-control="([^"]+)"/g)].map((m) => m[1]);

		expect(handles).toEqual(legendOf(graph).map((item) => controlKey(item.name)));
		// The document's name is drawn and is not a control.
		expect(html).toContain('class="doc-name');
	});

	/** A key that is not unique lights two things at once. */
	it("keeps every handle on a bar distinct", () => {
		for (const bar of TOOLBARS) {
			const keys = legendOf(bar).map((item) => controlKey(item.name));
			expect(new Set(keys).size, bar.id).toBe(keys.length);
		}
	});

	it("says how it works once on the page, and only once", () => {
		const page = findPage(site, "toolbars")!;
		const html = renderPage(site, page, { version: "test", toolbars: art });
		expect(html.match(new RegExp(TOOLBAR_HINT, "g"))).toHaveLength(1);
	});
});

/**
 * The script the site runs. The same shape of check the graph viewer gets, and
 * for the same reason: it is bundled out of a module, and a bundle that names
 * something nothing defines fails silently on every page it is asked to wire.
 */
describe("the documentation's toolbar linker", () => {
	it("is actually there", () => {
		expect(linker).toContain("data-control");
		expect(linker).toContain("docs-bar");
	});

	it("parses as a script a browser would accept", () => {
		expect(() => new Function(linker)).not.toThrow();
	});

	it("defines every transpiler helper it calls", () => {
		const called = new Set(
			[...linker.matchAll(/(__[A-Za-z]\w*)\s*\(/g)].map((found) => found[1]),
		);
		const undeclared = [...called].filter(
			(name) => !new RegExp("(?:var|let|const|function)\s+" + name + "\b").test(linker),
		);
		expect(undeclared).toEqual([]);
	});

	/** Most pages have no toolbar on them, and it shares a file with the search box. */
	it("runs on a page with no toolbar to wire", () => {
		const document = { querySelectorAll: () => [] };
		expect(() => new Function("document", linker)(document)).not.toThrow();
	});

	/** And on a page with one, which is where it has something to do. */
	it("claims a figure and lights a control with its row", () => {
		const made = (control: string) => {
			const classes = new Set<string>();
			return {
				dataset: { control },
				classList: {
					toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
					add: (name: string) => classes.add(name),
					remove: (name: string) => classes.delete(name),
				},
				lit: () => classes.has("lit"),
			};
		};
		const button = made("settings");
		const row = made("settings");
		const other = made("docs");
		const parts = [button, row, other];

		const listeners: Record<string, (e: unknown) => void> = {};
		const figureClasses = new Set<string>();
		const figure = {
			querySelectorAll: () => parts,
			querySelector: () => null,
			contains: () => true,
			addEventListener: (name: string, fn: (e: unknown) => void) => void (listeners[name] = fn),
			removeEventListener: () => {},
			classList: { add: (n: string) => figureClasses.add(n), remove: (n: string) => figureClasses.delete(n) },
		};
		const document = { querySelectorAll: () => [figure] };

		expect(() => new Function("document", linker)(document)).not.toThrow();
		expect(figureClasses).toContain("linked");
		expect(listeners.pointerover).toBeTypeOf("function");
	});
});

/**
 * The switch between two drawn bars, and the blank page it used to cause.
 *
 * A `tabs` block hides its radios with `position: absolute`. With no positioned
 * ancestor their containing block was the **body**, so inputs sitting at their
 * static position deep inside a separately-scrolling column contributed to the
 * *body's* scrollable overflow. On the Toolbars page two of them landed at
 * y=2845 and y=3441 and stretched the document to 3454px, when the content box
 * is one viewport tall and scrolls internally.
 *
 * Harmless until somebody clicked a tab. A `<label for>` focuses its input, a
 * browser scrolls a focused element into view, and the window scrolled two
 * thousand pixels below anything that renders: a blank page, and nothing in the
 * console because nothing threw.
 *
 * It survived three attempts to reproduce it because a scripted `.click()` does
 * not focus, so only a real pointer ever triggered it. Hence a test on the
 * stylesheet rather than on behaviour — this is a rule about the CSS, and the
 * CSS is what can quietly lose it.
 */
describe("the tab switch does not move the window", () => {
	const css = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "..", "src/app/theme.css"),
		"utf8",
	);
	const rule = (selector: string) => {
		const at = css.indexOf(selector + " {");
		expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
		return css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
	};

	it("gives the hidden radios a containing block of their own", () => {
		expect(rule(".docs-tabs")).toContain("position: relative");
	});

	/**
	 * And pins them inside it. At `auto` offsets an absolute element keeps its
	 * static position, which is the part that reached down the page.
	 */
	it("pins them to the top of the switch rather than leaving them in flow", () => {
		const input = rule(".docs-tabs > input");
		expect(input).toContain("position: absolute");
		expect(input).toContain("top: 0");
		expect(input).toContain("left: 0");
		// An input has an intrinsic width; at its natural size it can still
		// widen a narrow page.
		expect(input).toContain("width: 1px");
	});
});

/**
 * 0.64.0: the same machinery, drawing a panel.
 *
 * A toolbar and a panel are two shapes of one thing — a piece of chrome, drawn,
 * with its parts named and pointing at their explanations. Generalising rather
 * than copying matters because the copy would have to re-earn everything the
 * original paid for: the pointing, the `noindex` traps, the blank page that
 * took three attempts to find.
 */
describe("drawing a panel", () => {
	const art: ToolbarArt = {
		viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), version: "test",
		pinColor: (type) => (type === "number" ? "#8fbf3f" : "#888"),
	};

	it("draws it with the editor's own class names", () => {
		const html = toolbarHtml(VARIABLES_PANEL, art);
		// The likeness comes from these, not from a parallel stylesheet.
		expect(html).toContain('class="variables');
		expect(html).toContain('class="variables-sub"');
		expect(html).toContain('class="variable-head"');
		expect(html).toContain('class="swatch');
	});

	it("gives a row its type's colour and a module the ring", () => {
		const html = toolbarHtml(VARIABLES_PANEL, art);
		// A variable's swatch is its type's colour...
		expect(html).toContain("background:#8fbf3f");
		// ...and a module has no type, so it gets the outline instead.
		expect(html).toContain('class="swatch module"');
	});

	/** No palette passed in means the ring, not a colour invented on the spot. */
	it("falls back to the ring when it has no palette", () => {
		const html = toolbarHtml(VARIABLES_PANEL, { ...art, pinColor: undefined });
		expect(html).not.toContain("background:#");
		expect(html.match(/class="swatch module"/g)?.length).toBeGreaterThan(1);
	});

	/**
	 * A row is an example of what a section holds, not a part to match against.
	 * Called `name` rather than `label` it put "Accumulator" and "roblox" in the
	 * legend as though they were controls.
	 */
	it("lists the sections and not the example rows", () => {
		const listed = legendOf(VARIABLES_PANEL).map((item) => item.name);
		expect(listed).toEqual(["Variables", "Modules", "Locals", "Functions"]);
		// The rows are still drawn.
		const html = toolbarHtml(VARIABLES_PANEL, art);
		expect(html).toContain("Accumulator");
		expect(html).toContain("@lune/roblox");
	});

	/** The pointing is the shared part, and needs nothing panel-specific. */
	it("ties each section to its explanation the way a bar does", () => {
		const html = toolbarHtml(VARIABLES_PANEL, art);
		for (const item of legendOf(VARIABLES_PANEL)) {
			expect(html, item.name).toContain(`data-control="${controlKey(item.name)}"`);
		}
	});

	/** An Add button where the section declares, and none where it only lists. */
	it("draws Add on the sections that declare something", () => {
		const html = toolbarHtml(VARIABLES_PANEL, art);
		const sections = html.split("variables-sub");
		expect(sections.find((part) => part.includes("Modules"))).toContain("Add");
		expect(sections.find((part) => part.includes("Locals"))).not.toContain("Add");
	});
});

/**
 * The same panel explained twice, because two pages draw it and each is about
 * a different part of it. Cropping the picture instead would be a drawing of a
 * panel nobody has.
 */
describe("pointing a section at its own page", () => {
	const art: ToolbarArt = {
		viewBox: VIEW_BOX, paths: ICONS, mark: logoMarkup(15), version: "test",
	};

	/** Each variant, and the sections that page is the page for. */
	const VARIANTS: [string, ToolbarSpec, string[]][] = [
		["modules", MODULES_PANEL, ["Modules"]],
		["variables-and-locals", VARIABLES_PAGE_PANEL, ["Variables", "Locals"]],
		["functions", FUNCTIONS_PANEL, ["Functions"]],
	];

	const whatOf = (spec: ToolbarSpec, name: string) =>
		legendOf(spec).find((item) => item.name === name)?.what;

	it("keeps the drawing identical and moves only the words", () => {
		const drawn = toolbarHtml(VARIABLES_PANEL, art);
		for (const [slug, spec] of VARIANTS) {
			expect(toolbarHtml(spec, art), slug).toEqual(drawn);
		}
	});

	it("explains its own section in full and points the rest away", () => {
		for (const [slug, spec, mine] of VARIANTS) {
			for (const item of legendOf(spec)) {
				if (mine.includes(item.name)) {
					expect(item.what, `${slug}: ${item.name}`)
						.toEqual(whatOf(VARIABLES_PANEL, item.name));
				} else {
					expect(item.what, `${slug}: ${item.name}`).toContain("](");
				}
			}
		}
	});

	/**
	 * Locals live on the variables page, so nothing points there from it -- and
	 * a pointer from a page to itself is a link that goes nowhere.
	 */
	it("never points a page at itself", () => {
		for (const [slug, spec] of VARIANTS) {
			for (const item of legendOf(spec)) {
				expect(item.what ?? "", `${slug}: ${item.name}`).not.toContain(`](${slug})`);
			}
		}
	});

	/** A key nothing matches is a pointer written against a section that moved. */
	it("leaves a section alone when nothing points it anywhere", () => {
		const same = pointingElsewhere(VARIABLES_PANEL, { nosuchsection: "..." });
		expect(legendOf(same)).toEqual(legendOf(VARIABLES_PANEL));
	});

	/** Every page the pointers name has to be a page. */
	it("points at pages that exist", () => {
		for (const [slug, spec] of VARIANTS) {
			for (const item of legendOf(spec)) {
				for (const [, named] of (item.what ?? "").matchAll(/\]\(([a-z-]+)\)/g)) {
					expect(findPage(site, named), `${slug}: ${item.name} -> ${named}`).toBeDefined();
				}
			}
		}
	});

	/** And each variant is the one its page actually draws. */
	it("is the panel each page draws", () => {
		for (const [slug, spec] of VARIANTS) {
			const page = findPage(site, slug)!;
			const bars = page.blocks
				.filter((block): block is Extract<Block, { t: "toolbar" }> => block.t === "toolbar")
				.map((block) => block.bar);
			expect(bars, slug).toContain(spec);
		}
	});
});

describe("suggesting an edit", () => {
	it("writes a bar as the constant it is, not as its spec", () => {
		const page = findPage(site, "toolbars")!;
		const source = pageSource(page, page.blocks.map((block) => ({ block })));

		expect(source).toContain('{ t: "toolbar", bar: DESIGNER_BAR },');
		// Including the ones inside a tab, which is where it first leaked: a
		// `tabs` block was handed back as JSON, spec and all.
		expect(source).toContain('{ t: "toolbar", bar: EDITOR_BAR, hint: true },');
		expect(source).toContain('{ t: "toolbar", bar: EDITOR_BAR_BROWSER },');
		expect(source).toContain('{ t: "toolbar", bar: DOCS_SITE_BAR },');
		// The spec itself never reaches the output.
		expect(source).not.toContain('"chrome"');
	});
});

describe("the two renderers", () => {
	const page = findPage(site, "toolbars")!;
	const html = renderPage(site, page, { version: "test", toolbars: art });

	it("lists the same controls the panel would", () => {
		for (const bar of TOOLBARS) {
			for (const item of legendOf(bar)) {
				expect(html, `${bar.id}: ${item.name}`).toContain(
					`<span class="docs-bar-name">${item.name}`,
				);
			}
		}
	});

	it("resolves a page link in a control's line to a file beside this one", () => {
		expect(html).toContain('href="creating-custom-nodes.html"');
	});

	/**
	 * Without the artwork the picture is left out and the words stay, which is
	 * the degradation that still answers the reader's question.
	 */
	it("keeps the legend when it is given no artwork", () => {
		const bare = renderPage(site, page, { version: "test" });
		expect(bare).not.toContain("docs-bar-frame");
		expect(bare).toContain('<span class="docs-bar-name">Node Design');
	});
});
