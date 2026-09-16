/**
 * The bars the tool is driven from, described once and drawn in the docs.
 *
 * Roswaal's chrome is mostly icons. That is the right trade on a bar you use
 * every day — a row of words costs the canvas its width, and a tool is read by
 * shape once it is known — but it has a cost on the first day, and the cost
 * landed where it always does: people could not find **Docs**, **Node Design**
 * and **Settings**, because all three are a glyph at the right-hand end of a
 * row and nothing on screen says which is which until you hover one.
 *
 * A table of icon names does not fix that. What fixes it is a picture of the
 * bar, in the reader's own theme, with the controls in the order they really
 * sit in — so "the third icon from the right" is something the page can show
 * rather than something the reader has to reconstruct.
 *
 * ## The picture is built here, the words are not
 *
 * `toolbarHtml` returns the bar itself, and both renderers inject that one
 * string — the same arrangement `preview.ts` uses for a node, and for the same
 * reason: a bar that looked like one thing in the editor's Docs panel and
 * another on the website would be worse than no picture at all.
 *
 * The **legend** underneath is rendered by each renderer instead, because its
 * prose carries inline markup — a control whose explanation links to the page
 * about it — and the two renderers resolve a page link differently. The spec
 * is shared, so they cannot list different controls.
 *
 * ## Why it is a replica rather than a screenshot
 *
 * A screenshot is a picture of one theme, at one window width, of whatever the
 * build looked like the day somebody remembered to take it. This is built from
 * the same class names the editor uses, so it takes the reader's theme, reflows
 * on a narrow page, and goes stale only when somebody changes the bar and not
 * this file — which a test can see, and a stale PNG cannot.
 *
 * It is inert: `aria-hidden`, no tab stops, and no pointer events. Everything
 * it says is said again in the legend, which is the part a screen reader gets.
 */

import { escapeXml } from "./preview.js";

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * The artwork and the version, passed in rather than imported.
 *
 * The glyphs live in `src/app/icons.tsx` and the mark in `src/app/logo.tsx`,
 * both of which are JSX and outside core — the same reason `RenderOptions`
 * takes a `pinColor` and a `logo` rather than importing either. A glyph name
 * with no path draws nothing rather than a broken one; `tests/toolbars.test.ts`
 * holds every name in this file against the real set, so an empty box cannot
 * reach a reader.
 */
export interface ToolbarArt {
	/** Material's own grid, bottom-left origin: `0 -960 960 960`. */
	viewBox: string;
	paths: Record<string, string>;
	/** The Roswaal mark as SVG markup, from `logoMarkup`. */
	mark: string;
	/** The build, drawn beside the mark the way the real bars draw it. */
	version: string;
}

/**
 * What a control is called and what it does, for the legend.
 *
 * Optional, because some of what is on a bar is furniture rather than a
 * control — a caption over a segmented pair, the name of the open document —
 * and listing it under "what each button does" would be padding. A control
 * the reader can press always carries these.
 */
interface Documented {
	/** The legend's heading for this control. Absent: drawn, not listed. */
	name?: string;
	/** One line for the legend. Inline markup, so it can link to a page. */
	what?: string;
	/** Where to look, for the ones that are hard to describe by name. */
	where?: string;
}

/**
 * One thing on a bar, as it is drawn.
 *
 * `icon` names a glyph in {@link ToolbarArt}; the drawn form of an icon-only
 * button is exactly what the reader is trying to identify, so it has to be the
 * real glyph rather than a stand-in.
 */
