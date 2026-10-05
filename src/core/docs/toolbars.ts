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
 * this file — which a test can see, and a stale PNG cannot:
 * `tests/toolbardrift.test.ts` reads the editor's top row, the open graph's
 * clusters, the phone's More menu, the side strip, Node Design's top row and
 * the docs window's header against the components that draw them.
 *
 * It is inert: `aria-hidden`, no tab stops, and no pointer events. Everything
 * it says is said again in the legend, which is the part a screen reader gets.
 */

import { classGlyph, describeInstance, groupProperties } from "../rbx/browse.js";
import type { Prop, RbxInstance } from "../rbx/dom.js";
import type { NodeScript } from "../schema.js";
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
	/**
	 * Glyphs drawn as a line rather than filled, by stroke width, and glyphs
	 * whose holes are cut by the even-odd rule: `STROKED` and `EVEN_ODD` in
	 * `src/app/icons.tsx`. A tree draws `instance` and `luauScript`, and
	 * filled by default the one is a blob and the other has no holes.
	 */
	strokes?: Partial<Record<string, number>>;
	evenOdd?: ReadonlySet<string>;
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
	/**
	 * The Roswaal mark, optionally with a word and the version beside it.
	 *
	 * `preview` is the chip the hosted build carries and the daemon does
	 * not — the one visible difference between the two editors, and the
	 * thing a reader on the website is looking at while they read this.
	 */
	(
		| {
				t: "mark";
				text?: string;
				version?: boolean;
				preview?: boolean;
				/**
				 * The mark in a build's colour rather than beside a chip: the editor's
				 * top bar wears it this way. See `MarkedLogo`.
				 */
				tint?: "preview" | "canary";
				/**
				 * Drawn as `WindowMark` draws it, at the top left of the editor, Node
				 * Design and the docs window: `text` is the window's name.
				 */
				window?: boolean;
				/**
				 * The window's glyph in grey beside the mark, which is how a phone
				 * names the window: `graph`, `palette` or `document`.
				 */
				glyph?: string;
		  }
		/** An icon on its own: the shape of most of the chrome. */
		| { t: "icon"; icon: string; on?: boolean; primary?: boolean }
		/** A button with words, and an icon before them when it has one. */
		| {
				t: "button";
				text: string;
				icon?: string;
				primary?: boolean;
				on?: boolean;
				danger?: boolean;
				/**
				 * Its words fold away where the drawing is short of room, as the
				 * real button's do: `tb-collapsible`, with `narrowIcon` drawn only
				 * then, for a button whose glyph is not always shown.
				 */
				collapsible?: boolean;
				narrowIcon?: string;
		  }
		/** A pair or trio of buttons where one is lit: a setting, not an action. */
		| { t: "segmented"; options: string[]; on: number }
		/** A dropdown, shown holding whatever it is set to. */
		| { t: "select"; text: string }
		/** A text box, shown with its placeholder: the start page's path. */
		| { t: "field"; text: string; fill?: boolean }
		/** A caption naming what the control beside it sets. */
		| { t: "label"; text: string }
		/** The open document's name, and what kind of document it is. */
		| { t: "name"; text: string; kind?: string; dirty?: boolean }
		/** One open document's tab, in `GraphTabs`' own markup. `on` is the open one. */
		| {
				t: "tab";
				text: string;
				on?: boolean;
				dirty?: boolean;
				/** What it is, for its icon: a graph unless it says otherwise. */
				kind?: "nodescript" | "function" | "nodemap" | "luau";
				/** A phone draws the open tab without its close button. */
				closable?: boolean;
		  }
		/** A word in a badge: Node Design's Pure, Impure or Cannot run. */
		| { t: "badge"; text: string; warn?: boolean }
		/** A slider, shown at its middle: the side strip's zoom. */
		| { t: "slider" }
		/**
		 * One of Node Design's pin types, as its palette draws it: a ring in the
		 * type's colour and the type's name. No `type` is Execution.
		 */
		| { t: "pinChip"; text: string; type?: string }
		/**
		 * A button that opens a menu, as `Popout` draws one: its word or glyph,
		 * then the chevron. More, and on a phone a node's kind, Pins and Types.
		 */
		| { t: "popout"; text?: string; icon?: string }
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
				 * A level-2 heading is a card's header, as `Cards.tsx` draws it:
				 * the word beside its title, and the controls its panel put there.
				 */
				sub?: string;
				tools?: ToolbarItem[];
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
		/**
		 * A labelled control, as the Inspector stacks them: the label above the
		 * box, both the width of the panel.
		 *
		 * The Inspector's own `label.field` markup, so the picture inherits the
		 * editor's grid rather than a second opinion about it -- the same trick
		 * the Variables panel plays with `.variable`.
		 */
		| {
				t: "setting";
				label: string;
				value: string;
				/** `code`: Luau shown as code, which the editor opens in the code editor. */
				control?: "field" | "select" | "check" | "code";
				/** For a checkbox: whether it is ticked. */
				on?: boolean;
		  }
		/**
		 * One row of a list editor: two boxes and the button that removes it.
		 *
		 * A type's fields are pairs -- a name and a type -- and drawing them as
		 * two stacked boxes said they were two settings.
		 */
		| { t: "pair"; left: string; right: string }
		/**
		 * The heading over a list editor -- FIELDS, PARAMETERS -- which is not
		 * the panel heading `heading` draws: it is small, and its button sits
		 * at the end of the same line.
		 */
		| { t: "listTitle"; text: string; action?: string }
		/**
		 * The project tree's heading over one of its lists: Graph Content,
		 * Compile Content.
		 */
		| { t: "treeSection"; text: string; shut?: boolean }
		/**
		 * One row of a tree, the project's or the DataModel's, in the editor's
		 * own `.tree-row` markup. `twist` draws the chevron, open or shut;
		 * `tone` is the class that colours the glyph. `place` is a DataModel
		 * row: its chevron sits in a fixed slot and the class is at its right.
		 */
		| {
				t: "treeRow";
				label: string;
				depth: number;
				icon: string;
				tone?: string;
				twist?: "open" | "shut";
				place?: boolean;
				className?: string;
				badge?: string;
				selected?: boolean;
				current?: boolean;
				readonly?: boolean;
		  }
		/** The instance at the top of the Properties panel: glyph, name, class. */
		| { t: "propHead"; label: string; className: string; icon: string; tone?: string }
		/** Its path, under it. */
		| { t: "propPath"; text: string }
		/** The class's line from the engine documentation, under the path. */
		| { t: "propSummary"; text: string }
		/** The Export panel's foot: what the zip holds. */
		| { t: "footNote"; text: string }
		/** One of Studio's headings, starting a group of properties. */
		| { t: "propGroup"; text: string; count?: number }
		/** One property: its name, and its value as the panel formats it. */
		| { t: "prop"; label: string; value: string; color?: string }
		/** The Tags heading's chips. */
		| { t: "tags"; tags: string[] }
		/** A dialog's title. */
		| { t: "dialogTitle"; text: string }
		/** A dialog's message. */
		| { t: "message"; text: string }
		/** A dialog's list: the files that still require a package. */
		| { t: "list"; items: string[] }
		/** The Export panel's section heading: File, Place file. */
		| { t: "formSection"; text: string }
		/**
		 * One row of the Export panel: its label, a control, and the note under
		 * the control.
		 */
		| {
				t: "formRow";
				label: string;
				control: "select" | "field" | "segmented";
				value: string;
				options?: string[];
				on?: number;
				suffix?: string;
				note?: string;
		  }
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
	/** Starts a second row of the bar, as the published header wraps into one on a phone. */
	row?: boolean;
	/** A dialog's buttons, in its own row at the foot. */
	actions?: boolean;
	/**
	 * In a dialog: a class to wrap the group in, as the Export panel's form is.
	 * On a floating bar: a class beside the cluster's own, as `graph-tabs` is.
	 */
	wrap?: string;
	items: ToolbarItem[];
}

/**
 * How a bar is drawn, which is not a detail: the three shapes are three
 * different promises about where to look.
 *
 * `bar` runs the full width above a view and is always there. `head` is the
 * docs window's own header. `float` sits over a canvas in clusters with the
 * view showing between them, so its groups are separate objects rather than
 * regions of one strip — the editor's and Node Design's top rows are drawn
 * this way.
 */
/**
 * `popmenu` rather than `menu`: the frame carries the chrome as a class, and
 * the editor's context menus are `.menu`, fixed to the screen.
 */
export type ToolbarChrome =
	| "bar"
	| "head"
	| "float"
	| "panel"
	| "popmenu"
	| "inspector"
	| "filetree"
	| "place"
	| "properties"
	| "modal";

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
	/** A class beside the chrome's own: `export-menu`, on the Export panel's dialog. */
	className?: string;
	groups: ToolbarGroup[];
}

/** Every control on a bar, in the order it is drawn. */
export function controlsOf(spec: ToolbarSpec): ToolbarItem[] {
	return spec.groups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.t === "heading" && item.tools ? [item, ...item.tools] : [item],
		),
	);
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
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
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
		(item.t === "icon" || item.t === "button") && item.icon
			? [item.icon]
			: item.t === "treeRow" || item.t === "propHead"
				? [item.icon]
				: item.t === "mark" && item.glyph
					? [item.glyph]
					: item.t === "popout"
						? [...(item.icon ? [item.icon] : []), "chevron"]
						: item.t === "heading" && item.level === 2
							? ["chevron", "more"]
							: [],
	);
}

// ---------------------------------------------------------------------------
// Drawing one
// ---------------------------------------------------------------------------

function iconSvg(
	name: string,
	size: number,
	art: ToolbarArt,
	cls?: string,
	rotate?: number,
): string {
	const path = art.paths[name];
	if (path === undefined) return "";
	const stroke = art.strokes?.[name];
	const paint = stroke
		? `fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`
		: `fill="currentColor"${art.evenOdd?.has(name) ? ` fill-rule="evenodd"` : ""}`;
	return (
		`<svg class="icon${cls ? ` ${escapeXml(cls)}` : ""}" viewBox="${escapeXml(art.viewBox)}" width="${size}" height="${size}"` +
		`${rotate ? ` style="transform:rotate(${rotate}deg)"` : ""}` +
		` aria-hidden="true"><path d="${escapeXml(path)}" ${paint}/></svg>`
	);
}

/** A tab's kind icon, as `GraphTabs`' `TabIcon` draws it. */
const TAB_ICONS = {
	nodescript: "document",
	function: "function",
	nodemap: "map",
	luau: "luauScript",
} as const;

