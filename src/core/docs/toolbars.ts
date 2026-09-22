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
import type { NodeScript } from "../schema.js";

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
	/**
	 * The colour the canvas draws a pin of this type in, for a panel row's
	 * swatch.
	 *
	 * Passed in for the same reason the glyphs are: the palette is in
	 * `src/app`. Absent, a typed swatch falls back to the outline one, which is
	 * the honest degradation — a ring says "a thing" and a wrong colour says
	 * something false about a type.
	 */
	pinColor?: (type: string | undefined, kind: "exec" | "data") => string;
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
		| {
				t: "mark"; text?: string; version?: boolean; preview?: boolean;
				/**
				 * The mark in a build's colour rather than beside a chip: the editor's
				 * top bar wears it this way. See `MarkedLogo`.
				 */
				tint?: "preview" | "canary";
		  }
		/** An icon on its own: the shape of most of the chrome. */
		| { t: "icon"; icon: string; on?: boolean; primary?: boolean }
		/** A button with words, and an icon before them when it has one. */
		| { t: "button"; text: string; icon?: string; primary?: boolean; on?: boolean }
		/** A pair or trio of buttons where one is lit: a setting, not an action. */
		| { t: "segmented"; options: string[]; on: number }
		/** A dropdown, shown holding whatever it is set to. */
		| { t: "select"; text: string }
		/** A text box, shown with its placeholder: the start page's path. */
		| { t: "field"; text: string }
		/** A caption naming what the control beside it sets. */
		| { t: "label"; text: string }
		/** The open document's name, and what kind of document it is. */
		| { t: "name"; text: string; kind?: string; dirty?: boolean }
		/** A rule between two clusters inside one group. */
		| { t: "divider" }
		/**
		 * A panel's heading, with the button that adds to it.
		 *
		 * `action` is the button's word. A heading that declares something has
		 * one and a heading that only lists does not, which is the difference
		 * between Modules and Functions in the Variables panel and is worth
		 * drawing rather than explaining.
		 */
		| {
				t: "heading";
				text: string;
				level?: 2 | 3;
				action?: string;
				/**
				 * This section is not what the page is about.
				 *
				 * Set by `pointingElsewhere`, never by hand: a section whose words
				 * point at another page is by definition not this page's subject,
				 * so the two cannot drift apart. The renderer dims it and the
				 * rows under it, which leaves the light on the one section that
				 * is — a scrim with a cutout, said in classes rather than in a
				 * drawing nobody could keep in step with the panel.
				 */
				dim?: boolean;
		  }
		/**
		 * One row of a list: a swatch, a name, and what sits at its right.
		 *
		 * `swatch` is a colour, or `"outline"` for the ring a module gets —
		 * a variable's swatch is its type's colour and a module has no type.
		 */
		| {
				t: "row";
				/**
				 * What the row shows.
				 *
				 * `label`, not `name`: `name` is the legend's key, and a row is an
				 * *example* of what a section holds rather than a part a reader
				 * matches against. Called `name` it put "Accumulator" and "roblox"
				 * in the legend as though they were controls.
				 */
				label: string;
				trailing?: string;
				/**
				 * The *type* whose colour the swatch takes — `"number"` — or
				 * `"outline"` for the ring a module gets, having no type.
				 */
				swatch?: string;
				badge?: string;
		  }
		/** The line a panel shows when its list is empty. */
		| { t: "hint"; text: string }
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
	/** Starts a second row of the bar, as a phone's top bar wraps into one. */
	row?: boolean;
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
/**
 * `popmenu` rather than `menu`: the frame carries the chrome as a class, and
 * the editor's context menus are `.menu`, fixed to the screen.
 */
export type ToolbarChrome = "bar" | "head" | "float" | "panel" | "popmenu";