export type ToolbarItem = Documented &
	(
		/**
		 * The Roswaal mark, optionally with a word and the version beside it.
		 *
		 * `preview` is the chip the hosted build carries and the daemon does
		 * not — the one visible difference between the two editors, and the
		 * thing a reader on the website is looking at while they read this.
		 */
		| { t: "mark"; text?: string; version?: boolean; preview?: boolean }
		/** An icon on its own: the shape of most of the chrome. */
		| { t: "icon"; icon: string; on?: boolean }
		/** A button with words, and an icon before them when it has one. */
		| { t: "button"; text: string; icon?: string; primary?: boolean; on?: boolean }
		/** A pair or trio of buttons where one is lit: a setting, not an action. */
		| { t: "segmented"; options: string[]; on: number }
		/** A dropdown, shown holding whatever it is set to. */
		| { t: "select"; text: string }
		/** A caption naming what the control beside it sets. */
		| { t: "label"; text: string }
		/** The open document's name, and what kind of document it is. */
		| { t: "name"; text: string; kind?: string; dirty?: boolean }
		/** A rule between two clusters inside one group. */
		| { t: "divider" }
	);

/**
 * Said once per page, under the first bar drawn on it.
 *
 * Here rather than in each renderer, so the website and the Docs window cannot
 * word it differently. Both hide it until the linking script has claimed the
 * figure — a page read with no script still draws every bar and still names
 * every control, and should not promise something it cannot do.
 */
export const TOOLBAR_HINT = "Hover a control or its row to light the other.";

/** One cluster of controls. On a floating bar, one panel. */
export interface ToolbarGroup {
	/**
	 * A flexible gap before this group, which is what pushes a cluster to the
	 * far end of the bar. The reason Docs, Node Design and Settings are where
	 * they are — and worth drawing, because "the right-hand end" is how the
	 * legend has to describe them.
	 */
	apart?: boolean;
	items: ToolbarItem[];
}

/**
 * How a bar is drawn, which is not a detail: the three shapes are three
 * different promises about where to look.
 *
 * `bar` runs the full width above the workspace and is always there. `head` is
 * a page's own header — Docs and Node Design are windows, not panels. `float`
 * sits over a canvas in panels with the view showing between them, so its
 * groups are separate objects rather than regions of one strip.
 */
export type ToolbarChrome = "bar" | "head" | "float";

export interface ToolbarSpec {
	/** Stable; the anchor the docs page gives this bar's section. */
	id: string;
	/** The heading this bar is documented under. */
	title: string;
	/** One line: where this bar is and what it acts on. */
	summary: string;
	chrome: ToolbarChrome;
	groups: ToolbarGroup[];
}

/** Every control on a bar, in the order it is drawn. */
export function controlsOf(spec: ToolbarSpec): ToolbarItem[] {
	return spec.groups.flatMap((group) => group.items);
}

/** The ones the legend lists: everything the reader can press or set. */
export function legendOf(spec: ToolbarSpec): (ToolbarItem & { name: string })[] {
	return controlsOf(spec).filter(
		(item): item is ToolbarItem & { name: string } => item.name !== undefined,
	);
}

/**
 * What ties a drawn control to its row in the legend.
 *
 * The page is interactive: hovering a button lights its explanation, and
 * hovering an explanation lights the button. Both sides are written from one
 * spec, so the handle they share is derived from the control's name rather
 * than authored — there is no second list to get out of step, and a control
 * with no name is not in the legend and gets no handle.
 *
 * Scoped to one figure by the script that reads it, so two bars can both have
 * a Docs button without lighting each other.
 */