function tabIcon(kind: keyof typeof TAB_ICONS, art: ToolbarArt): string {
	const luau = kind === "luau" ? " tree-script-module" : "";
	return iconSvg(TAB_ICONS[kind], 13, art, `tab-kind tab-kind-${kind}${luau}`);
}

/**
 * A section heading as `SectionHead` draws it: the name in the accent colour
 * with a line running on, a fold when it has one, and buttons at the end.
 */
export function paneHeadHtml(
	title: string,
	art: ToolbarArt,
	tie = "",
	open = true,
	tools = "",
	count?: number,
): string {
	return (
		`<div class="pane-head"${tie}><span class="pane-toggle" aria-expanded="${open}">` +
		iconSvg("chevron", 14, art, "pane-fold") +
		`<span class="pane-title">${escapeXml(title)}</span>` +
		`${count === undefined ? "" : `<span class="pane-count">${count}</span>`}</span><span class="pane-line"></span>` +
		`${tools ? `<span class="pane-tools">${tools}</span>` : ""}</div>`
	);
}

/** What a panel shows, as `Ident` draws it. */
export function identHtml(
	name: string,
	kind: string,
	color: string,
	icon: string,
	art: ToolbarArt,
): string {
	return (
		`<div class="ident"><span class="ident-badge" style="background:${escapeXml(color)}">` +
		iconSvg(icon, 17, art) +
		`</span><span class="ident-text"><span class="ident-name">${escapeXml(name)}</span>` +
		`<span class="ident-kind">${escapeXml(kind)}</span></span></div>`
	);
}

/** A property's value as `PropValue` in PlaceBrowser.tsx shows it. */
function propValueHtml(value: string): string {
	if (value === "true" || value === "false") {
		const on = value === "true";
		return `<span class="place-bool${on ? " on" : ""}"><i aria-hidden="true">${on ? "\u2713" : ""}</i>${value}</span>`;
	}
	const item = /^(.+) \((-?\d+)\)$/.exec(value);
	if (item) return `${escapeXml(item[1])} <span class="place-enum-value">${item[2]}</span>`;
	return escapeXml(value);
}

/** A tree tone's colour, as `badgeColor` in PlaceBrowser.tsx picks it. */
function toneColor(tone: string | undefined): string {
	const script = /tree-script-(\w+)/.exec(tone ?? "");
	if (script) return `var(--tree-script-${script[1]})`;
	if (tone === "tree-folder-special" || tone === "tree-folder-plain") return `var(--${tone})`;
	return "var(--fg-faint)";
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
			if (item.window) {
				// `WindowMark`'s own markup. The glyph is hidden by the editor's
				// stylesheet above a phone's width, and only a phone's picture
				// draws one, so it is shown here outright.
				return (
					`<span class="logo window-mark"${tie}>` +
					`${item.tint ? `<span class="logo-mark mark-${item.tint}">${art.mark}</span>` : art.mark}` +
					`${item.glyph ? `<span class="window-glyph" style="display:inline-flex">${iconSvg(item.glyph, 16, art)}</span>` : ""}` +
					`${item.text ? `<span class="window-name">${escapeXml(item.text)}</span>` : ""}` +
					`${item.version ? `<span class="version">${escapeXml(art.version)}</span>` : ""}</span>`
				);
			}
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
				`<button type="button" tabindex="-1"${tie} class="tb${item.icon || item.narrowIcon ? " with-icon" : ""}` +
				`${item.collapsible ? " tb-collapsible" : ""}` +
				`${item.primary ? " primary" : ""}${item.danger ? " danger" : ""}${item.on ? " on" : ""}">` +
				`${item.icon ? iconSvg(item.icon, 15, art) : ""}` +
				`${item.narrowIcon ? iconSvg(item.narrowIcon, 15, art, "tb-icon-when-narrow") : ""}` +
				`${item.collapsible ? `<span class="tb-label">${escapeXml(item.text)}</span>` : escapeXml(item.text)}</button>`
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
			return `<span class="tb docs-bar-field${item.fill ? " place-filter" : ""}"${tie}>${escapeXml(item.text)}</span>`;
		case "label":
			return `<span class="group-label">${escapeXml(item.text)}</span>`;
		case "name":
			return (
				`<span class="doc-name${item.dirty ? " dirty" : ""}"${tie}>${escapeXml(item.text)}</span>` +
				`${item.kind ? `<span class="doc-kind">${escapeXml(item.kind)}</span>` : ""}`
			);
		case "tab":
			// `GraphTabs`' markup: the kind's icon, the name, and the close button
			// the open tab always shows and the others show on hover.
			return (
				`<span class="graph-tab${item.on ? " on" : ""}${item.dirty ? " dirty" : ""}"${tie}>` +
				tabIcon(item.kind ?? "nodescript", art) +
				`<span class="name">${escapeXml(item.text)}</span>${item.dirty ? `<span class="tab-dirty" aria-hidden="true"></span>` : ""}${item.closable === false ? "" : `<span class="close">×</span>`}</span>`
			);
		case "badge":
			return `<span class="badge${item.warn ? " warn" : ""}"${tie}>${escapeXml(item.text)}</span>`;
		case "slider":
			// Inert as the rest are, but the handle is on the wrapper: a range input
			// that took the pointer would be dragged rather than lit.
			return (
				`<span class="docs-bar-slider"${tie}>` +
				`<input type="range" tabindex="-1" min="10" max="300" value="100" style="pointer-events:none;width:110px"></span>`
			);
		case "popout":
			return (
				`<button type="button" tabindex="-1"${tie} class="tb with-icon">` +
				`${item.icon ? iconSvg(item.icon, 16, art) : ""}${item.text ? escapeXml(item.text) : ""}` +
				`${iconSvg("chevron", 14, art)}</button>`
			);
		case "pinChip": {
			const kind = item.type === undefined ? "exec" : "data";
			const colour = art.pinColor?.(item.type, kind);
			return (
				`<span class="pin-chip"${tie}><span class="chip-dot ${kind}"` +
				`${colour ? ` style="color:${escapeXml(colour)}"` : ""}></span>${escapeXml(item.text)}</span>`
			);
		}
		case "divider":
			return `<span class="divider"></span>`;

		case "heading":
			// `h3.variables-sub` is the editor's own subheading, and the Add
			// button beside it is the editor's own `.tb`. A level-2 heading is
			// the card's header the panel sits under.
			return item.level === 3 || item.level === undefined
				? `<h3 class="variables-sub"${tie}><span>${escapeXml(item.text)}</span>` +
						`${item.action ? `<button type="button" tabindex="-1" class="tb">${escapeXml(item.action)}</button>` : ""}</h3>`
				: cardHeadHtml(
						{
							title: item.text,
							sub: item.sub,
							tools:
								itemsHtml(item.tools ?? [], art) +
								(item.action
									? `<button type="button" tabindex="-1" class="tb">${escapeXml(item.action)}</button>`
									: ""),
							tie,
						},
						art,
					);

		case "row": {
			const colour =
				item.swatch && item.swatch !== "outline" ? art.pinColor?.(item.swatch, "data") : undefined;
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

		case "setting": {
			if (item.control === "check") {
				return (
					`<label class="check-row"${tie}><input type="checkbox" tabindex="-1"` +
					`${item.on ? " checked" : ""} disabled><span>${escapeXml(item.label)}</span></label>`
				);
			}
			const box =
				item.control === "select"
					? `<span class="tb docs-bar-select">${escapeXml(item.value)}</span>`
					: item.control === "code"
						? `<span class="tb docs-bar-field docs-bar-code">${escapeXml(item.value)}</span>`
						: `<span class="tb docs-bar-field">${escapeXml(item.value)}</span>`;
			return `<label class="field"${tie}><span class="field-label">${escapeXml(item.label)}</span>${box}</label>`;
		}

		case "listTitle":
			// `SectionHead`'s markup, from PanelParts.tsx.
			return paneHeadHtml(
				item.text,
				art,
				tie,
				true,
				item.action
					? `<button type="button" tabindex="-1" class="tb pane-add">${iconSvg("plus", 13, art)}${escapeXml(item.action)}</button>`
					: "",
			);

		case "pair": {
			// A list row: its wire colour, its name, its type, and remove.
			const colour = art.pinColor?.(item.right, "data") ?? "var(--fg-faint)";
			return (
				`<div class="list-row"${tie}>` +
				`<span class="pin-dot" style="--pin:${escapeXml(colour)}"></span>` +
				`<span class="tb docs-bar-field">${escapeXml(item.left)}</span>` +
				`<span class="tb type-picker"><span class="type-dot" style="background:${escapeXml(colour)}"></span>` +
				`<span class="preview">${escapeXml(item.right)}</span>${iconSvg("chevron", 12, art)}</span>` +
				`<button type="button" tabindex="-1" class="tb list-remove">${iconSvg("close", 13, art)}</button></div>`
			);
		}

		case "treeSection":
			return (
				`<div class="tree-section${item.shut ? " shut" : ""}">` +
				paneHeadHtml(item.text, art, tie, !item.shut, "") +
				`</div>`
			);

		case "treeRow": {
			// The editor's own markup: `ProjectTree.tsx` and `PlaceBrowser.tsx`.
			const chevron = item.twist
				? iconSvg("chevron", 14, art, "twist", item.twist === "open" ? 0 : -90)
				: "";
			const twist = item.place ? `<span class="place-twist">${chevron}</span>` : chevron;
			const classes = [
				"tree-row",
				item.place ? "place-row" : "",
				item.selected ? "selected" : "",
				item.current ? "open-doc" : "",
				item.readonly ? "readonly" : "",
			]
				.filter(Boolean)
				.join(" ");
			return (
				`<div class="${classes}"${tie} style="padding-left:${6 + item.depth * 13}px;--depth:${item.depth}">` +
				twist +
				iconSvg(item.icon, 15, art, `kind${item.tone ? ` ${item.tone}` : ""}`) +
				`<span class="label">${escapeXml(item.label)}</span>` +
				`${item.badge ? `<span class="badge">${escapeXml(item.badge)}</span>` : ""}` +
				`${item.className ? `<span class="place-class">${escapeXml(item.className)}</span>` : ""}` +
				`</div>`
			);
		}

		case "propHead":
			// `Ident`'s markup, from PanelParts.tsx, in the badge colour the
			// project tree draws the class's glyph in.
			return (
				`<div class="place-props-head"${tie}>` +
				identHtml(item.label, item.className, toneColor(item.tone), item.icon, art) +
				`</div>`
			);
		case "propPath":
			return `<div class="place-path"${tie}>${escapeXml(item.text)}</div>`;
		case "propSummary":
			return `<p class="place-summary"${tie}>${escapeXml(item.text)}</p>`;
		case "footNote":
			return `<span class="export-menu-note export-menu-contents"${tie}>${escapeXml(item.text)}</span>`;
		case "propGroup":
			return paneHeadHtml(item.text, art, tie, true, "", item.count);
		case "prop":
			return (
				`<div class="place-prop"${tie}><span class="place-prop-name">${escapeXml(item.label)}</span>` +
				`<span class="place-prop-value">` +
				`${item.color ? `<span class="place-swatch" style="background:${escapeXml(item.color)}"></span>` : ""}` +
				`${propValueHtml(item.value)}</span></div>`
			);
		case "tags":
			return (
				`<div class="place-tags"${tie}>` +
				item.tags.map((tag) => `<span class="place-tag">${escapeXml(tag)}</span>`).join("") +
				`</div>`
			);

		case "dialogTitle":
			return `<h3${tie}>${escapeXml(item.text)}</h3>`;
		case "message":
			return `<p${tie}>${escapeXml(item.text)}</p>`;
		case "list":
			return (
				`<ul class="dialog-list"${tie}>` +
				item.items
					.map((line) => `<li>${iconSvg("document", 13, art)}<span>${escapeXml(line)}</span></li>`)
					.join("") +
				`</ul>`
			);
		case "formSection":
			return `<div class="export-menu-section"${tie}>${escapeXml(item.text)}</div>`;
		case "formRow": {
			const control =
				item.control === "select"
					? `<span class="tb docs-bar-select">${escapeXml(item.value)}</span>`
					: item.control === "segmented"
						? `<span class="segmented">` +
							(item.options ?? [])
								.map(
									(option, i) =>
										`<button type="button" tabindex="-1"${i === item.on ? ` class="on"` : ""}>${escapeXml(option)}</button>`,
								)
								.join("") +
							`</span>`
						: `<span class="export-menu-name"><span class="tb docs-bar-field">${escapeXml(item.value)}</span>` +
							`${item.suffix ? `<span class="export-menu-suffix">${escapeXml(item.suffix)}</span>` : ""}</span>`;
			return (
				`<div class="export-menu-row"${tie}><span class="export-menu-label">${escapeXml(item.label)}</span>` +
				`<span class="export-menu-control">${control}` +
				`${item.note ? `<span class="export-menu-note">${escapeXml(item.note)}</span>` : ""}</span></div>`
			);
		}
	}
}