export interface ToolbarSpec {
	/** Stable; the anchor the docs page gives this bar's section. */
	id: string;
	/** The heading this bar is documented under. */
	title: string;
	/** One line: where this bar is and what it acts on. */
	summary: string;
	chrome: ToolbarChrome;
	/**
	 * Drawn at a tablet's or a phone's width rather than the page's, so it
	 * wraps where the real one wraps, by the same stylesheet.
	 */
	device?: "tablet" | "phone";
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
				`<span class="logo"${tie}>` +
				`${item.tint ? `<span class="logo-mark mark-${item.tint}">${art.mark}</span>` : art.mark}` +
				`${item.text ? escapeXml(item.text) : ""}` +
				`${item.version ? `<span class="version">${escapeXml(art.version)}</span>` : ""}` +
				`${item.preview ? `<span class="version preview-chip">preview</span>` : ""}</span>`
			);
		case "icon":
			return (
				`<button type="button" tabindex="-1"${tie} class="tb icon-only${item.on ? " on" : ""}${item.primary ? " primary" : ""}">` +
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
		case "field":
			return `<span class="tb docs-bar-field"${tie}>${escapeXml(item.text)}</span>`;
		case "label":
			return `<span class="group-label">${escapeXml(item.text)}</span>`;
		case "name":
			return (
				`<span class="doc-name${item.dirty ? " dirty" : ""}">${escapeXml(item.text)}</span>` +
				`${item.kind ? `<span class="doc-kind">${escapeXml(item.kind)}</span>` : ""}`
			);
		case "divider":
			return `<span class="divider"></span>`;

		case "heading":
			// `h3.variables-sub` is the editor's own subheading, and the Add
			// button beside it is the editor's own `.tb`.
			return item.level === 3 || item.level === undefined
				? `<h3 class="variables-sub"${tie}><span>${escapeXml(item.text)}</span>` +
					`${item.action ? `<button type="button" tabindex="-1" class="tb">${escapeXml(item.action)}</button>` : ""}</h3>`
				: `<h2${tie}><span>${escapeXml(item.text)}</span>` +
					`${item.action ? `<button type="button" tabindex="-1" class="tb">${escapeXml(item.action)}</button>` : ""}</h2>`;

		case "row": {
			const colour = item.swatch && item.swatch !== "outline"
				? art.pinColor?.(item.swatch, "data")
				: undefined;
			return (
				`<div class="variable"${tie}><div class="variable-head">` +
				`<span class="swatch${colour ? "" : " module"}"` +
				`${colour ? ` style="background:${escapeXml(colour)}"` : ""}></span>` +
				`<span class="name">${escapeXml(item.label)}</span>` +
				`${item.badge ? `<span class="badge const">${escapeXml(item.badge)}</span>` : ""}` +
				`${item.trailing ? `<span class="type">${escapeXml(item.trailing)}</span>` : ""}` +
				`</div></div>`
			);
		}

		case "hint":
			return `<p class="hint"${tie}>${escapeXml(item.text)}</p>`;
	}
}

/**
 * A panel's items, wrapped one `<div>` per heading.
 *
 * The wrapper is what lets a section be lit or dimmed as a whole: without it
 * the heading and its rows are siblings in a flat list and there is nothing
 * to put a ring around. `focus` is only spelt when some *other* section is
 * dimmed — a panel with nothing pointed away has no subject, and marking every
 * section as the focus would light the lot.
 */
function panelSections(items: ToolbarItem[], art: ToolbarArt): string {
	const dimmed = items.some((item) => item.t === "heading" && item.dim);
	const out: string[] = [];
	let open: string[] | null = null;
	let openClass = "";

	const close = () => {
		if (open === null) return;
		out.push(`<div class="panel-section${openClass}">${open.join("")}</div>`);
		open = null;
	};

	for (const item of items) {
		if (item.t === "heading") {
			close();
			open = [];
			openClass = item.dim ? " dim" : dimmed ? " focus" : "";
		}
		// Anything before the first heading is furniture and stands on its own.
		if (open === null) out.push(itemHtml(item, art));
		else open.push(itemHtml(item, art));
	}
	close();
	return out.join("");
}

/** The class the real chrome carries, so the replica takes its rules. */
const CHROME_CLASS: Record<ToolbarChrome, string> = {
	bar: "toolbar",
	head: "docs-page-head",
	float: "floating-tools",
	// A docked panel. Its own class, because the editor's is a dock and this is
	// a picture of one -- the panel's *contents* are what carry the real class
	// names, which is where the fidelity comes from.
	panel: "variables docs-panel-shot",
	// A pop-out menu, open: the list the projects panel's Project button holds.
	popmenu: "tool-popout-panel docs-menu-shot",
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
			const gap = (group.row ? `<span class="docs-bar-break"></span>` : "") +
				(group.apart ? `<span class="${gapClass}"></span>` : "");
			const items = group.items.map((item) => itemHtml(item, art)).join("");
			// A floating bar's groups are separate panels over the canvas; a bar
			// and a page header are one strip, so their groups are only an
			// authoring convenience and flatten away.
			if (spec.chrome === "float") return `${gap}<div class="tool-group">${items}</div>`;
			// A panel's groups are sections down a column rather than clusters
			// along a row, so there is no flexible gap to push them apart with.
			// Each heading starts a section that runs to the next one, so the
			// rows under a dimmed heading dim with it.
			if (spec.chrome === "panel") {
				return `<div class="variable-list">${panelSections(group.items, art)}</div>`;
			}
			return `${gap}${items}`;
		})
		.join("");

	return (
		`<div class="docs-bar-frame ${escapeXml(spec.chrome)}${spec.device ? ` device-${spec.device}` : ""}" aria-hidden="true">` +
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
						"the build you are on, which is the first thing any bug report needs; on a " +
						"narrow screen it is in the mark's tooltip instead.",
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
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the gear at the end",
					what:
						"This browser's preferences — node corners, wire style and themes — which " +
						"is what a window that draws nodes all day wants to hand. No project " +
						"settings: `roswaal.json` is the repository's and is changed from the " +
						"editor.",
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
					tint: "preview",
					name: "The Roswaal mark",
					where: "far left, in blue",
					what:
						"Opens the project menu. Blue means the browser preview: **your project is kept in this browser**, not on " +
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
					tint: "preview",
					text: "Docs",
					version: true,
					name: "The mark, and Docs",
					where: "far left",
					what:
						"Opens the editor on your projects. Beside it, the build these pages were " +
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
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the gear at the end",
					what:
						"Your theme and reading face, kept in this browser. The same preference " +
						"the editor writes, so a scheme picked there is the one these pages are " +
						"in — and the icon alone, because a published page gives its width to " +
						"what you came to read.",
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
					tint: "preview",
					name: "Node Design",
					where: "far left, in blue",
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
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the gear at the end",
					what:
						"This browser's preferences — node corners, wire style and themes — which " +
						"is what a window that draws nodes all day wants to hand. No project " +
						"settings: `roswaal.json` is the repository's and is changed from the " +
						"editor.",
				},
			],
		},
	],
};