export function controlKey(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * The constant a spec is exported as.
 *
 * For *Suggest an edit*, which hands back the block array as pasteable source:
 * a toolbar block written out as JSON would be four hundred lines of spec
 * where the file says `bar: EDITOR_BAR`. Derived from the id rather than
 * listed, and `tests/toolbars.test.ts` holds the derivation against the real
 * exports — a second list would be the thing that drifts.
 */
export function toolbarConstant(spec: ToolbarSpec): string {
	return spec.id.replace(/-/g, "_").toUpperCase();
}

/** Every glyph a bar draws, for the test that holds them against the icon set. */
export function iconsOf(spec: ToolbarSpec): string[] {
	return controlsOf(spec).flatMap((item) =>
		(item.t === "icon" || item.t === "button") && item.icon ? [item.icon] : [],
	);
}

// ---------------------------------------------------------------------------
// Drawing one
// ---------------------------------------------------------------------------

function iconSvg(name: string, size: number, art: ToolbarArt): string {
	const path = art.paths[name];
	if (path === undefined) return "";
	return (
		`<svg class="icon" viewBox="${escapeXml(art.viewBox)}" width="${size}" height="${size}"` +
		` aria-hidden="true"><path d="${escapeXml(path)}" fill="currentColor"/></svg>`
	);
}

function itemHtml(item: ToolbarItem, art: ToolbarArt): string {
	// What the linking script matches on, and what it reads out of the picture
	// when it lights a row from the other side. Only a control the legend lists
	// carries one; furniture is drawn and left alone.
	const tie = item.name
		? ` data-control="${escapeXml(controlKey(item.name))}" data-name="${escapeXml(item.name)}"`
		: "";

	switch (item.t) {
		case "mark":
			// The real mark, not a stand-in: on two of these bars it is the only
			// thing that says which window you are in, and a reader matching the
			// picture to their screen is matching that shape first.
			return (
				`<span class="logo"${tie}>${art.mark}` +
				`${item.text ? escapeXml(item.text) : ""}` +
				`${item.version ? `<span class="version">${escapeXml(art.version)}</span>` : ""}` +
				`${item.preview ? `<span class="version preview-chip">preview</span>` : ""}</span>`
			);
		case "icon":
			return (
				`<button type="button" tabindex="-1"${tie} class="tb icon-only${item.on ? " on" : ""}">` +
				`${iconSvg(item.icon, 16, art)}</button>`
			);
		case "button":
			return (
				`<button type="button" tabindex="-1"${tie} class="tb${item.icon ? " with-icon" : ""}` +
				`${item.primary ? " primary" : ""}${item.on ? " on" : ""}">` +
				`${item.icon ? iconSvg(item.icon, 15, art) : ""}${escapeXml(item.text)}</button>`
			);
		case "segmented":
			// The pair is one control, so the handle goes on the pair: lighting
			// only Manual would say the setting is Manual rather than the switch.
			return (
				`<span class="segmented"${tie}>` +
				item.options
					.map(
						(option, i) =>
							`<button type="button" tabindex="-1"${i === item.on ? ` class="on"` : ""}>` +
							`${escapeXml(option)}</button>`,
					)
					.join("") +
				`</span>`
			);
		case "select":
			// A real <select> would open on click and is a tab stop even inert, so
			// this is the box without the behaviour: the chevron is drawn on.
			return `<span class="tb docs-bar-select"${tie}>${escapeXml(item.text)}</span>`;
		case "label":
			return `<span class="group-label">${escapeXml(item.text)}</span>`;
		case "name":
			return (
				`<span class="doc-name${item.dirty ? " dirty" : ""}">${escapeXml(item.text)}</span>` +
				`${item.kind ? `<span class="doc-kind">${escapeXml(item.kind)}</span>` : ""}`
			);
		case "divider":
			return `<span class="divider"></span>`;
	}
}

/** The class the real chrome carries, so the replica takes its rules. */
const CHROME_CLASS: Record<ToolbarChrome, string> = {
	bar: "toolbar",
	head: "docs-page-head",
	float: "floating-tools",
};

/**
 * One bar as HTML, inert and in the reader's theme.
 *
 * Both renderers inject this string, so the picture cannot differ between the
 * editor's Docs panel and the website. Nothing in it comes from a reader:
 * every value is a literal in this file and passes through `escapeXml` anyway.
 */
export function toolbarHtml(spec: ToolbarSpec, art: ToolbarArt): string {
	// The three chromes do not spell the flexible gap the same way: the header
	// calls it `grow`, the other two `spacer`. Copying the wrong one leaves the
	// right-hand cluster sitting against the mark, which is exactly the layout
	// the page is trying to explain.
	const gapClass = spec.chrome === "head" ? "grow" : "spacer";
	const inner = spec.groups
		.map((group) => {
			const gap = group.apart ? `<span class="${gapClass}"></span>` : "";
			const items = group.items.map((item) => itemHtml(item, art)).join("");
			// A floating bar's groups are separate panels over the canvas; a bar
			// and a page header are one strip, so their groups are only an
			// authoring convenience and flatten away.
			return spec.chrome === "float"
				? `${gap}<div class="tool-group">${items}</div>`
				: `${gap}${items}`;
		})
		.join("");

	return (
		`<div class="docs-bar-frame ${escapeXml(spec.chrome)}" aria-hidden="true">` +
		`<div class="${CHROME_CLASS[spec.chrome]}">${inner}</div></div>`
	);
}

// ---------------------------------------------------------------------------
// The bars
// ---------------------------------------------------------------------------

/**
 * The editor's top bar: everything that acts on the project.
 *
 * Written from `src/app/Toolbar.tsx`'s `ProjectBar`, in its order. The three
 * at the right-hand end are the ones this page exists for.
 */
export const EDITOR_BAR: ToolbarSpec = {
	id: "editor-bar",
	title: "The editor's top bar",
	summary: "Across the top of the editor. Everything on it acts on the project.",
	chrome: "bar",
	groups: [
		{
			items: [
				{
					t: "mark",
					text: "",
					version: true,
					name: "The Roswaal mark",
					where: "far left",
					what:
						"Opens the project menu: the project you have open, the ones you opened " +
						"before, and a folder dialog for anything else. The version beside it is " +
						"the build you are on, which is the first thing any bug report needs.",
				},
				{
					t: "icon",
					icon: "refresh",
					name: "Refresh",
					what: "Re-reads the project from disk, node packs included.",
				},
				{
					t: "icon",
					icon: "newFile",
					name: "New graph",
					what: "A new `.nodescript`: one Script, LocalScript or ModuleScript.",
				},
				{
					t: "icon",
					icon: "map",
					name: "New node map",
					what: "A new map of where things live in the DataModel. See [Node maps](building-and-rojo).",
				},
			],
		},
		{
			apart: true,
			items: [
				{ t: "label", text: "Compile" },
				{
					t: "segmented",
					options: ["Manual", "Dynamic"],
					on: 0,
					name: "Compile: Manual | Dynamic",
					what:
						"How generated Luau reaches disk. **Manual** writes when you ask; " +
						"**Dynamic** writes on every edit. Also in [Settings](settings).",
				},
				{
					t: "button",
					text: "Compile project",
					name: "Compile project",
					what: "Compiles every graph and node map in the project.",
				},
				{
					t: "icon",
					icon: "document",
					name: "Docs",
					where: "third icon from the right",
					what:
						"This documentation, in its own window — guides, and a page for every " +
						"node including your project's own packs.",
				},
				{
					t: "icon",
					icon: "palette",
					name: "Node Design",
					where: "second icon from the right",
					what:
						"Opens [Node Design](creating-custom-nodes) in its own window: a form " +
						"over a node definition, for making nodes of your own.",
				},
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the last icon on the bar",
					what:
						"The project's settings, this browser's preferences, and themes. " +
						"See [Settings](settings).",
				},
			],
		},
	],
};