/**
 * Items as the editor draws them, for a picture that holds a bar among other
 * things: a window diagram's clusters and cards, in `layouts.ts`.
 */
export function itemsHtml(items: ToolbarItem[], art: ToolbarArt): string {
	return items.map((item) => itemHtml(item, art)).join("");
}

/**
 * A card's header as `Cards.tsx` draws it: the title, the word beside it and
 * the panel's controls, then fold and the menu. `tools` is markup.
 */
export function cardHeadHtml(
	head: { title: string; sub?: string; tools?: string; tie?: string },
	art: ToolbarArt,
): string {
	const button = (icon: string, size: number) =>
		`<button type="button" tabindex="-1" class="tb icon-only">${iconSvg(icon, size, art)}</button>`;
	return (
		`<header class="card-head"${head.tie ?? ""}><span class="card-title">${escapeXml(head.title)}</span>` +
		`<span class="card-slot">${head.sub ? `<span class="card-sub">${escapeXml(head.sub)}</span>` : ""}` +
		`${head.tools ? `<span class="card-tools">${head.tools}</span>` : ""}</span>` +
		`${button("chevron", 14)}${button("more", 15)}</header>`
	);
}

/** One glyph as the editor paints it, for markup drawn outside a bar. */
export function glyphHtml(name: string, size: number, art: ToolbarArt, rotate?: number): string {
	return iconSvg(name, size, art, undefined, rotate);
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
	inspector: "inspector inspector-body",
	// The project tree, the DataModel browser and the Properties panel, each in
	// the editor's own class, so its stylesheet draws the rows. `filetree` and
	// `modal` rather than `tree` and `dialog`: the frame carries the chrome as a
	// class, and `.tree` and `.dialog` are the editor's, which drew the frame as
	// a second dialog around the first.
	filetree: "docs-tree-shot",
	place: "place-browser docs-tree-shot",
	properties: "place-properties docs-tree-shot",
	modal: "dialog docs-dialog-shot",
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
	// A row stays one row, as the real one does: drawn at a tablet's or a
	// phone's width in a narrow column it would otherwise wrap where the
	// editor never does, and the picture scrolls instead. Only a bar with a
	// second row of its own (`row`) wraps, and only there.
	const oneRow =
		(spec.chrome === "float" || spec.chrome === "head" || spec.chrome === "bar") &&
		!spec.groups.some((group) => group.row);
	const frame = (inner: string) =>
		`<div class="docs-bar-frame ${escapeXml(spec.chrome)}${spec.device ? ` device-${spec.device}` : ""}" aria-hidden="true">` +
		`<div class="${CHROME_CLASS[spec.chrome]}${spec.className ? ` ${escapeXml(spec.className)}` : ""}"` +
		`${oneRow ? ` style="flex-wrap:nowrap"` : ""}>${inner}</div></div>`;
	const itemsOf = (group: ToolbarGroup) => group.items.map((item) => itemHtml(item, art)).join("");

	// The trees and panels nest the way the editor nests them, rather than
	// running their groups along a row.
	if (spec.chrome === "filetree")
		return frame(`<div class="tree">${spec.groups.map(itemsOf).join("")}</div>`);
	if (spec.chrome === "place") {
		const [head, ...rows] = spec.groups;
		return frame(
			`<div class="place-browser-head">${itemsOf(head)}</div>` +
				`<div class="tree place-tree">${rows.map(itemsOf).join("")}</div>`,
		);
	}
	if (spec.chrome === "properties") {
		// The heading, then the instance, then a group per Studio heading.
		const [head, ...rest] = spec.groups;
		const groups = rest.filter((g) => g.items[0]?.t === "propGroup");
		const before = rest.filter((g) => g.items[0]?.t !== "propGroup");
		return frame(
			itemsOf(head) +
				`<div class="place-props">${before.map(itemsOf).join("")}` +
				`<div class="place-groups">${groups.map((g) => `<div class="place-group">${itemsOf(g)}</div>`).join("")}</div></div>`,
		);
	}
	// One of Dialog.tsx's prompts, as it draws them: a header band with a
	// badge in the colour of the question, the body, and a foot naming the
	// keys. The Export panel, with a class of its own, is laid out on the
	// plain dialog and keeps it.
	if (spec.chrome === "modal" && !spec.className) {
		const danger = spec.groups.some((g) =>
			g.items.some((item) => item.t === "button" && item.danger === true),
		);
		const title = spec.groups
			.flatMap((g) => g.items)
			.find((item): item is ToolbarItem & { t: "dialogTitle" } => item.t === "dialogTitle");
		const bodyOf = (g: ToolbarGroup) =>
			g.items
				.filter((item) => item.t !== "dialogTitle")
				.map((item) => itemHtml(item, art))
				.join("");
		const head =
			`<header class="dialog-head"><span class="dialog-badge">` +
			`${iconSvg(danger ? "remove" : "document", 17, art)}</span>` +
			`<h3>${escapeXml(title?.text ?? spec.title)}</h3>` +
			`<span class="tb icon-only dialog-close">${iconSvg("close", 14, art)}</span></header>`;
		const body = `<div class="dialog-body">${spec.groups
			.filter((g) => !g.actions)
			.map(bodyOf)
			.join("")}</div>`;
		const foot = spec.groups
			.filter((g) => g.actions)
			.map(
				(g) =>
					`<div class="dialog-actions"><span class="dialog-keys"><kbd>Enter</kbd> to confirm \u00b7 ` +
					`<kbd>Esc</kbd> to cancel</span>${itemsOf(g)}</div>`,
			)
			.join("");
		return (
			`<div class="docs-bar-frame modal" aria-hidden="true">` +
			`<div class="${CHROME_CLASS.modal} dialog-panel dialog-${danger ? "danger" : "accent"}">` +
			`${head}${body}${foot}</div></div>`
		);
	}
	if (spec.chrome === "modal") {
		return frame(
			spec.groups
				.map((g) => {
					const wrap = [g.actions ? "dialog-actions" : "", g.wrap ?? ""].filter(Boolean).join(" ");
					return wrap ? `<div class="${escapeXml(wrap)}">${itemsOf(g)}</div>` : itemsOf(g);
				})
				.join(""),
		);
	}

	const inner = spec.groups
		.map((group) => {
			const gap =
				(group.row ? `<span class="docs-bar-break"></span>` : "") +
				(group.apart ? `<span class="${gapClass}"></span>` : "");
			const items = group.items.map((item) => itemHtml(item, art)).join("");
			// A floating bar's groups are separate panels over the canvas; a bar
			// and a page header are one strip, so their groups are only an
			// authoring convenience and flatten away.
			if (spec.chrome === "float") {
				// A cluster keeps its one line, as `.workspace-chrome .tool-group`
				// keeps it in the editor: a rule scoped to the editor's own chrome
				// does not reach a picture of it, and without it a long row
				// squeezed every cluster into two lines of half its buttons.
				const extra = group.wrap ? ` ${escapeXml(group.wrap)}` : "";
				return `${gap}<div class="tool-group${extra}" style="flex:none;flex-wrap:nowrap">${items}</div>`;
			}
			// A panel's groups are sections down a column rather than clusters
			// along a row, so there is no flexible gap to push them apart with.
			// Each heading starts a section that runs to the next one, so the
			// rows under a dimmed heading dim with it.
			if (spec.chrome === "panel") {
				return `<div class="variable-list">${panelSections(group.items, art)}</div>`;
			}
			// The Inspector stacks its settings; each group is one of them, and
			// the editor's own `.inspector-body` does the spacing.
			if (spec.chrome === "inspector") return items;
			return `${gap}${items}`;
		})
		.join("");

	return frame(inner);
}

// ---------------------------------------------------------------------------
// The bars
// ---------------------------------------------------------------------------

/**
 * The open graph's two clusters as the top row draws them: its tab, named
 * once for the pair, and its tools unnamed, because `GRAPH_BAR` explains each
 * of them and a legend that said it twice would be a longer legend, not a
 * clearer one.
 */