/**
 * The Variables panel, which is where a script's own declarations live.
 *
 * Drawn rather than described for the same reason a toolbar is: the panel
 * answers "what does this script have to hand", and a reader who has not seen
 * it cannot picture what "drag a module onto the canvas" means. One picture
 * with the parts named is shorter than the paragraph that would replace it.
 *
 * The rows are the demo project's, so the picture is of something real rather
 * than of `foo` and `bar`.
 */
export const VARIABLES_PANEL: ToolbarSpec = {
	id: "variables-panel",
	title: "The Variables panel",
	summary: "Everything this script declares: its variables, its modules, its locals and its functions.",
	chrome: "panel",
	groups: [
		{
			items: [
				{
					t: "heading",
					level: 2,
					text: "Variables",
					action: "Add",
					name: "Variables",
					what:
						"Values the whole script can read and write. **Add** makes one; drag it onto the " +
						"canvas for a Get, or hold `Ctrl` while you drop for a Set.",
				},
				// Rows rather than controls: they carry no `name`, so the legend
				// does not list them. The panel's parts are what a reader is
				// matching; the rows are what those parts contain -- and a
				// section drawn empty reads as one that holds nothing, which is
				// the wrong thing to say about all four of these.
				{ t: "row", label: "Accumulator", trailing: "number", swatch: "number" },
				{ t: "row", label: "MaxTanks", trailing: "number", swatch: "number", badge: "const" },
				{
					t: "heading",
					text: "Modules",
					action: "Add",
					name: "Modules",
					what:
						"What this script requires. Each one writes a single `require` at the top of the " +
						"generated file, however many places read it — so four uses are four pills and " +
						"one import.",
				},
				// `outline` rather than a colour: a variable's swatch is its type's,
				// and a module has no type.
				{ t: "row", label: "roblox", trailing: "@lune/roblox", swatch: "outline" },
				{ t: "row", label: "Config", trailing: "./Config", swatch: "outline" },
				{
					t: "heading",
					text: "Locals",
					name: "Locals",
					what:
						"The Declare Locals this graph can see. A local exists inside the block that " +
						"declared it, so the list changes with the graph you are looking at — and there " +
						"is no **Add**, because a local is declared by a node on the canvas, where it " +
						"runs.",
				},
				{ t: "row", label: "restores", trailing: "{ [Model]: Restore }", swatch: "table" },
				{ t: "row", label: "tuning", trailing: "Tuning", swatch: "table", badge: "const" },
				{
					t: "heading",
					text: "Functions",
					name: "Functions",
					what:
						"Every function this script declares. Clicking one opens its graph, which is how " +
						"you move between them — a declaration in a graph of any size is off screen.",
				},
				// `hoisted` and `here` are the editor's own trailing words, and
				// they are the difference between the two declaration nodes.
				{ t: "row", label: "read", trailing: "hoisted", swatch: "function" },
				{ t: "row", label: "hide", trailing: "here", swatch: "function" },
			],
		},
	],
};

/**
 * The same panel, with some of its sections pointing at their own page.
 *
 * One drawing, two legends. A page about modules should not re-explain what a
 * variable is — it should say where that is explained — but it still wants the
 * whole panel in the picture, because the panel is the thing you are looking
 * at and a cropped one would be a picture of something that does not exist.
 *
 * So the drawing is shared and only the words move.
 */
export function pointingElsewhere(
	spec: ToolbarSpec, pointers: Record<string, string>,
): ToolbarSpec {
	return {
		...spec,
		groups: spec.groups.map((group) => ({
			...group,
			items: group.items.map((item) => {
				if (item.name === undefined) return item;
				const instead = pointers[controlKey(item.name)];
				if (instead === undefined) return item;
				// A heading whose words point away is dimmed as well as reworded:
				// it is the same statement, made to the eye instead of in prose.
				return item.t === "heading"
					? { ...item, what: instead, dim: true }
					: { ...item, what: instead };
			}),
		})),
	};
}

/** How each section reads when it is not the page's subject. */
const POINTERS = {
	variables: "Values the whole script reads and writes. See [Variables and locals](variables-and-locals).",
	modules: "What this script requires, one `require` each. See [Modules](modules).",
	locals: "Values that exist inside one block. See [Variables and locals](variables-and-locals).",
	functions: "Every function this script declares. See [Functions](functions).",
};