/**
 * The tools over a graph, from `DocumentBar`'s graph arm.
 *
 * Three groups rather than one row, because they float over the canvas with
 * the graph showing between them — which is also why the page has to say they
 * are three things: a reader looking for a single strip does not find them.
 */
export const GRAPH_BAR: ToolbarSpec = {
	id: "graph-bar",
	title: "The graph toolbars",
	summary: "Three floating groups over the canvas: the graph's settings, the tools, and compiling.",
	chrome: "float",
	groups: [
		{
			items: [
				{ t: "name", text: "Tank.nodescript", dirty: true },
				{
					t: "select",
					text: "ModuleScript",
					name: "Script class",
					what:
						"What this graph compiles to: a Script, a LocalScript or a ModuleScript. " +
						"Absent on a Lune graph, where every file is `.luau`.",
				},
				{
					t: "select",
					text: "Strict Mode",
					name: "Typechecking mode",
					what:
						"Which Luau typechecking mode the generated file declares. **Default** " +
						"writes no mode line; the other two also annotate the types of generated " +
						"locals. See [Types](types).",
				},
			],
		},
		{
			items: [
				{
					t: "icon",
					icon: "search",
					name: "Add node",
					what:
						"Opens the node menu at the centre of the view. Right-clicking the canvas " +
						"does the same, where you clicked.",
				},
				{
					t: "icon",
					icon: "layout",
					name: "Realign",
					what:
						"Tidies the graph into columns — `Ctrl` + `Shift` + `L`. With several " +
						"nodes selected, only those move.",
				},
				{
					t: "button",
					text: "Straighten",
					on: true,
					name: "Straighten",
					what:
						"A setting on Realign rather than an action: lit, each node lines up on " +
						"the execution wire arriving at it instead of on a plain column.",
				},
				{
					t: "icon",
					icon: "terminal",
					name: "Preview",
					what:
						"The Luau this graph produced, picked out of the generated file — `P` does " +
						"the same. With nodes selected it shows just what they compiled to.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "select",
					text: "Roblox",
					name: "Target",
					what:
						"What this graph compiles for. Beside the button that compiles it, because " +
						"a Roblox-only node being an error in a Lune graph is what it explains.",
				},
				{
					t: "button",
					text: "Compile script",
					icon: "build",
					primary: true,
					name: "Compile script",
					what: "Compiles this document alone — `Ctrl` + `S`.",
				},
			],
		},
	],
};