function openGraph(tab: Documented): ToolbarGroup[] {
	const tabs: ToolbarGroup = {
		wrap: "graph-tabs",
		items: [{ t: "tab", text: "Tank", on: true, ...tab }],
	};
	const tools: ToolbarGroup = {
		items: [
			{ t: "icon", icon: "search" },
			{ t: "icon", icon: "layout" },
			{ t: "icon", icon: "straighten", on: true },
			{ t: "icon", icon: "terminal" },
		],
	};
	return [tabs, tools];
}

/**
 * The editor's top row: everything that acts on the project, and the open
 * graph between.
 *
 * Written from `src/app/Toolbar.tsx`'s `ProjectBar` and `DocumentAction`, in
 * their order. The three at the right-hand end are the ones this page exists
 * for.
 */
export const EDITOR_BAR: ToolbarSpec = {
	id: "editor-bar",
	title: "The editor's top row",
	summary:
		"Floating along the top of the editor: the project and the open graph at the left, " +
		"compiling and the other windows at the right.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					version: true,
					name: "The Roswaal mark",
					where: "far left",
					what:
						"Opens the projects panel: your recent projects, the demos, and the other " +
						"windows. Beside it is the build you are on, which any bug report needs; in a " +
						"narrow window it is in the mark's tooltip.",
				},
			],
		},
		{
			items: [
				{
					t: "icon",
					icon: "panelLeft",
					name: "Project",
					where: "after the mark",
					what:
						"Shows or hides the cards on the left: Project and Variables. See " +
						"[The Project panel](project-panel).",
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
		...openGraph({
			name: "The open graph",
			what: "Its tab, then its tools, both drawn below. A node map shows its name here instead.",
		}),
		{
			apart: true,
			items: [
				{
					t: "segmented",
					options: ["Manual", "Dynamic"],
					on: 0,
					name: "Manual | Dynamic",
					what:
						"How generated Luau reaches disk. **Manual** writes when you ask; " +
						"**Dynamic** writes on every edit. Also in [Settings](settings).",
				},
				{ t: "divider" },
				{
					t: "button",
					text: "Compile project",
					narrowIcon: "build",
					collapsible: true,
					name: "Compile project",
					what: "Compiles every graph and node map in the project.",
				},
				{
					t: "button",
					text: "Compile script",
					icon: "build",
					collapsible: true,
					primary: true,
					name: "Compile script",
					what:
						"Compiles the open graph alone — `Ctrl` + `S`. With a node map open it is " +
						"**Write project file**.",
				},
			],
		},
		{
			items: [
				{
					t: "icon",
					icon: "panelRight",
					name: "Inspector",
					what:
						"Shows or hides the cards on the right: the selected node's settings, or the " +
						"graph's own with nothing selected.",
				},
				{ t: "divider" },
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
						"Opens [Node Design](creating-custom-nodes) in its own window, for making " +
						"nodes of your own.",
				},
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the last icon on the row",
					what:
						"The project's settings, this browser's preferences, and themes. " +
						"See [Settings](settings).",
				},
			],
		},
	],
};

/**
 * The open graph's clusters, from `GraphTabs` and `DocumentBar`'s graph arm.
 *
 * Two groups rather than one row, because they float over the canvas with
 * the graph showing between them. The graph's settings are not here: they
 * are the Inspector's while nothing is selected, `GRAPH_SETTINGS` below.
 */