/**
 * The Variables panel as the Modules page draws it: modules explained, the
 * rest pointing at the pages that are about them.
 */
export const MODULES_PANEL: ToolbarSpec = pointingElsewhere(VARIABLES_PANEL, {
	variables: POINTERS.variables,
	locals: POINTERS.locals,
	functions: POINTERS.functions,
});

/**
 * The Variables panel as its own page draws it: variables and locals in full,
 * with modules and functions pointing at the pages about them.
 */
export const VARIABLES_PAGE_PANEL: ToolbarSpec = pointingElsewhere(VARIABLES_PANEL, {
	modules: POINTERS.modules,
	functions: POINTERS.functions,
});

/** The Variables panel as the Functions page draws it. */
export const FUNCTIONS_PANEL: ToolbarSpec = pointingElsewhere(VARIABLES_PANEL, {
	variables: POINTERS.variables,
	modules: POINTERS.modules,
	locals: POINTERS.locals,
});

// ---------------------------------------------------------------------------
// The same bars on a tablet and a phone
//
// Each is a whole bar with a whole legend, as its Desktop tab has: somebody
// holding an iPad reads that tab and no other. The lines are the desktop
// bar's own, taken by name through `as`, with what this screen does
// differently said after -- so a control is described in one place, and a
// change to it reaches every screen.
// ---------------------------------------------------------------------------

/**
 * A control's name and legend lines, from the bar that already documents it,
 * with `more` said after the line. Throws for a name the bar does not have,
 * so a renamed control cannot quietly lose its description here.
 */
function as(from: ToolbarSpec, name: string, more?: string, where?: string): Documented {
	const item = controlsOf(from).find((one) => one.name === name);
	if (!item) throw new Error(`${from.id} has no control named "${name}"`);
	return {
		name,
		where: where ?? item.where,
		what: more ? `${item.what ?? ""} ${more}`.trim() : item.what,
	};
}

const SAME_TAB = "On a tablet or a phone it opens in this tab, and the back button returns.";
const SHORT_OF_ROOM = "Held upright, where the bar is short of room,";
const NODE_DESIGN_HERE =
	"Opens [Node Design](creating-custom-nodes) in this tab, on the packs of the project you " +
	"have open here; the back button returns.";

/** The editor's top bar on a tablet. */
export const EDITOR_BAR_TABLET: ToolbarSpec = {
	id: "editor-bar-tablet",
	device: "tablet",
	title: "The editor's top bar, on a tablet",
	summary:
		"The web app's bar. Held upright its words fold away so it keeps one row; held sideways " +
		"it is as on a computer.",
	chrome: "bar",
	groups: [
		{
			items: [
				{
					t: "mark", text: "", tint: "preview",
					...as(EDITOR_BAR_BROWSER, "The Roswaal mark", `${SHORT_OF_ROOM} the version beside it steps aside; it is in the mark's tooltip.`),
				},
				{ t: "icon", icon: "refresh", ...as(EDITOR_BAR_BROWSER, "Refresh") },
				{ t: "icon", icon: "newFile", ...as(EDITOR_BAR_BROWSER, "New graph") },
				{ t: "icon", icon: "map", ...as(EDITOR_BAR_BROWSER, "New node map") },
			],
		},
		{
			apart: true,
			items: [
				{
					t: "segmented", options: ["Manual", "Dynamic"], on: 1,
					...as(EDITOR_BAR_BROWSER, "Compile: Manual | Dynamic", `${SHORT_OF_ROOM} the Compile caption goes.`),
				},
				{ t: "icon", icon: "build", ...as(EDITOR_BAR_BROWSER, "Compile project", `${SHORT_OF_ROOM} it is its icon.`) },
				{ t: "icon", icon: "document", ...as(EDITOR_BAR_BROWSER, "Docs", SAME_TAB) },
				{ t: "icon", icon: "palette", ...as(EDITOR_BAR_BROWSER, "Node Design"), what: NODE_DESIGN_HERE },
				{ t: "icon", icon: "settings", ...as(EDITOR_BAR_BROWSER, "Settings") },
			],
		},
	],
};

/** The editor's top bar on a phone: the tablet's, in two rows. */
export const EDITOR_BAR_PHONE: ToolbarSpec = {
	id: "editor-bar-phone",
	device: "phone",
	title: "The editor's top bar, on a phone",
	summary: "The tablet's bar held upright, in two rows: Docs, Node Design and Settings go under the rest.",
	chrome: "bar",
	groups: [
		{
			items: [
				{
					t: "mark", text: "", tint: "preview",
					...as(EDITOR_BAR_BROWSER, "The Roswaal mark", "The version is in its tooltip."),
				},
				{ t: "icon", icon: "refresh", ...as(EDITOR_BAR_BROWSER, "Refresh") },
				{ t: "icon", icon: "newFile", ...as(EDITOR_BAR_BROWSER, "New graph") },
				{ t: "icon", icon: "map", ...as(EDITOR_BAR_BROWSER, "New node map") },
			],
		},
		{
			apart: true,
			items: [
				{ t: "segmented", options: ["Manual", "Dynamic"], on: 1, ...as(EDITOR_BAR_BROWSER, "Compile: Manual | Dynamic") },
				{ t: "icon", icon: "build", ...as(EDITOR_BAR_BROWSER, "Compile project", "As its icon.") },
			],
		},
		{
			items: [
				{ t: "icon", icon: "document", ...as(EDITOR_BAR_BROWSER, "Docs", SAME_TAB, "second row, first") },
				{ t: "icon", icon: "palette", ...as(EDITOR_BAR_BROWSER, "Node Design", undefined, "second row, second"), what: NODE_DESIGN_HERE },
				{ t: "icon", icon: "settings", ...as(EDITOR_BAR_BROWSER, "Settings", undefined, "second row, last") },
			],
		},
	],
};