/**
 * The node map's row, which is the same slot holding something else.
 *
 * Kept as its own spec rather than a note under the graph bar: a map has no
 * graph tools at all, and a reader who opens one and finds four of the six
 * things gone needs to be told that is the shape rather than a failure.
 */
export const MAP_BAR: ToolbarSpec = {
	id: "map-bar",
	title: "A node map's bar",
	summary: "What the same row holds when the open document is a node map rather than a graph.",
	chrome: "bar",
	groups: [
		{ items: [{ t: "name", text: "Tank.nodemap", kind: "node map" }] },
		{
			apart: true,
			items: [
				{
					t: "button",
					text: "Write project file",
					icon: "build",
					primary: true,
					name: "Write project file",
					what:
						"Writes the map into the Rojo project file — `Ctrl` + `S`. See " +
						"[Building and Rojo](building-and-rojo).",
				},
			],
		},
	],
};

/**
 * Node Design's header, from `DesignerPage.tsx`.
 *
 * Short, and one of its three is icon-only, which is the one people miss.
 */
export const DESIGNER_BAR: ToolbarSpec = {
	id: "designer-bar",
	title: "Node Design's top bar",
	summary: "Across the top of the Node Design window.",
	chrome: "head",
	groups: [
		{
			items: [
				{
					t: "mark",
					text: "Node Design",
					version: true,
					name: "Node Design",
					where: "far left",
					what: "Says which window you are in, and which build it is.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "icon",
					icon: "help",
					name: "How custom nodes work",
					where: "the question mark",
					what:
						"Opens [Creating custom nodes](creating-custom-nodes) — the page about " +
						"what you are looking at, rather than the documentation's front door.",
				},
				{
					t: "button",
					text: "Docs",
					icon: "document",
					name: "Docs",
					what: "This documentation, in its own window. `Ctrl` + `K` searches it from here.",
				},
				{
					t: "button",
					text: "Open Editor",
					name: "Open Editor",
					what: "The editor, in a new tab. Node Design is a window of its own, not a panel.",
				},
			],
		},
	],
};