export const GRAPH_BAR: ToolbarSpec = {
	id: "graph-bar",
	title: "The open graph",
	summary:
		"Two clusters on the editor's top row, after the Project button: the tabs, and the tools.",
	chrome: "float",
	groups: [
		{
			wrap: "graph-tabs",
			items: [
				{
					t: "tab",
					text: "Tank",
					on: true,
					name: "Tabs",
					what:
						"One per open graph, function, node map or Luau file, its icon saying which; " +
						"the open one is lit. Drag a tab to move it; middle-click closes it.",
				},
				{ t: "tab", text: "hide", kind: "function" },
				{ t: "tab", text: "Game", kind: "nodemap" },
				{
					t: "icon",
					icon: "chevron",
					name: "Open documents",
					where: "With two or more open",
					what: "Every open tab in a list, for when the tabs have outgrown the row.",
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
					t: "icon",
					icon: "straighten",
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
	],
};

/**
 * The graph's own settings, from `GraphSettings.tsx`: what it compiles to,
 * its typechecking mode and its target, in the Inspector while nothing is
 * selected.
 */
export const GRAPH_SETTINGS: ToolbarSpec = {
	id: "graph-settings",
	title: "The graph's settings",
	summary: "In the Inspector while nothing is selected.",
	chrome: "inspector",
	groups: [
		{
			items: [
				{
					t: "setting",
					label: "Script",
					value: "ModuleScript",
					control: "select",
					name: "Script",
					what:
						"What this graph compiles to: a Script, a LocalScript or a ModuleScript. " +
						"Absent on a Lune graph, where every file is `.luau`.",
				},
			],
		},
		{
			items: [
				{
					t: "setting",
					label: "Type checking",
					value: "Strict",
					control: "select",
					name: "Type checking",
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
					t: "setting",
					label: "Target",
					value: "Roblox",
					control: "select",
					name: "Target",
					what:
						"What this graph compiles for. Lune is marked with a warning triangle: it " +
						"is experimental, and a Roblox-only node is an error there.",
				},
			],
		},
	],
};

/**
 * The same row with a node map open, which is the open graph's slot holding
 * something else.
 *
 * Kept as its own spec rather than a note under the graph's: a map has no
 * graph tools at all, and a reader who opens one and finds them gone needs
 * to be told that is the shape rather than a failure.
 */
export const MAP_BAR: ToolbarSpec = {
	id: "map-bar",
	title: "With a node map open",
	summary:
		"The map's name where a graph's tools would be, and Write project file where Compile " +
		"script would be.",
	chrome: "float",
	groups: [
		{
			wrap: "graph-tabs",
			items: [
				{ t: "tab", text: "Occupancy" },
				{ t: "tab", text: "Tank", kind: "nodemap", on: true },
			],
		},
		{
			wrap: "doc-group",
			items: [
				{
					t: "name",
					text: "Tank",
					kind: "Node map",
					name: "The map",
					what: "Its name. A map is a tree rather than a graph, so it has no graph tools.",
				},
			],
		},
		{
			apart: true,
			items: [
				{ t: "segmented", options: ["Manual", "Dynamic"], on: 0 },
				{ t: "divider" },
				{ t: "button", text: "Compile project" },
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

/** The side strip, from `CanvasStrip.tsx`. */
export const CANVAS_STRIP: ToolbarSpec = {
	id: "canvas-strip",
	title: "The side strip",
	summary:
		"Over a graph: along the bottom with a mouse, down the left edge on a touch screen. " +
		"Not on a phone.",
	chrome: "float",
	groups: [
		{
			items: [
				{ t: "icon", icon: "plus", name: "Zoom in", what: "A step closer." },
				{
					t: "slider",
					name: "Zoom",
					what: "Drag to zoom. The percentage beside it goes back to 100%.",
				},
				{ t: "icon", icon: "minus", name: "Zoom out", what: "A step further away." },
				{ t: "button", text: "100%" },
				{ t: "divider" },
				{
					t: "icon",
					icon: "undo",
					name: "Undo",
					what: "As `Ctrl` + `Z`. On a touch screen, a two-finger tap does the same.",
				},
				{
					t: "icon",
					icon: "redo",
					name: "Redo",
					what: "As `Ctrl` + `Y`. On a touch screen, a three-finger tap does the same.",
				},
				{ t: "divider" },
				{ t: "icon", icon: "fit", name: "Fit", what: "The whole graph, in the window." },
			],
		},
	],
};

/**
 * Node Design's top row, from `DesignerPage.tsx`, with the open node's own
 * actions that `NodeEditor` draws into its slot.
 */
export const DESIGNER_BAR: ToolbarSpec = {
	id: "designer-bar",
	title: "Node Design's top row",
	summary:
		"Floating along the top of the Node Design window. The node's own actions are there " +
		"while a node is open.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					text: "Node Design",
					version: true,
					name: "Node Design",
					where: "far left",
					what:
						"Says which window this is, and which build. It opens your projects and the " +
						"other windows, as the editor's mark does.",
				},
			],
		},
		{
			apart: true,
			wrap: "logic-mode-group",
			items: [
				{ t: "label", text: "Logic" },
				{
					t: "segmented",
					options: ["Luau", "Nodes"],
					on: 0,
					name: "Luau or Nodes",
					where: "With a node open, on a computer or a tablet held sideways",
					what: "Write the logic as Luau, or build it from nodes.",
				},
			],
		},
		{
			items: [
				{
					t: "button",
					text: "Details",
					icon: "rename",
					name: "Details",
					where: "With a node open",
					what:
						"The node's id, title, category, what it runs on, and its summary, in a " +
						"card on the right.",
				},
				{ t: "divider" },
				{
					t: "badge",
					text: "Impure",
					name: "Kind",
					where: "With a node open",
					what:
						"**Pure**, **Impure** or **Cannot run**, from its execution pins. A pure node " +
						"picks **Normal** or **Pill** beside it. The bin deletes a saved node, and asks " +
						"first.",
				},
				{ t: "divider" },
				{ t: "icon", icon: "remove" },
				{
					t: "button",
					text: "Save",
					icon: "build",
					primary: true,
					name: "Save",
					where: "With a node open",
					what:
						"Into the pack — `Ctrl` + `S`. Off while there are problems; it reads " +
						"**Saved** once it is.",
				},
			],
		},
		{
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
					t: "icon",
					icon: "document",
					name: "Docs",
					where: "the page",
					what: "This documentation, in its own window. `Ctrl` + `K` searches it from here.",
				},
				{
					t: "icon",
					icon: "graph",
					name: "Open Editor",
					where: "the graph",
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

/** The documentation window's header, from `DocsPage.tsx`: floating clusters, as the editor's are. */
export const DOCS_BAR: ToolbarSpec = {
	id: "docs-bar",
	title: "The documentation's top row",
	summary: "Floating along the top of this window.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					text: "Docs",
					version: true,
					name: "Docs",
					where: "far left",
					what:
						"Says which window this is, and which build; it opens your projects and the " +
						"other windows. A warning sits beside it when the daemon is not reachable — " +
						"the built-in library is still documented, your project's own packs are not.",
				},
			],
		},
		{
			wrap: "search-group",
			items: [
				{
					t: "button",
					text: "Search the docs",
					icon: "search",
					name: "Search the docs",
					what:
						"Every page and every node — `Ctrl` + `K` opens the same search. In a narrow " +
						"window a **Contents** button follows it, for the contents as a drawer.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "icon",
					icon: "settings",
					name: "Settings",
					where: "the gear",
					what:
						"This browser's preferences and themes, including the ones that change " +
						"the pictures on these pages. No project settings here: those are the " +
						"repository's, and they are changed from the editor.",
				},
				{
					t: "icon",
					icon: "graph",
					name: "Open Editor",
					where: "the graph, at the end",
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
	title: "The editor's top row, in your browser",
	summary:
		"The same row in the browser preview. Same buttons, in the same order — three of them " +
		"reach something different.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					version: true,
					tint: "preview",
					name: "The Roswaal mark",
					where: "far left, in blue",
					what:
						"Opens the projects panel. Blue means the browser preview: **your project is kept in this browser**, not on " +
						"your disk — it survives a reload and it is gone if you clear the site's " +
						"data. The panel offers a folder on your own machine instead, where the " +
						"browser allows it.",
				},
			],
		},
		{
			items: [
				{ t: "icon", icon: "panelLeft", ...as(EDITOR_BAR, "Project") },
				{
					t: "icon",
					icon: "refresh",
					name: "Refresh",
					what: "Re-reads the project you have open, node packs included.",
				},
				{ t: "icon", icon: "newFile", ...as(EDITOR_BAR, "New graph") },
				{ t: "icon", icon: "map", ...as(EDITOR_BAR, "New node map") },
			],
		},
		...openGraph(as(EDITOR_BAR, "The open graph")),
		{
			apart: true,
			items: [
				{
					t: "segmented",
					options: ["Manual", "Dynamic"],
					on: 0,
					name: "Manual | Dynamic",
					what:
						"How generated Luau reaches the project. **Manual** writes when you ask; " +
						"**Dynamic** writes on every edit. Also in [Settings](settings).",
				},
				{ t: "divider" },
				{
					t: "button",
					text: "Compile project",
					narrowIcon: "build",
					collapsible: true,
					name: "Compile project",
					what:
						"Compiles every graph and node map. The generated `.luau` appears in the " +
						"tree beside each graph, to read or copy out.",
				},
				{
					t: "button",
					text: "Compile script",
					icon: "build",
					collapsible: true,
					primary: true,
					...as(EDITOR_BAR, "Compile script"),
				},
			],
		},
		{
			items: [
				{ t: "icon", icon: "panelRight", ...as(EDITOR_BAR, "Inspector") },
				{ t: "divider" },
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
				{ t: "icon", icon: "settings", ...as(EDITOR_BAR, "Settings") },
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
	summary:
		"Across the top of these pages on the project site, where there is no daemon behind them.",
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
	title: "Node Design's top row, in your browser",
	summary: "The same window in the browser preview, marked as one.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
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
			wrap: "logic-mode-group",
			items: [
				{ t: "label", text: "Logic" },
				{ t: "segmented", options: ["Luau", "Nodes"], on: 0, ...as(DESIGNER_BAR, "Luau or Nodes") },
			],
		},
		{
			items: [
				{ t: "button", text: "Details", icon: "rename", ...as(DESIGNER_BAR, "Details") },
				{ t: "divider" },
				{ t: "badge", text: "Impure", ...as(DESIGNER_BAR, "Kind") },
				{ t: "divider" },
				{ t: "icon", icon: "remove" },
				{ t: "button", text: "Save", icon: "build", primary: true, ...as(DESIGNER_BAR, "Save") },
			],
		},
		{
			items: [
				{
					t: "icon",
					icon: "help",
					name: "How custom nodes work",
					where: "the question mark",
					what: "Opens [Creating custom nodes](creating-custom-nodes).",
				},
				{
					t: "icon",
					icon: "document",
					name: "Docs",
					where: "the page",
					what:
						"The published documentation — the built-in library. `Ctrl` + `K` searches " +
						"it from here.",
				},
				{
					t: "icon",
					icon: "graph",
					name: "Open Editor",
					where: "the graph",
					what: "The editor, in a new tab.",
				},
				{ t: "icon", icon: "settings", ...as(DESIGNER_BAR, "Settings") },
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
	summary:
		"Everything this script declares: its variables, its modules, its locals and its functions.",
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
	spec: ToolbarSpec,
	pointers: Record<string, string>,
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
	variables:
		"Values the whole script reads and writes. See [Variables and locals](variables-and-locals).",
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
 *
 * `where` replaces the bar's own; an empty one drops it, for a control that
 * sits somewhere else on this screen -- a row of a menu has no "third from
 * the right".
 */
function as(from: ToolbarSpec, name: string, more?: string, where?: string): Documented {
	const item = controlsOf(from).find((one) => one.name === name);
	if (!item) throw new Error(`${from.id} has no control named "${name}"`);
	return {
		name,
		where: where === "" ? undefined : (where ?? item.where),
		what: more ? `${item.what ?? ""} ${more}`.trim() : item.what,
	};
}

const SAME_TAB = "On a tablet or a phone it opens in this tab, and the back button returns.";
const NODE_DESIGN_HERE =
	"Opens [Node Design](creating-custom-nodes) in this tab, on the packs of the project you " +
	"have open here; the back button returns.";

/** The editor's top row on a tablet held upright, where it folds into More. */
export const EDITOR_BAR_TABLET: ToolbarSpec = {
	id: "editor-bar-tablet",
	device: "tablet",
	title: "The editor's top row, on a tablet",
	summary:
		"The web app's row held upright: what is used less folds into More. Held sideways it is " +
		"as on a computer.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					tint: "preview",
					...as(
						EDITOR_BAR_BROWSER,
						"The Roswaal mark",
						"Held upright, the version is in the mark's tooltip.",
					),
				},
			],
		},
		{
			items: [
				{
					t: "icon",
					icon: "panelLeft",
					...as(EDITOR_BAR_BROWSER, "Project", "On a touch screen they slide out over the graph."),
				},
			],
		},
		...openGraph(as(EDITOR_BAR_BROWSER, "The open graph")),
		{
			apart: true,
			items: [
				{
					t: "icon",
					icon: "build",
					primary: true,
					...as(EDITOR_BAR_BROWSER, "Compile script", "Held upright, it is its icon."),
				},
			],
		},
		{
			items: [
				{
					t: "icon",
					icon: "panelRight",
					...as(
						EDITOR_BAR_BROWSER,
						"Inspector",
						"On a touch screen they slide out over the graph.",
					),
				},
				{
					t: "popout",
					icon: "more",
					name: "More",
					where: "the last icon on the row",
					what:
						"The rest of the row: **Manual | Dynamic**, **Compile project**, **Refresh**, " +
						`**New graph**, **New node map**, **Docs**, **Node Design** and **Settings**. ${SAME_TAB}`,
				},
			],
		},
	],
};

/** The editor's top row on a phone: the mark, the open graph, compiling, and More. */
export const EDITOR_BAR_PHONE: ToolbarSpec = {
	id: "editor-bar-phone",
	device: "phone",
	title: "The editor's top row, on a phone",
	summary:
		"The mark, the open graph's tab, Compile script and More. The Project and Inspector " +
		"buttons are on the bar along the bottom.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					tint: "preview",
					glyph: "graph",
					...as(
						EDITOR_BAR_BROWSER,
						"The Roswaal mark",
						"The grey graph beside it says this is the editor; the version is in its tooltip.",
					),
				},
			],
		},
		{
			wrap: "graph-tabs",
			items: [
				{
					t: "tab",
					text: "Tank",
					on: true,
					name: "The open graph",
					what: "Its tab alone. The others are in the list beside it.",
				},
				{ t: "icon", icon: "chevron" },
			],
		},
		{
			apart: true,
			items: [
				{
					t: "icon",
					icon: "build",
					primary: true,
					...as(EDITOR_BAR_BROWSER, "Compile script", "As its icon."),
				},
			],
		},
		{
			items: [
				{
					t: "popout",
					icon: "more",
					name: "More",
					where: "the last icon",
					what: "Everything else, drawn below.",
				},
			],
		},
	],
};

const HOLD_TO_ADD =
	"On a touch screen, pressing and holding the graph does the same, where you held.";

/** What More holds on a phone, from `ProjectBar`'s menu and `DocumentBar`'s rows. */
export const MORE_MENU_PHONE: ToolbarSpec = {
	id: "more-menu-phone",
	title: "The More menu, on a phone",
	summary: "What **More** holds on a phone. Tap anywhere else to put it away.",
	chrome: "popmenu",
	groups: [
		{
			items: [
				{
					t: "segmented",
					options: ["Manual", "Dynamic"],
					on: 1,
					...as(EDITOR_BAR_BROWSER, "Manual | Dynamic"),
				},
				{
					t: "button",
					text: "Compile project",
					icon: "build",
					...as(EDITOR_BAR_BROWSER, "Compile project"),
				},
				{
					t: "button",
					text: "Add node",
					icon: "search",
					...as(GRAPH_BAR, "Add node", HOLD_TO_ADD),
				},
				{ t: "button", text: "Preview", icon: "terminal", ...as(GRAPH_BAR, "Preview") },
				{ t: "button", text: "Refresh", icon: "refresh", ...as(EDITOR_BAR_BROWSER, "Refresh") },
				{
					t: "button",
					text: "New graph",
					icon: "newFile",
					...as(EDITOR_BAR_BROWSER, "New graph"),
				},
				{
					t: "button",
					text: "New node map",
					icon: "map",
					...as(EDITOR_BAR_BROWSER, "New node map"),
				},
				{
					t: "button",
					text: "Docs",
					icon: "document",
					...as(EDITOR_BAR_BROWSER, "Docs", SAME_TAB, ""),
				},
				{
					t: "button",
					text: "Node Design",
					icon: "palette",
					...as(EDITOR_BAR_BROWSER, "Node Design", undefined, ""),
					what: NODE_DESIGN_HERE,
				},
				{
					t: "button",
					text: "Settings",
					icon: "settings",
					...as(EDITOR_BAR_BROWSER, "Settings", undefined, ""),
				},
			],
		},
	],
};