const HOLD_TO_ADD = "On a touch screen, pressing and holding the graph does the same, where you held.";

/** The graph's tools on a tablet. */
export const GRAPH_BAR_TABLET: ToolbarSpec = {
	id: "graph-bar-tablet",
	device: "tablet",
	title: "The graph's tools, on a tablet",
	summary:
		"Held upright, Straighten and Compile script are their icons, so the three groups keep " +
		"one row. Held sideways they are as on a computer.",
	chrome: "float",
	groups: [
		{
			items: [
				{ t: "select", text: "ModuleScript", ...as(GRAPH_BAR, "Script class") },
				{ t: "select", text: "Strict Mode", ...as(GRAPH_BAR, "Typechecking mode") },
			],
		},
		{
			items: [
				{ t: "icon", icon: "search", ...as(GRAPH_BAR, "Add node", HOLD_TO_ADD) },
				{ t: "icon", icon: "layout", ...as(GRAPH_BAR, "Realign") },
				{ t: "icon", icon: "straighten", on: true, ...as(GRAPH_BAR, "Straighten", `${SHORT_OF_ROOM} it is its icon, lit while it is on.`) },
				{ t: "icon", icon: "terminal", ...as(GRAPH_BAR, "Preview") },
			],
		},
		{
			apart: true,
			items: [
				{ t: "select", text: "Roblox", ...as(GRAPH_BAR, "Target", "Lune shows a warning triangle after its name.") },
				{ t: "icon", icon: "build", primary: true, ...as(GRAPH_BAR, "Compile script", `${SHORT_OF_ROOM} it is its icon.`) },
			],
		},
	],
};

/** The graph's tools on a phone, with the document's settings behind a button each. */
export const GRAPH_BAR_PHONE: ToolbarSpec = {
	id: "graph-bar-phone",
	device: "phone",
	title: "The graph's tools, on a phone",
	summary: "The tablet's tools held upright, with the document's settings behind a button each.",
	chrome: "float",
	groups: [
		{
			items: [
				{
					t: "select", text: "Script",
					name: "Script and mode",
					what:
						"What this graph compiles to — a Script, a LocalScript or a ModuleScript — and which " +
						"Luau typechecking mode the file declares, behind one button that names the type in a " +
						"word — Script, Local or Module — and lists them in full. Tap " +
						"anywhere else to put them away. See [Types](types).",
				},
			],
		},
		{
			items: [
				{ t: "icon", icon: "search", ...as(GRAPH_BAR, "Add node", HOLD_TO_ADD) },
				{ t: "icon", icon: "layout", ...as(GRAPH_BAR, "Realign") },
				{ t: "icon", icon: "straighten", on: true, ...as(GRAPH_BAR, "Straighten", "As its icon, lit while it is on.") },
				{ t: "icon", icon: "terminal", ...as(GRAPH_BAR, "Preview") },
			],
		},
		{
			apart: true,
			items: [
				{
					t: "select", text: "Roblox",
					...as(GRAPH_BAR, "Target", "Behind a button that names it, with a warning triangle after Lune."),
				},
				{ t: "icon", icon: "build", primary: true, ...as(GRAPH_BAR, "Compile script", "As its icon.") },
			],
		},
	],
};

/** Node Design's header on a tablet: the web app's, opening pages in this tab. */
export const DESIGNER_BAR_TABLET: ToolbarSpec = {
	id: "designer-bar-tablet",
	device: "tablet",
	title: "Node Design's top bar, on a tablet",
	summary:
		"The web app's bar. Over a node, a second bar switches between its preview and its " +
		"logic: see **Only on a touch screen** below.",
	chrome: "head",
	groups: [
		{
			items: [
				{ t: "mark", text: "Node Design", tint: "preview", ...as(DESIGNER_BAR_BROWSER, "Node Design") },
			],
		},
		{
			apart: true,
			items: [
				{ t: "icon", icon: "help", ...as(DESIGNER_BAR_BROWSER, "How custom nodes work") },
				{ t: "button", text: "Docs", icon: "document", ...as(DESIGNER_BAR_BROWSER, "Docs", SAME_TAB) },
				{
					t: "button", text: "Open Editor",
					name: "Open Editor",
					what: `The editor. ${SAME_TAB} Leaving a node with unsaved edits asks first.`,
				},
				{ t: "icon", icon: "settings", ...as(DESIGNER_BAR_BROWSER, "Settings") },
			],
		},
	],
};