/** The documentation window's header, from `DocsPage.tsx`. */
export const DOCS_BAR: ToolbarSpec = {
	id: "docs-bar",
	title: "The documentation's top bar",
	summary: "Across the top of this window.",
	chrome: "head",
	groups: [
		{
			items: [
				{
					t: "mark",
					text: "Docs",
					version: true,
					name: "Docs",
					where: "far left",
					what:
						"Says which window you are in, and which build it is. A warning sits " +
						"beside it when the daemon is not reachable — the built-in library is " +
						"still documented, your project's own packs are not.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "button",
					text: "Settings",
					icon: "settings",
					name: "Settings",
					what:
						"This browser's preferences and themes, including the ones that change " +
						"the pictures on these pages. No project settings here: those are the " +
						"repository's, and they are changed from the editor.",
				},
				{
					t: "button",
					text: "Open Editor",
					name: "Open Editor",
					what: "The editor, in a new tab.",
				},
			],
		},
	],
};

/**
 * The same bar, in the editor that runs in a browser tab.
 *
 * Roswaal is two editors out of one bundle, and the Toolbars page is read from
 * both — the *Try it in your browser* build on the project site opens the
 * documentation at the published copy of this very page. The buttons are the
 * same buttons and they are in the same order, so a second drawing looks
 * redundant right up until you read what three of them say: the mark carries a
 * chip, the project is in the tab rather than on disk, and **Docs lands on the
 * published site, which documents the built-in library and cannot see a
 * project's own packs**.
 *
 * That last one is the reason this exists rather than a footnote. A page that
 * promises somebody a reference for their own nodes, in the one build that
 * cannot give them one, has sent them looking for something that is not there.
 */
export const EDITOR_BAR_BROWSER: ToolbarSpec = {
	id: "editor-bar-browser",
	title: "The editor's top bar, in your browser",
	summary:
		"The same bar in the browser preview. Same buttons, in the same order — three of them " +
		"reach something different.",
	chrome: "bar",
	groups: [
		{
			items: [
				{
					t: "mark",
					text: "",
					version: true,
					preview: true,
					name: "The Roswaal mark",
					where: "far left, with a preview chip",
					what:
						"Opens the project menu. **Your project is kept in this browser**, not on " +
						"your disk — it survives a reload and it is gone if you clear the site's " +
						"data. The menu offers a folder on your own machine instead, where the " +
						"browser allows it.",
				},
				{
					t: "icon",
					icon: "refresh",
					name: "Refresh",
					what: "Re-reads the project you have open, node packs included.",
				},
				{
					t: "icon",
					icon: "newFile",
					name: "New graph",
					what: "A new `.nodescript`: one Script, LocalScript or ModuleScript.",
				},
				{
					t: "icon",
					icon: "map",
					name: "New node map",
					what: "A new map of where things live in the DataModel. See [Node maps](building-and-rojo).",
				},
			],
		},
		{
			apart: true,
			items: [
				{ t: "label", text: "Compile" },
				{
					t: "segmented",
					options: ["Manual", "Dynamic"],
					on: 0,
					name: "Compile: Manual | Dynamic",
					what:
						"How generated Luau reaches the project. **Manual** writes when you ask; " +
						"**Dynamic** writes on every edit. Also in [Settings](settings).",
				},
				{
					t: "button",
					text: "Compile project",
					name: "Compile project",
					what:
						"Compiles every graph and node map. The generated `.luau` appears in the " +
						"tree beside each graph, to read or copy out.",
				},
				{
					t: "icon",
					icon: "document",
					name: "Docs",
					where: "third icon from the right",
					what:
						"**The published documentation** — these pages, which cover the built-in " +
						"library. They are a separate site with no editor behind them, so they " +
						"**cannot document a project's own packs**. For those, read the reference " +
						"from the editor the daemon serves.",
				},
				{
					t: "icon",
					icon: "palette",
					name: "Node Design",
					where: "second icon from the right",
					what:
						"Opens [Node Design](creating-custom-nodes) in its own tab, on the packs of " +
						"the project you have open here. It works the same way it does under the " +
						"daemon.",
				},
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the last icon on the bar",
					what:
						"The project's settings, this browser's preferences, and themes. " +
						"See [Settings](settings).",
				},
			],
		},
	],
};