/** The open graph's clusters on a tablet. */
export const GRAPH_BAR_TABLET: ToolbarSpec = {
	id: "graph-bar-tablet",
	device: "tablet",
	title: "The open graph, on a tablet",
	summary: "As on a computer, held either way.",
	chrome: "float",
	groups: [
		{
			wrap: "graph-tabs",
			items: [
				{
					t: "tab",
					text: "Tank",
					on: true,
					name: "Tabs",
					what:
						"One per open graph, function, node map or Luau file, its icon saying which; " +
						"the open one is lit. Press and hold a tab, then drag, to move it.",
				},
				{ t: "tab", text: "Game", kind: "nodemap" },
				{ t: "icon", icon: "chevron", ...as(GRAPH_BAR, "Open documents") },
			],
		},
		{
			items: [
				{ t: "icon", icon: "search", ...as(GRAPH_BAR, "Add node", HOLD_TO_ADD) },
				{ t: "icon", icon: "layout", ...as(GRAPH_BAR, "Realign") },
				{ t: "icon", icon: "straighten", on: true, ...as(GRAPH_BAR, "Straighten") },
				{ t: "icon", icon: "terminal", ...as(GRAPH_BAR, "Preview") },
			],
		},
	],
};

/** The open graph on a phone: its tab, with the tools moved into More. */
export const GRAPH_BAR_PHONE: ToolbarSpec = {
	id: "graph-bar-phone",
	device: "phone",
	title: "The open graph, on a phone",
	summary:
		"Its tab, and the list of the others. **Add node** and **Preview** are in **More**; " +
		"Realign and Straighten are not on a phone.",
	chrome: "float",
	groups: [
		{
			wrap: "graph-tabs",
			items: [
				{
					t: "tab",
					text: "Tank",
					on: true,
					name: "Tabs",
					what: "The open graph's tab alone.",
				},
				{
					t: "icon",
					icon: "chevron",
					...as(GRAPH_BAR, "Open documents", "The way to the others."),
				},
			],
		},
	],
};

/** Node Design's top row on a tablet: the web app's, opening pages in this tab. */
export const DESIGNER_BAR_TABLET: ToolbarSpec = {
	id: "designer-bar-tablet",
	device: "tablet",
	title: "Node Design's top row, on a tablet",
	summary: "The web app's row. Under it, the pack's own bar: see **Only on a touch screen** below.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					text: "Node Design",
					tint: "preview",
					...as(DESIGNER_BAR_BROWSER, "Node Design"),
				},
			],
		},
		{
			apart: true,
			wrap: "logic-mode-group",
			items: [
				{ t: "label", text: "Logic" },
				{ t: "segmented", options: ["Luau", "Nodes"], on: 0, ...as(DESIGNER_BAR, "Luau or Nodes") },
			],
		},
		{
			items: [
				{ t: "button", text: "Details", icon: "rename", ...as(DESIGNER_BAR, "Details") },
				{ t: "divider" },
				{ t: "badge", text: "Impure", ...as(DESIGNER_BAR, "Kind") },
				{ t: "divider" },
				{ t: "icon", icon: "remove" },
				{ t: "button", text: "Save", icon: "build", primary: true, ...as(DESIGNER_BAR, "Save") },
			],
		},
		{
			items: [
				{ t: "icon", icon: "help", ...as(DESIGNER_BAR_BROWSER, "How custom nodes work") },
				{ t: "icon", icon: "document", ...as(DESIGNER_BAR_BROWSER, "Docs", SAME_TAB) },
				{
					t: "icon",
					icon: "graph",
					name: "Open Editor",
					where: "the graph",
					what: `The editor. ${SAME_TAB} Leaving a node with unsaved edits asks first.`,
				},
				{ t: "icon", icon: "settings", ...as(DESIGNER_BAR_BROWSER, "Settings") },
			],
		},
	],
};

/** Node Design's top row on a phone. */
export const DESIGNER_BAR_PHONE: ToolbarSpec = {
	id: "designer-bar-phone",
	device: "phone",
	title: "Node Design's top row, on a phone",
	summary: "The node's actions as icons, its kind behind a button, and the other windows in More.",
	chrome: "float",
	groups: [
		{
			wrap: "mark-group",
			items: [
				{
					t: "mark",
					window: true,
					tint: "preview",
					glyph: "palette",
					...as(
						DESIGNER_BAR_BROWSER,
						"Node Design",
						"On a phone the grey palette beside it says which window this is.",
					),
				},
			],
		},
		{
			apart: true,
			items: [
				{ t: "icon", icon: "rename", ...as(DESIGNER_BAR, "Details", "As its icon.") },
				{ t: "divider" },
				{
					t: "popout",
					text: "Impure",
					...as(DESIGNER_BAR, "Kind"),
					what:
						"**Pure**, **Impure** or **Cannot run**, behind a button that names it. In it, " +
						"**Normal** or **Pill** for a pure node, and the bin for a saved one.",
				},
				{
					t: "icon",
					icon: "build",
					primary: true,
					...as(DESIGNER_BAR, "Save", "As its icon."),
				},
			],
		},
		{
			items: [
				{
					t: "popout",
					icon: "more",
					name: "More",
					where: "the last button",
					what:
						"**How custom nodes work**, **Docs**, **Open Editor** and **Settings**, as rows. " +
						`Each opens in this tab; leaving a node with unsaved edits asks first.`,
				},
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
				{
					t: "mark",
					text: "Docs",
					version: true,
					tint: "preview",
					...as(DOCS_SITE_BAR, "The mark, and Docs"),
				},
				{
					t: "button",
					text: "Contents",
					name: "Contents",
					what: "Slides the contents out over the page. Tap beside them to put them away.",
				},
				{
					t: "icon",
					icon: "search",
					name: "Search",
					what: "The search `Ctrl` + `K` opens, for a screen with no keyboard.",
				},
			],
		},
		{
			apart: true,
			items: [
				{
					t: "button",
					text: "Try it in your browser",
					...as(DOCS_SITE_BAR, "Try it in your browser", SAME_TAB),
				},
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
					t: "mark",
					text: "Docs",
					tint: "preview",
					...as(DOCS_SITE_BAR, "The mark, and Docs", "The version steps aside on a phone."),
				},
				{ t: "button", text: "Contents", ...as(DOCS_SITE_BAR_TOUCH, "Contents") },
				{ t: "icon", icon: "search", ...as(DOCS_SITE_BAR_TOUCH, "Search") },
			],
		},
		{
			row: true,
			items: [
				{
					t: "button",
					text: "Try it in your browser",
					...as(DOCS_SITE_BAR, "Try it in your browser", SAME_TAB, "second row"),
				},
				{ t: "button", text: "Source", ...as(DOCS_SITE_BAR, "Source", undefined, "second row") },
				{
					t: "icon",
					icon: "settings",
					...as(DOCS_SITE_BAR, "Settings", undefined, "second row, at the end"),
				},
			],
		},
	],
};

// ---------------------------------------------------------------------------
// Drawn for walkthroughs
//
// Pictures a walkthrough points into rather than bars the Toolbars page
// documents. Named, so a step can point at a control, and described, so what
// a step points at always says what it is. The windows Getting started steps
// through are `layouts.ts`'s.
// ---------------------------------------------------------------------------

/**
 * The Project panel's heading. Written from `App.tsx`'s tree header: the
 * project's name, and the Files | DataModel switch once there is a place.
 */
export const PROJECT_PANEL_HEAD: ToolbarSpec = {
	id: "project-panel-head",
	title: "The Project panel's heading",
	summary: "Over the project tree, with a place open.",
	chrome: "panel",
	groups: [
		{
			items: [
				{
					t: "heading",
					level: 2,
					text: "Project",
					sub: "my-game",
					tools: [
						{
							t: "segmented",
							options: ["Files", "DataModel"],
							on: 0,
							name: "Files | DataModel",
							where: "With a place",
							what: "The project's files, or the place's instances as Studio's Explorer lists them.",
						},
					],
				},
			],
		},
	],
};

// ---------------------------------------------------------------------------
// Places and packages
//
// The project tree, the DataModel browser, the Properties panel and the
// dialogs around them, drawn in the editor's own markup. The Properties panel
// is filled by `describeInstance` itself, from an instance built here, so its
// headings and its values are the ones the editor would show.
// ---------------------------------------------------------------------------

const graphFolder = (label: string, depth: number, open: boolean): ToolbarItem => ({
	t: "treeRow",
	label,
	depth,
	twist: open ? "open" : "shut",
	icon: open ? "folderOpen" : "folder",
});

/**
 * Graph Content with `wally.toml` and its packages, as `ProjectTree.tsx` lists
 * them: folders, then `wally.toml`, then files, and Compile Content under it.
 */
export const PROJECT_TREE_WALLY: ToolbarSpec = {
	id: "project-tree-wally",
	title: "The project tree, with Wally",
	summary: "The Project panel's Files view in a project that uses Wally.",
	chrome: "filetree",
	groups: [
		{
			items: [
				{ t: "treeSection", text: "Graph Content" },
				graphFolder(".roswaal", 0, true),
				graphFolder("scripts", 1, false),
				{
					t: "treeRow",
					label: "wally.toml",
					depth: 0,
					twist: "open",
					icon: "settings",
					tone: "wally",
					name: "wally.toml",
					what: "What the project depends on. Right-click it to add a package.",
				},
				{
					t: "treeRow",
					label: "Signal",
					depth: 1,
					icon: "instance",
					tone: "package",
					badge: "1.5.0",
					name: "A package",
					what: "Listed by the name you require it by, with the version installed. Double-click it for its code.",
				},
				{
					t: "treeRow",
					label: "Promise",
					depth: 1,
					icon: "instance",
					tone: "package",
					badge: "not installed",
					readonly: true,
					name: "Not installed",
					what: "In wally.toml with nothing in Packages/ yet. Right-click it to insert its zip.",
				},
				{ t: "treeRow", label: ".luaurc", depth: 0, icon: "settings", tone: "luaurc" },
				{ t: "treeSection", text: "Compile Content" },
				{
					t: "treeRow",
					label: "Packages",
					depth: 0,
					twist: "shut",
					icon: "folderFilled",
					tone: "tree-folder-packages",
					name: "Packages/",
					what: "What Wally installs, in purple. It starts closed.",
				},
				{
					t: "treeRow",
					label: "src",
					depth: 0,
					twist: "shut",
					icon: "folder",
					tone: "tree-folder-plain",
				},
			],
		},
	],
};