/** Node Design's header on a phone. */
export const DESIGNER_BAR_PHONE: ToolbarSpec = {
	id: "designer-bar-phone",
	device: "phone",
	title: "Node Design's top bar, on a phone",
	summary: "The web app's bar, with Docs as its icon so the row holds Settings.",
	chrome: "head",
	groups: [
		{
			items: [
				{
					t: "mark", text: "Node Design", tint: "preview",
					...as(DESIGNER_BAR_BROWSER, "Node Design", "The version steps aside on a phone."),
				},
			],
		},
		{
			apart: true,
			items: [
				{ t: "icon", icon: "help", ...as(DESIGNER_BAR_BROWSER, "How custom nodes work") },
				{ t: "icon", icon: "document", ...as(DESIGNER_BAR_BROWSER, "Docs", `As its icon. ${SAME_TAB}`) },
				{
					t: "button", text: "Open Editor",
					name: "Open Editor",
					what: `The editor. ${SAME_TAB} Leaving a node with unsaved edits asks first.`,
				},
				{ t: "icon", icon: "settings", ...as(DESIGNER_BAR_BROWSER, "Settings") },
			],
		},
	],
};

/** The published documentation's header on a touch screen. */
export const DOCS_SITE_BAR_TOUCH: ToolbarSpec = {
	id: "docs-site-bar-touch",
	device: "tablet",
	title: "The published documentation's header, on a touch screen",
	summary:
		"The web app's header, with the contents behind a button rather than holding a column, " +
		"and a button for search.",
	chrome: "head",
	groups: [
		{
			items: [
				{ t: "mark", text: "Docs", version: true, tint: "preview", ...as(DOCS_SITE_BAR, "The mark, and Docs") },
				{
					t: "button", text: "Contents",
					name: "Contents", what: "Slides the contents out over the page. Tap beside them to put them away.",
				},
				{ t: "icon", icon: "search", name: "Search", what: "The search `Ctrl` + `K` opens, for a screen with no keyboard." },
			],
		},
		{
			apart: true,
			items: [
				{ t: "button", text: "Try it in your browser", ...as(DOCS_SITE_BAR, "Try it in your browser", SAME_TAB) },
				{ t: "button", text: "Source", ...as(DOCS_SITE_BAR, "Source") },
				{ t: "icon", icon: "settings", ...as(DOCS_SITE_BAR, "Settings") },
			],
		},
	],
};

/** The published documentation's header on a phone: the touch header, in two rows. */
export const DOCS_SITE_BAR_PHONE: ToolbarSpec = {
	id: "docs-site-bar-phone",
	device: "phone",
	title: "The published documentation's header, on a phone",
	summary: "The tablet's header in two rows: the mark, Contents and search, then the rest.",
	chrome: "head",
	groups: [
		{
			items: [
				{
					t: "mark", text: "Docs", tint: "preview",
					...as(DOCS_SITE_BAR, "The mark, and Docs", "The version steps aside on a phone."),
				},
				{ t: "button", text: "Contents", ...as(DOCS_SITE_BAR_TOUCH, "Contents") },
				{ t: "icon", icon: "search", ...as(DOCS_SITE_BAR_TOUCH, "Search") },
			],
		},
		{
			row: true,
			items: [
				{ t: "button", text: "Try it in your browser", ...as(DOCS_SITE_BAR, "Try it in your browser", SAME_TAB, "second row") },
				{ t: "button", text: "Source", ...as(DOCS_SITE_BAR, "Source", undefined, "second row") },
				{ t: "icon", icon: "settings", ...as(DOCS_SITE_BAR, "Settings", undefined, "second row, at the end") },
			],
		},
	],
};

// ---------------------------------------------------------------------------
// Drawn for walkthroughs
//
// Pictures a walkthrough points into rather than bars the Toolbars page
// documents: the projects panel's footer and its Project menu, and the start
// page the daemon shows with no project open. Named, so a step can point at a
// control, and described, so what a step points at always says what it is.
// ---------------------------------------------------------------------------

/** The foot of the projects panel, which the Roswaal mark opens. */
export const PROJECTS_FOOT: ToolbarSpec = {
	id: "projects-foot",
	title: "The projects panel's footer",
	summary: "Along the bottom of the projects panel, which the Roswaal mark opens.",
	chrome: "head",
	groups: [
		{
			items: [
				{ t: "button", text: "Home", icon: "chevron", name: "Home", what: "Closes the project, for the start page." },
				{ t: "button", text: "Project", name: "Project", what: "Opening, downloading and starting again." },
			],
		},
		{
			apart: true,
			items: [
				{ t: "button", text: "Node Design", icon: "palette" },
				{ t: "button", text: "Docs", icon: "document" },
			],
		},
	],
};