/**
 * The header on the published copy of these pages.
 *
 * Not the same three buttons with different destinations — a different header
 * altogether, because there is no editor and no Settings behind a static site.
 * Somebody reading this page on the project site is looking at this bar at the
 * top of their window, and drawing them the daemon's instead is the one way a
 * page about finding buttons can be actively unhelpful.
 */
export const DOCS_SITE_BAR: ToolbarSpec = {
	id: "docs-site-bar",
	title: "The published documentation's top bar",
	summary: "Across the top of these pages on the project site, where there is no daemon behind them.",
	chrome: "head",
	groups: [
		{
			items: [
				{
					t: "mark",
					text: "Docs",
					version: true,
					name: "The mark, and Docs",
					where: "far left",
					what:
						"Back to the documentation's own index, and the build these pages were " +
						"generated from.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "button",
					text: "Try it in your browser",
					name: "Try it in your browser",
					what:
						"The editor, running in a tab, on a project kept in this browser. No install " +
						"and no daemon — and no access to a folder on your machine unless you hand " +
						"one over.",
				},
				{
					t: "button",
					text: "Source",
					name: "Source",
					what: "The repository. Roswaal is 0BSD: read it, fork it, take what you want from it.",
				},
			],
		},
	],
};

/**
 * Node Design, in the browser build.
 *
 * The same window with the same three buttons — it reads the project's packs
 * out of the browser exactly as it reads them off disk under the daemon. What
 * it carries that the other does not is **the preview mark**, which every
 * surface of that build carries as a rule; see `src/app/previewBuild.tsx`.
 *
 * Drawn rather than noted, because the mark is a picture and the whole argument
 * of this page is that a picture of a control beats a sentence about one.
 */
export const DESIGNER_BAR_BROWSER: ToolbarSpec = {
	id: "designer-bar-browser",
	title: "Node Design's top bar, in your browser",
	summary: "The same window in the browser preview, marked as one.",
	chrome: "head",
	groups: [
		{
			items: [
				{
					t: "mark",
					text: "Node Design",
					version: true,
					preview: true,
					name: "Node Design",
					where: "far left, with a preview chip",
					what:
						"Every window of the browser preview says it is one. The packs are the " +
						"project's own, read out of the browser the same way they are read off " +
						"disk — Node Design itself works the same in both builds.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "icon",
					icon: "help",
					name: "How custom nodes work",
					where: "the question mark",
					what: "Opens [Creating custom nodes](creating-custom-nodes).",
				},
				{
					t: "button",
					text: "Docs",
					icon: "document",
					name: "Docs",
					what:
						"The published documentation — the built-in library. `Ctrl` + `K` searches " +
						"it from here.",
				},
				{
					t: "button",
					text: "Open Editor",
					name: "Open Editor",
					what: "The editor, in a new tab.",
				},
			],
		},
	],
};

/** Every bar the documentation draws, in the order the page walks them. */
export const TOOLBARS: ToolbarSpec[] = [
	EDITOR_BAR, EDITOR_BAR_BROWSER, GRAPH_BAR, MAP_BAR,
	DESIGNER_BAR, DESIGNER_BAR_BROWSER, DOCS_BAR, DOCS_SITE_BAR,
];

/**
 * The bars the browser build draws, which all carry the preview mark.
 *
 * Named as a set so `tests/previewbuild.test.ts` can hold the rule against the
 * drawings as well as against the code: a bar added here without the chip is a
 * page telling somebody they are in the tool when they are in the preview.
 */
export const BROWSER_TOOLBARS: ToolbarSpec[] = [EDITOR_BAR_BROWSER, DESIGNER_BAR_BROWSER];