/** The same tree once Add from Wally has installed Flux. */
export const PROJECT_TREE_WALLY_ADDED: ToolbarSpec = {
	id: "project-tree-wally-added",
	title: "The project tree, after adding a package",
	summary: "Flux is listed under wally.toml with the version installed.",
	chrome: "filetree",
	groups: [
		{
			items: [
				{ t: "treeSection", text: "Graph Content" },
				graphFolder(".roswaal", 0, true),
				graphFolder("scripts", 1, false),
				{
					t: "treeRow",
					label: "wally.toml",
					depth: 0,
					twist: "open",
					icon: "settings",
					tone: "wally",
				},
				{
					t: "treeRow",
					label: "Signal",
					depth: 1,
					icon: "instance",
					tone: "package",
					badge: "1.5.0",
				},
				{
					t: "treeRow",
					label: "Promise",
					depth: 1,
					icon: "instance",
					tone: "package",
					badge: "not installed",
					readonly: true,
				},
				{
					t: "treeRow",
					label: "Flux",
					depth: 1,
					icon: "instance",
					tone: "package",
					badge: "0.2.0",
					selected: true,
					name: "The new package",
					what: "Its line is in wally.toml, and it is installed in Packages/.",
				},
				{ t: "treeRow", label: ".luaurc", depth: 0, icon: "settings", tone: "luaurc" },
				{ t: "treeSection", text: "Compile Content" },
				{
					t: "treeRow",
					label: "Packages",
					depth: 0,
					twist: "shut",
					icon: "folderFilled",
					tone: "tree-folder-packages",
				},
				{
					t: "treeRow",
					label: "src",
					depth: 0,
					twist: "shut",
					icon: "folder",
					tone: "tree-folder-plain",
				},
			],
		},
	],
};

/**
 * What right-clicking `wally.toml`, or a package listed under it, offers.
 * Written from `ProjectTree.tsx`, in its order.
 */
export const WALLY_MENU: ToolbarSpec = {
	id: "wally-menu",
	title: "The wally.toml menu",
	summary: "Right-click wally.toml, or a package listed under it.",
	chrome: "popmenu",
	groups: [
		{
			items: [
				{
					t: "button",
					text: "Insert its zip…",
					icon: "folderOpen",
					name: "Insert its zip…",
					where: "On a package not installed",
					what: "Installs that package from a zip you downloaded.",
				},
				{
					t: "button",
					text: "Remove package…",
					icon: "remove",
					name: "Remove package…",
					where: "On a package",
					what: "Takes it out of wally.toml and Packages/, after listing what still requires it.",
				},
				{
					t: "button",
					text: "Add from Wally…",
					icon: "instance",
					name: "Add from Wally…",
					what: "A package from the Wally registry, with what it depends on.",
				},
				{
					t: "button",
					text: "Insert package zip…",
					icon: "folderOpen",
					name: "Insert package zip…",
					what: "A package, or any module, from a zip.",
				},
				{
					t: "button",
					text: "Insert GitHub repo…",
					icon: "external",
					name: "Insert GitHub repo…",
					where: "In the installed editor",
					what: "A repository's module, copied into Packages/.",
				},
			],
		},
	],
};

/** Add from Wally's form, as `App.tsx` asks it. */
export const ADD_FROM_WALLY: ToolbarSpec = {
	id: "add-from-wally",
	title: "Add from Wally",
	summary: "The form Add from Wally… opens.",
	chrome: "modal",
	groups: [
		{
			items: [
				{ t: "dialogTitle", text: "Add from Wally" },
				{
					t: "message",
					text: "A package from the Wally registry: scope/name, or scope/name@version. It goes into wally.toml, then installs with what it depends on.",
				},
			],
		},
		{
			items: [
				{
					t: "setting",
					label: "Package",
					value: "someone/flux",
					name: "Package",
					what: "`scope/name`, or `scope/name@version` for a version other than the newest.",
				},
			],
		},
		{
			items: [
				{
					t: "setting",
					label: "Required as (optional)",
					value: "",
					name: "Required as",
					what: "The name in wally.toml and Packages/. Left empty, it is the package's own.",
				},
			],
		},
		{
			items: [
				{
					t: "setting",
					label: "Realm",
					value: "Shared (Packages)",
					control: "select",
					name: "Realm",
					what: "Shared, Server or Dev: which table of wally.toml the line goes in, and which folder it installs into.",
				},
			],
		},
		{
			actions: true,
			items: [
				{ t: "button", text: "Cancel" },
				{
					t: "button",
					text: "Add",
					primary: true,
					name: "Add",
					what: "Writes the line, then asks the registry.",
				},
			],
		},
	],
};

/** What Remove package… asks, when a file still requires the package. */
export const REMOVE_PACKAGE: ToolbarSpec = {
	id: "remove-package",
	title: "Remove package",
	summary: "What Remove package… asks first.",
	chrome: "modal",
	groups: [
		{
			items: [
				{ t: "dialogTitle", text: "Remove Signal?" },
				{
					t: "message",
					text: "It comes out of wally.toml and Packages/, with any package only it needed. These still require it, and will fail to:",
				},
				{
					t: "list",
					items: ["src/server/Doors.server.luau"],
					name: "Still requires it",
					what: "Every file with a require that reaches the package.",
				},
			],
		},
		{
			actions: true,
			items: [
				{ t: "button", text: "Cancel" },
				{
					t: "button",
					text: "Remove",
					primary: true,
					danger: true,
					name: "Remove",
					what: "Takes it out. Code copied in over its file in Packages/ stays.",
				},
			],
		},
	],
};

/** A row of the DataModel browser, glyph and colour as `PlaceBrowser.tsx` picks them. */
function placeRow(
	label: string,
	className: string,
	depth: number,
	opts: {
		service?: boolean;
		open?: boolean;
		kids?: boolean;
		selected?: boolean;
		name?: string;
		what?: string;
	} = {},
): ToolbarItem {
	const { icon, tone } = classGlyph(className, opts.service ?? false, opts.open ?? false);
	return {
		t: "treeRow",
		place: true,
		label,
		depth,
		icon,
		tone,
		className,
		...(opts.kids ? { twist: opts.open ? ("open" as const) : ("shut" as const) } : {}),
		...(opts.selected ? { selected: true, current: true } : {}),
		...(opts.name ? { name: opts.name, what: opts.what } : {}),
	};
}

/** The DataModel browser, with the door the Properties picture shows picked. */
export const DATAMODEL_BROWSER: ToolbarSpec = {
	id: "datamodel-browser",
	title: "The DataModel browser",
	summary: "The Project panel with DataModel chosen: the place, as Studio's Explorer lists it.",
	chrome: "place",
	groups: [
		{
			items: [
				{
					t: "field",
					text: "Filter by name or class",
					fill: true,
					name: "Filter",
					what: "Lists what matches by name, or by a class typed in full, with where each one is.",
				},
				{ t: "icon", icon: "refresh", name: "Read again", what: "Reads the place file again." },
			],
		},
		{
			items: [
				placeRow("Workspace", "Workspace", 0, { service: true, open: true, kids: true }),
				placeRow("House", "Model", 1, { open: true, kids: true }),
				placeRow("Door", "Part", 2, {
					selected: true,
					name: "An instance",
					what: "Its name and class. Double-click it, or double tap, for Properties.",
				}),
				placeRow("ReplicatedStorage", "ReplicatedStorage", 0, {
					service: true,
					open: true,
					kids: true,
				}),
				placeRow("Shared", "Folder", 1, { open: true, kids: true }),
				placeRow("Config", "ModuleScript", 2, {
					name: "A script",
					what: "Coloured by kind, as the project tree colours it. Properties has Open for the file that writes it.",
				}),
				placeRow("ServerScriptService", "ServerScriptService", 0, {
					service: true,
					open: true,
					kids: true,
				}),
				placeRow("Doors", "Script", 1),
				placeRow("StarterPlayer", "StarterPlayer", 0, { service: true, kids: true }),
			],
		},
	],
};

/**
 * The door, built as the place reader would build it, so `describeInstance`
 * can say what the Properties panel shows for it.
 */
function sampleDoor(): RbxInstance {
	const enc = new TextEncoder();
	const bytes = (s: string) => enc.encode(s);
	// `AttributesSerialize`: one attribute, IsOpen, a boolean (0x03) false.
	const name = bytes("IsOpen");
	const attributes = new Uint8Array(10 + name.length);
	const view = new DataView(attributes.buffer);
	view.setUint32(0, 1, true);
	view.setUint32(4, name.length, true);
	attributes.set(name, 8);
	attributes[8 + name.length] = 0x03;
	attributes[9 + name.length] = 0;
	const at = (
		className: string,
		label: string,
		parent: RbxInstance | null,
		service = false,
	): RbxInstance => ({ className, name: label, parent, children: [], props: new Map(), service });
	const workspace = at("Workspace", "Workspace", null, true);
	const house = at("Model", "House", workspace);
	const door = at("Part", "Door", house);
	door.props = new Map<string, Prop>([
		["Name", { type: "String", value: bytes("Door") }],
		["Anchored", { type: "Bool", value: true }],
		["CanCollide", { type: "Bool", value: true }],
		["Transparency", { type: "Float32", value: 0 }],
		["Color3uint8", { type: "Color3uint8", value: [105, 64, 40] }],
		["size", { type: "Vector3", value: [4, 7, 1] }],
		["Tags", { type: "String", value: bytes("Interactable") }],
		["AttributesSerialize", { type: "String", value: attributes }],
	]);
	return door;
}

/** The Properties panel for the door, filled by the editor's own reader. */
export const PROPERTIES_PANEL: ToolbarSpec = (() => {
	const door = sampleDoor();
	const info = describeInstance(door, 2, () => undefined);
	const glyph = classGlyph(info.className, false, false);
	const groups: ToolbarGroup[] = groupProperties(info.properties).map(([category, list]) => ({
		items: [
			{ t: "propGroup", text: category, count: list.length },
			...(category === "Tags"
				? [
						{
							t: "tags",
							tags: list.map((p) => p.name),
							name: "Tags",
							what: "The instance's tags, as CollectionService reads them.",
						} as ToolbarItem,
					]
				: list.map(
						(p): ToolbarItem => ({
							t: "prop",
							label: p.name,
							value: p.value,
							...(p.color ? { color: p.color } : {}),
							...(p.name === "Anchored"
								? {
										name: "A property",
										what: "Drag it onto a graph for a Get Member. Hold `Ctrl` as you drop for Set Property.",
									}
								: category === "Attributes"
									? {
											name: "An attribute",
											what: "Drag it for Get Attribute, or Set Attribute with `Ctrl`.",
										}
									: {}),
						}),
					)),
		],
	}));
	return {
		id: "properties-panel",
		title: "The Properties panel",
		summary: "An instance opened from the DataModel, on the right under the Inspector.",
		chrome: "properties",
		groups: [
			{
				items: [
					{
						t: "heading",
						level: 2,
						text: "Properties",
						sub: info.name,
						tools: [
							{
								t: "icon",
								icon: "close",
								name: "Close",
								what: "Stops showing the instance.",
							},
						],
					},
				],
			},
			{
				items: [
					{
						t: "propHead",
						label: info.name,
						className: info.className,
						icon: glyph.icon,
						tone: glyph.tone,
						name: "The instance",
						what: "Drag it onto a graph for an Instance node at its path.",
					},
				],
			},
			{ items: [{ t: "propPath", text: info.path.join(" › ") }] },
			...(info.summary
				? [{ items: [{ t: "propSummary", text: info.summary } as ToolbarItem] }]
				: []),
			...groups,
		],
	};
})();