/** The Project menu in the web app, open. */
export const PROJECT_MENU: ToolbarSpec = {
	id: "project-menu",
	title: "The Project menu",
	summary: "What the Project button holds in the web app.",
	chrome: "popmenu",
	groups: [
		{
			items: [
				{ t: "button", text: "Open folder…", icon: "folder", name: "Open folder…", what: "A folder on your computer, in Chrome and Edge." },
				{ t: "button", text: "Open .zip…", icon: "folderOpen", name: "Open .zip…", what: "A project from a zip, in any browser." },
				{ t: "button", text: "Download", icon: "copy", name: "Download", what: "The project, as a zip." },
				{ t: "button", text: "Start again", icon: "refresh", name: "Start again", what: "Back to the demo." },
			],
		},
	],
};

/** The daemon's start page: a path, Browse, and Open. */
export const START_PAGE: ToolbarSpec = {
	id: "start-page",
	title: "The start page",
	summary: "What the installed editor shows with no project open.",
	chrome: "head",
	groups: [
		{
			items: [
				{ t: "field", text: "C:\\path\\to\\project", name: "Path", what: "The folder to open." },
				{ t: "button", text: "Browse…", name: "Browse…", what: "Chooses the folder with your computer's own dialog." },
				{ t: "button", text: "Open", primary: true, name: "Open", what: "Opens it, or Initialise for a folder that is not a project yet." },
			],
		},
	],
};

/** Every picture a walkthrough draws, for the tests that hold them to the icon set. */
export const WALK_BARS: ToolbarSpec[] = [PROJECTS_FOOT, PROJECT_MENU, START_PAGE];

/**
 * The row of edits under the graph on a phone or a tablet.
 *
 * Written from `src/app/TouchBar.tsx`, in its order. Each is the keystroke
 * named beside it, sent to the graph's own handler.
 */
export const ACTION_ROW: ToolbarSpec = {
	id: "action-row",
	title: "The action row",
	summary: "Under the graph on a phone or a tablet, and under Node Design's logic graph. Icons or words with **Settings → Editor → Action buttons**; separate buttons or one bar with **Action row**.",
	chrome: "float",
	groups: [
		{
			items: [
				{ t: "icon", icon: "undo", name: "Undo", what: "As `Ctrl` + `Z`. Greyed when there is nothing to undo." },
				{ t: "icon", icon: "redo", name: "Redo", what: "As `Ctrl` + `Y`." },
				{ t: "icon", icon: "straighten", name: "Align", what: "Lines the selection up on the node picked first, as `A` does.", where: "Two or more selected" },
				{ t: "icon", icon: "copy", name: "Copy", what: "As `Ctrl` + `C`.", where: "Something selected" },
				{ t: "icon", icon: "cut", name: "Cut", what: "As `Ctrl` + `X`.", where: "Something selected" },
				{ t: "icon", icon: "duplicate", name: "Duplicate", what: "As `Ctrl` + `D`.", where: "Something selected" },
				{ t: "icon", icon: "remove", name: "Delete", what: "As `Delete`.", where: "Something selected" },
				{ t: "icon", icon: "paste", name: "Paste", what: "As `Ctrl` + `V`, where the graph was last touched.", where: "Something copied" },
			],
		},
	],
};

/**
 * Node Design's bar over a node, on a phone or a tablet.
 *
 * Written from `src/app/designer/PackView.tsx` and the switches `NodeEditor`
 * puts in it.
 */
export const DESIGNER_TOUCH_BAR: ToolbarSpec = {
	id: "designer-touch-bar",
	title: "Node Design's bar, on a phone or a tablet",
	summary: "Above the node on a phone or a tablet: the pack, the node, and which view of it is showing.",
	chrome: "bar",
	groups: [
		{
			items: [
				{ t: "button", text: "combat", icon: "chevron", name: "The pack", what: "Slides the pack's node list out over the editor. Pick a node and it goes away again." },
				{ t: "name", text: "Apply Knockback" },
			],
		},
		{
			apart: true,
			items: [
				{ t: "segmented", options: ["Preview", "Logic"], on: 1, name: "Preview and Logic", what: "The node as a graph draws it, or what it does when it runs." },
				{ t: "segmented", options: ["Luau", "Nodes"], on: 1, name: "Luau and Nodes", what: "Write the logic as Luau, or build it from nodes.", where: "With Logic showing" },
			],
		},
	],
};

/** Every bar the documentation draws, in the order the page walks them. */
export const TOOLBARS: ToolbarSpec[] = [
	EDITOR_BAR, EDITOR_BAR_BROWSER, EDITOR_BAR_TABLET, EDITOR_BAR_PHONE,
	GRAPH_BAR, GRAPH_BAR_TABLET, GRAPH_BAR_PHONE, MAP_BAR,
	DESIGNER_BAR, DESIGNER_BAR_BROWSER, DESIGNER_BAR_TABLET, DESIGNER_BAR_PHONE,
	DOCS_BAR, DOCS_SITE_BAR, DOCS_SITE_BAR_TOUCH, DOCS_SITE_BAR_PHONE,
	ACTION_ROW, DESIGNER_TOUCH_BAR,
];