/** The Export panel, for a project with a place, as `ExportMenu.tsx` draws it. */
export const EXPORT_PANEL: ToolbarSpec = {
	id: "export-panel",
	title: "The Export panel",
	summary: "Project → Export…, in a project with a place.",
	chrome: "modal",
	className: "export-menu",
	groups: [
		{ items: [{ t: "dialogTitle", text: "Export Project" }] },
		{
			wrap: "export-menu-form",
			items: [
				{
					t: "formRow",
					label: "Format",
					control: "select",
					value: "Project (.zip)",
					note: "A zip: graphs, Luau and the Rojo project, with the place in its root.",
					name: "Format",
					what: "The whole project as a zip, or the place file alone.",
				},
				{ t: "formSection", text: "File" },
				{
					t: "formRow",
					label: "Name",
					control: "field",
					value: "my-game",
					suffix: ".zip",
					name: "Name",
					what: "The file's name.",
				},
				{ t: "formSection", text: "Place file" },
				{
					t: "formRow",
					label: "place.rbxl",
					control: "segmented",
					value: "",
					options: ["Modify RBXL", "Don't Modify RBXL"],
					on: 0,
					note: "Writes 12 scripts and adds 1.",
					name: "Modify RBXL | Don't Modify RBXL",
					what: "Modify writes the project's scripts into the copy of the place, and says how many; Don't sends the place as it was.",
				},
			],
		},
		{
			actions: true,
			wrap: "export-menu-foot",
			items: [
				{ t: "footNote", text: "34 files and place.rbxl · the project itself is not changed" },
				{ t: "button", text: "Cancel" },
				{
					t: "button",
					text: "Export",
					primary: true,
					name: "Export",
					what: "Downloads it. The project's own files are not changed.",
				},
			],
		},
	],
};

/** Every picture on Places and Rojo projects and on Wally packages. */
export const PLACE_BARS: ToolbarSpec[] = [
	PROJECT_TREE_WALLY,
	PROJECT_TREE_WALLY_ADDED,
	WALLY_MENU,
	ADD_FROM_WALLY,
	REMOVE_PACKAGE,
	DATAMODEL_BROWSER,
	PROPERTIES_PANEL,
	EXPORT_PANEL,
];

/** Every picture a walkthrough draws, for the tests that hold them to the icon set. */
export const WALK_BARS: ToolbarSpec[] = [...PLACE_BARS];

/**
 * The row of edits along the bottom of the graph on a phone or a tablet.
 *
 * Written from `src/app/TouchBar.tsx`, in its order. Each is the keystroke
 * named beside it, sent to the graph's own handler.
 */
export const ACTION_ROW: ToolbarSpec = {
	id: "action-row",
	title: "The action row",
	summary:
		"Along the bottom of the graph on a phone or a tablet, and of Node Design's logic. On a phone the Project and Inspector buttons are at its two ends. Icons or words with **Settings → Editor → Action buttons**; separate buttons or one bar with **Action row**.",
	chrome: "float",
	groups: [
		{
			items: [
				{
					t: "icon",
					icon: "undo",
					name: "Undo",
					what: "As `Ctrl` + `Z`. Greyed when there is nothing to undo.",
				},
				{ t: "icon", icon: "redo", name: "Redo", what: "As `Ctrl` + `Y`." },
				{
					t: "icon",
					icon: "straighten",
					name: "Align",
					what: "Lines the selection up on the node picked first, as `A` does.",
					where: "Two or more selected",
				},
				{
					t: "icon",
					icon: "copy",
					name: "Copy",
					what: "As `Ctrl` + `C`.",
					where: "Something selected",
				},
				{
					t: "icon",
					icon: "cut",
					name: "Cut",
					what: "As `Ctrl` + `X`.",
					where: "Something selected",
				},
				{
					t: "icon",
					icon: "duplicate",
					name: "Duplicate",
					what: "As `Ctrl` + `D`.",
					where: "Something selected",
				},
				{
					t: "icon",
					icon: "remove",
					name: "Delete",
					what: "As `Delete`.",
					where: "Something selected",
				},
				{
					t: "icon",
					icon: "paste",
					name: "Paste",
					what: "As `Ctrl` + `V`, where the graph was last touched.",
					where: "Something copied",
				},
			],
		},
	],
};

/**
 * Node Design's pack bar, under the top row on a phone or a tablet.
 *
 * Written from `src/app/designer/PackView.tsx` and the switches `NodeEditor`
 * puts in it on a phone, where the node and its logic take turns.
 */
export const DESIGNER_TOUCH_BAR: ToolbarSpec = {
	id: "designer-touch-bar",
	title: "Node Design's pack bar, on a phone or a tablet",
	summary:
		"Under the top row on a phone or a tablet: the pack and the open node, and on a phone " +
		"which view of it is showing.",
	chrome: "float",
	groups: [
		{
			items: [
				{
					t: "button",
					text: "combat",
					icon: "chevron",
					name: "The pack",
					what: "Slides the pack's node list out over the editor. Pick a node and it goes away again.",
				},
				{ t: "name", text: "Apply Knockback" },
				{
					t: "segmented",
					options: ["Preview", "Logic"],
					on: 1,
					name: "Preview and Logic",
					where: "Phones only",
					what: "The node, or what it does when it runs: each with the screen to itself.",
				},
				{
					t: "segmented",
					options: ["Luau", "Nodes"],
					on: 1,
					name: "Luau and Nodes",
					where: "Phones only, with Logic showing",
					what:
						"Write the logic as Luau, or build it from nodes. On a tablet it is beside " +
						"**Details** held sideways, and on the logic's tools held upright.",
				},
			],
		},
	],
};

/** Every bar the documentation draws, in the order the page walks them. */
export const TOOLBARS: ToolbarSpec[] = [
	EDITOR_BAR,
	EDITOR_BAR_BROWSER,
	EDITOR_BAR_TABLET,
	EDITOR_BAR_PHONE,
	MORE_MENU_PHONE,
	PROJECT_PANEL_HEAD,
	GRAPH_BAR,
	GRAPH_BAR_TABLET,
	GRAPH_BAR_PHONE,
	GRAPH_SETTINGS,
	MAP_BAR,
	CANVAS_STRIP,
	DESIGNER_BAR,
	DESIGNER_BAR_BROWSER,
	DESIGNER_BAR_TABLET,
	DESIGNER_BAR_PHONE,
	DOCS_BAR,
	DOCS_SITE_BAR,
	DOCS_SITE_BAR_TOUCH,
	DOCS_SITE_BAR_PHONE,
	ACTION_ROW,
	DESIGNER_TOUCH_BAR,
];

/**
 * The bars the browser build draws, which all carry the preview mark.
 *
 * Named as a set so `tests/previewbuild.test.ts` can hold the rule against the
 * drawings as well as against the code: a bar added here without the chip is a
 * page telling somebody they are in the tool when they are in the preview.
 */
export const BROWSER_TOOLBARS: ToolbarSpec[] = [
	EDITOR_BAR_BROWSER,
	EDITOR_BAR_TABLET,
	EDITOR_BAR_PHONE,
	DESIGNER_BAR_BROWSER,
	DESIGNER_BAR_TABLET,
	DESIGNER_BAR_PHONE,
	DOCS_SITE_BAR,
	DOCS_SITE_BAR_TOUCH,
	DOCS_SITE_BAR_PHONE,
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
 * The three live on *Members and fields*, because the difference between them
 * is a panel away from the graph: the nodes look identical on the canvas -- a
 * red box with a name under the title -- and what decides whether one offers
 * members is a dropdown and what is under it.
 *
 * Drawn with the Inspector's own markup, so the picture inherits the editor's
 * own layout: a one-line field beside its label, and each field row its wire
 * colour, its name, its type and the remove button after them.
 */
export const TYPE_FIELDS_INSPECTOR: ToolbarSpec = {
	id: "type-fields-inspector",
	title: "A type entered as fields",
	summary: "The Inspector for a Declare Type whose shape is Table of Fields.",
	chrome: "inspector",
	groups: [
		{ items: [{ t: "setting", label: "Type name", value: "Input" }] },
		{ items: [{ t: "setting", label: "Shape", value: "Table of Fields", control: "select" }] },
		{ items: [{ t: "listTitle", text: "Fields", action: "Add" }] },
		{ items: [{ t: "pair", left: "throttle", right: "number" }] },
		{ items: [{ t: "pair", left: "steer", right: "number" }] },
		{ items: [{ t: "pair", left: "aim", right: "Vector3" }] },
		{ items: [{ t: "setting", label: "Layout", value: "One per line", control: "select" }] },
		{ items: [{ t: "setting", label: "Is Export Type", value: "", control: "check", on: true }] },
	],
};

/** The same panel, for a type typed out instead. */
export const TYPE_WRITTEN_INSPECTOR: ToolbarSpec = {
	id: "type-written-inspector",
	title: "A type written as Luau",
	summary: "The Inspector for a Declare Type whose shape is Custom Luau.",
	chrome: "inspector",
	groups: [
		{ items: [{ t: "setting", label: "Type name", value: "Shot" }] },
		{ items: [{ t: "setting", label: "Shape", value: "Custom Luau", control: "select" }] },
		{
			items: [
				{
					t: "setting",
					label: "Definition",
					value: "{ damage: number, from: Vector3 }",
					control: "code",
				},
			],
		},
		{ items: [{ t: "setting", label: "Is Export Type", value: "", control: "check", on: true }] },
	],
};

/** And for a type that has no fields to offer at all. */
export const TYPE_OPEN_INSPECTOR: ToolbarSpec = {
	id: "type-open-inspector",
	title: "A type with no fixed fields",
	summary: "The Inspector for a Declare Type holding a dictionary type.",
	chrome: "inspector",
	groups: [
		{ items: [{ t: "setting", label: "Type name", value: "Scores" }] },
		{ items: [{ t: "setting", label: "Shape", value: "Custom Luau", control: "select" }] },
		{
			items: [
				{ t: "setting", label: "Definition", value: "{ [string]: number }", control: "code" },
			],
		},
		{ items: [{ t: "setting", label: "Is Export Type", value: "", control: "check", on: true }] },
	],
};