/**
 * The bars the browser build draws, which all carry the preview mark.
 *
 * Named as a set so `tests/previewbuild.test.ts` can hold the rule against the
 * drawings as well as against the code: a bar added here without the chip is a
 * page telling somebody they are in the tool when they are in the preview.
 */
export const BROWSER_TOOLBARS: ToolbarSpec[] = [
	EDITOR_BAR_BROWSER, EDITOR_BAR_TABLET, EDITOR_BAR_PHONE,
	DESIGNER_BAR_BROWSER, DESIGNER_BAR_TABLET, DESIGNER_BAR_PHONE,
	DOCS_SITE_BAR, DOCS_SITE_BAR_TOUCH, DOCS_SITE_BAR_PHONE,
];

/**
 * The Variables panel as a particular graph would show it.
 *
 * The same widget the Variables and Modules pages draw, given a real graph's
 * declarations instead of example rows. It answers the question a demo raises
 * and its picture cannot: `fs.readFile` is drawn on the canvas, and where `fs`
 * came from is in a panel that is not in the picture.
 *
 * Only the sections the graph actually has. A Modules heading over nothing
 * would be teaching that a Lune graph has an empty one, and these all declare
 * something — that is most of the point of them.
 */
export function declarationsPanel(script: NodeScript): ToolbarSpec | undefined {
	const items: ToolbarItem[] = [];

	const modules = script.modules ?? [];
	if (modules.length > 0) {
		// `action` is the editor's own Add button on that heading: Modules
		// declares something, so it has one. Drawn rather than explained.
		items.push({ t: "heading", text: "Modules", level: 3, action: "Add" });
		for (const module of modules) {
			// `outline` is the ring a module gets. A variable's swatch is its
			// type's colour, and a module has no type.
			items.push({ t: "row", label: module.name, trailing: module.specifier, swatch: "outline" });
		}
	}

	for (const variable of script.variables) {
		if (items.length === 0 || items[items.length - 1].t === "row") {
			items.push({ t: "heading", text: "Variables", level: 3, action: "Add" });
		}
		items.push({ t: "row", label: variable.name, trailing: variable.type, swatch: variable.type });
	}

	if (items.length === 0) return undefined;
	return {
		id: `declares-${script.id}`,
		title: "Variables",
		summary: "What this graph declares.",
		chrome: "panel",
		groups: [{ items }],
	};
}

/**
 * The Inspector for a Declare Type, one per way of writing the type.
 *
 * The two live side by side on *Members and fields*, because the difference
 * between them is a panel away from the graph: the nodes look identical on the
 * canvas — a red box with a name under the title — and what makes one of them
 * offer members is a dropdown and what is under it. A picture of the panel says
 * that in one glance; a paragraph about the panel does not.
 */
export const TYPE_FIELDS_INSPECTOR: ToolbarSpec = {
	id: "type-fields-inspector",
	title: "A type entered as fields",
	summary: "The Inspector for a Declare Type whose shape is Table of Fields.",
	chrome: "panel",
	groups: [
		{ items: [{ t: "label", text: "Type name" }, { t: "field", text: "Input" }] },
		{ items: [{ t: "label", text: "Shape" }, { t: "select", text: "Table of Fields" }] },
		{ items: [{ t: "heading", text: "Fields", action: "Add" }] },
		{ items: [{ t: "field", text: "throttle" }, { t: "field", text: "number" }] },
		{ items: [{ t: "field", text: "steer" }, { t: "field", text: "number" }] },
		{ items: [{ t: "field", text: "aim" }, { t: "field", text: "Vector3" }] },
		{ items: [{ t: "label", text: "Layout" }, { t: "select", text: "One per line" }] },
	],
};

/** The same panel, for a type typed out instead. */
export const TYPE_WRITTEN_INSPECTOR: ToolbarSpec = {
	id: "type-written-inspector",
	title: "A type written as Luau",
	summary: "The Inspector for a Declare Type whose shape is Custom Luau.",
	chrome: "panel",
	groups: [
		{ items: [{ t: "label", text: "Type name" }, { t: "field", text: "Shot" }] },
		{ items: [{ t: "label", text: "Shape" }, { t: "select", text: "Custom Luau" }] },
		{ items: [{ t: "label", text: "Definition" }] },
		{ items: [{ t: "field", text: "{ damage: number, from: Vector3 }" }] },
	],
};

/** And for a type that has no fields to offer at all. */
export const TYPE_OPEN_INSPECTOR: ToolbarSpec = {
	id: "type-open-inspector",
	title: "A type with no fixed fields",
	summary: "The Inspector for a Declare Type holding a dictionary type.",
	chrome: "panel",
	groups: [
		{ items: [{ t: "label", text: "Type name" }, { t: "field", text: "Scores" }] },
		{ items: [{ t: "label", text: "Shape" }, { t: "select", text: "Custom Luau" }] },
		{ items: [{ t: "label", text: "Definition" }] },
		{ items: [{ t: "field", text: "{ [string]: number }" }] },
	],
};
