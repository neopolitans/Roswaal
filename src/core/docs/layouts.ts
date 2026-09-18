/**
 * Pictures of a whole window, for the page that introduces the interface.
 *
 * A toolbar drawing answers "which button is Settings". This answers the
 * question before it: what the parts of the screen are and where each one
 * sits. So it is a diagram rather than a screenshot — every region a box in
 * the place it occupies, carrying a number and nothing else to read, with the
 * legend under the picture saying what each number is. A region is only as
 * detailed as it needs to be recognised by: a few glyphs, the buttons it
 * shows. The bars themselves are drawn control by control on Toolbars.
 *
 * Drawn from one spec into the same figure a toolbar uses: the same legend
 * markup and the same `data-control` pairing, so the linking script lights a
 * region from its row and a row from its region with no second script, and a
 * tap keeps one lit on a touch screen.
 *
 * Core, so the website and the Docs window draw it identically; the glyphs are
 * handed in, as they are for a toolbar.
 */

import type { ToolbarArt } from "./toolbars.js";
import { controlKey } from "./toolbars.js";

/**
 * What a region is, which decides how it is drawn: a strip, a docked panel,
 * the graph itself, something floating over the graph, or a panel slid out
 * over it.
 */
export type RegionKind = "bar" | "panel" | "canvas" | "float" | "drawer";

export interface LayoutRegion {
	/**
	 * The legend's name for it, and the key tying the box to its row. Absent,
	 * it is drawn and not listed: the second of a pair of buttons whose first
	 * already explains both.
	 */
	name?: string;
	/** One line for the legend. Inline markup, so it can link to a page. */
	what?: string;
	/** Beside the name in the legend: when it is there, if not always. */
	where?: string;
	kind: RegionKind;
	/**
	 * Grid lines it spans: row start and end, column start and end. Lines
	 * rather than named areas, because a floating region shares its cells with
	 * the graph underneath it, and named areas cannot overlap.
	 */
	at: [number, number, number, number];
	/** Which end of its cells a floating region sits at. */
	place?: "start" | "center" | "end";
	/** Glyphs drawn in it, from the editor's icon set. */
	icons?: string[];
	/**
	 * Glyphs pushed to its far end, as a bar pushes its last cluster: the
	 * top bar's Docs, Node Design and Settings sit at the right-hand edge, and
	 * a picture that drew them beside Refresh would put them somewhere they
	 * are not.
	 */
	iconsEnd?: string[];
	/**
	 * The far-end cluster when it mixes glyphs and words, in the order they
	 * sit: Node Design's header has ?, Docs, Open Editor and the gear.
	 */
	endItems?: ({ icon: string } | { chip: string })[];
	/** Words drawn as small buttons in it: a panel's buttons, a switch. */
	chips?: string[];
	/**
	 * Where a large region's number sits, when its usual corner is under
	 * something floating over it. The graph's is at its foot, which on a phone
	 * is where the panel buttons are.
	 */
	number?: "middle-end";
}

export interface LayoutSpec {
	/** Stable; derives the exported constant's name, as a toolbar's does. */
	id: string;
	title: string;
	/** One line under the picture: what window this is, and on what. */
	summary: string;
	/** A window on a computer, a tablet held sideways, or a phone held upright. */
	device: "desktop" | "tablet" | "phone";
	/** `grid-template-columns`. */
	columns: string;
	/** `grid-template-rows`. */
	rows: string;
	regions: LayoutRegion[];
}

/** The regions the legend lists, in the order they are numbered. */
export function listedRegions(spec: LayoutSpec): (LayoutRegion & { name: string })[] {
	return spec.regions.filter((r): r is LayoutRegion & { name: string } => r.name !== undefined);
}

/** The constant a spec is exported as, for *Suggest an edit*. */
export function layoutConstant(spec: LayoutSpec): string {
	return spec.id.replace(/-/g, "_").toUpperCase();
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function glyph(name: string, art: Pick<ToolbarArt, "viewBox" | "paths">): string {
	const path = art.paths[name];
	if (path === undefined) return "";
	return (
		`<svg class="icon" viewBox="${escapeXml(art.viewBox)}" width="14" height="14" aria-hidden="true">` +
		`<path d="${escapeXml(path)}" fill="currentColor"/></svg>`
	);
}

/**
 * The picture: a grid of numbered boxes, numbered as the legend numbers them.
 * The names are the legend's; written in the boxes as well, they said
 * everything twice and crowded the picture of a small window.
 *
 * `aria-hidden`, as a toolbar's picture is: the legend under it says
 * everything the boxes do, in order, and is what a screen reader reads.
 */
export function layoutHtml(spec: LayoutSpec, art: Pick<ToolbarArt, "viewBox" | "paths">): string {
	const numbers = new Map(listedRegions(spec).map((r, i) => [r, i + 1]));
	const regions = spec.regions
		.map((region) => {
			const [r1, r2, c1, c2] = region.at;
			const number = numbers.get(region as LayoutRegion & { name: string });
			const tie = region.name
				? ` data-control="${escapeXml(controlKey(region.name))}" data-name="${escapeXml(region.name)}"`
				: "";
			const badge = number !== undefined ? `<span class="docs-layout-num">${number}</span>` : "";
			const icons = region.icons?.length
				? `<span class="docs-layout-icons">${region.icons.map((i) => glyph(i, art)).join("")}</span>`
				: "";
			const chips = region.chips?.length
				? `<span class="docs-layout-chips">${region.chips.map((c) => `<span>${escapeXml(c)}</span>`).join("")}</span>`
				: "";
			const endParts = [
				...(region.iconsEnd ?? []).map((i) => glyph(i, art)),
				...(region.endItems ?? []).map((item) =>
					"icon" in item ? glyph(item.icon, art) : `<span class="docs-layout-chip">${escapeXml(item.chip)}</span>`),
			];
			const end = endParts.length
				? `<span class="docs-layout-icons docs-layout-end">${endParts.join("")}</span>`
				: "";
			const place = region.place ? ` place-${region.place}` : "";
			const numberAt = region.number ? ` number-${region.number}` : "";
			return (
				`<div class="docs-layout-region kind-${region.kind}${place}${numberAt}"` +
				` style="grid-row:${r1} / ${r2};grid-column:${c1} / ${c2}"${tie}>` +
				`${badge}${icons}${chips}${end}</div>`
			);
		})
		.join("");
	return (
		`<div class="docs-layout-frame device-${spec.device}" aria-hidden="true"` +
		` style="grid-template-columns:${escapeXml(spec.columns)};grid-template-rows:${escapeXml(spec.rows)}">` +
		`${regions}</div>`
	);
}

// ---------------------------------------------------------------------------
// The windows
// ---------------------------------------------------------------------------

/** The editor, on a computer. Written from `Workspace.tsx`'s default layout. */
export const EDITOR_LAYOUT: LayoutSpec = {
	id: "editor-layout",
	title: "The editor",
	summary: "The editor on a computer, with a graph open and one node selected.",
	device: "desktop",
	columns: "22% minmax(0, 1fr) 24%",
	rows: "30px 24px 44px minmax(0, 1fr) minmax(0, 0.8fr) 30px",
	regions: [
		{
			name: "Top bar", kind: "bar", at: [1, 2, 1, 4],
			icons: ["refresh", "newFile", "map"], iconsEnd: ["document", "palette", "settings"],
			what: "Acts on the project: new graphs and node maps, when to compile, and the Docs, Node Design and Settings buttons. Each button is on [Toolbars](toolbars).",
		},
		{
			name: "Project", kind: "panel", at: [2, 5, 1, 2],
			what: "The project's files: graphs, node maps, and the Luau compiled from them. Double-click a graph to open it.",
		},
		{
			name: "Variables", kind: "panel", at: [5, 6, 1, 2],
			what: "What the open graph declares — variables, modules, functions and locals. Drag one onto the graph to use it.",
		},
		{
			name: "Graph tabs", kind: "bar", at: [2, 3, 2, 3], chips: ["Main", "Greeter"],
			what: "One tab per open graph, and one per function graph opened from it.",
		},
		{
			name: "The graph", kind: "canvas", at: [3, 6, 2, 3],
			what: "Where the nodes are. Every key and gesture it takes is on [Controls](controls).",
		},
		{
			name: "Graph tools", kind: "float", place: "start", at: [3, 4, 2, 3],
			icons: ["search", "layout", "terminal"],
			what: "The script's class and mode, adding a node, Realign and Straighten, and the Luau this graph compiles to.",
		},
		{
			name: "Compile", kind: "float", place: "end", at: [3, 4, 2, 3], icons: ["build"],
			what: "What this graph compiles for, and compiling it now.",
		},
		{
			name: "Inspector", kind: "panel", at: [2, 6, 3, 4],
			what: "The selected node, with every setting it has.",
			where: "While one node is selected",
		},
		{
			name: "Script analysis", kind: "bar", at: [6, 7, 1, 4],
			what: "Errors and warnings in the open graph, and what the last compile wrote.",
		},
	],
};

/**
 * The editor on a tablet, held sideways. The same regions, rearranged by
 * `useCompact`: the panels leave the sides and come out over the graph.
 */
export const EDITOR_LAYOUT_TOUCH: LayoutSpec = {
	id: "editor-layout-touch",
	title: "The editor, on a tablet",
	summary: "The editor on a tablet, with the Inspector slid out and two nodes selected.",
	device: "tablet",
	columns: "minmax(0, 1fr) 34%",
	rows: "30px 24px 44px minmax(0, 1fr) 40px 40px 30px",
	regions: [
		{
			name: "Top bar", kind: "bar", at: [1, 2, 1, 3],
			icons: ["refresh", "newFile", "map"], iconsEnd: ["document", "palette", "settings"],
			what: "The same bar as on a computer. Held upright, Compile project is its icon.",
		},
		{
			name: "Graph tabs", kind: "bar", at: [2, 3, 1, 3], chips: ["Main", "Greeter"],
			what: "One tab per open graph.",
		},
		{
			name: "The graph", kind: "canvas", at: [3, 7, 1, 3],
			what: "One finger pans and two pinch; press and hold to select a group. The rest is on [Controls](controls).",
		},
		{
			name: "Graph tools", kind: "float", place: "start", at: [3, 4, 1, 3], icons: ["search", "layout", "terminal"],
			what: "As on a computer. Held upright, Straighten is its icon, lit while it is on. On a phone the script's type and mode are behind one button.",
		},
		{ name: "Compile", kind: "float", place: "end", at: [3, 4, 1, 3], icons: ["build"], what: "As on a computer. Held upright, Compile script is its icon; on a phone the target is behind a button beside it." },
		{
			name: "A panel, slid out", kind: "drawer", at: [4, 5, 2, 3],
			what: "Project, Variables and the Inspector come out over the graph one at a time, with its whole height. Tap the graph beside one to put it away.",
		},
		{
			name: "Action row", kind: "float", place: "center", at: [5, 6, 1, 3],
			icons: ["undo", "redo", "straighten", "copy", "cut", "duplicate", "remove", "paste"],
			what: "The edits a keyboard makes, as buttons. Each one is named below.",
			where: "Touch screens only",
		},
		{
			name: "Panel buttons", kind: "float", place: "start", at: [6, 7, 1, 3], chips: ["Project", "Variables"],
			what: "Slide a panel out, or put it away. Inspector's is on the right while a node is selected.",
			where: "Touch screens only",
		},
		{ kind: "float", place: "end", at: [6, 7, 1, 3], chips: ["Inspector"] },
		{
			name: "Script analysis", kind: "bar", at: [7, 8, 1, 3],
			what: "As on a computer.",
		},
	],
};

/** Node Design on a computer, with a node open. */
export const DESIGNER_LAYOUT: LayoutSpec = {
	id: "designer-layout",
	title: "Node Design",
	summary: "Node Design on a computer, with a node open and its logic built from nodes.",
	device: "desktop",
	columns: "24% minmax(0, 1fr) 24%",
	rows: "30px 44px minmax(0, 1fr) 30px minmax(0, 1fr)",
	regions: [
		{
			name: "Header", kind: "bar", at: [1, 2, 1, 4], iconsEnd: ["help", "document", "settings"],
			what: "Which window this is, the docs, the editor, and Settings.",
		},
		{
			name: "Node list", kind: "panel", at: [2, 6, 1, 2], chips: ["New node"],
			what: "The pack's nodes, what it requires, and a new node. Back to every pack from its top.",
		},
		{
			name: "The node", kind: "canvas", at: [2, 4, 2, 4],
			what: "The node as a graph will draw it. Click a pin to edit it; drag a type onto either side to add one.",
		},
		{
			name: "Node tools", kind: "float", place: "start", at: [2, 3, 2, 4], chips: ["Details", "Inputs", "Outputs"],
			what: "The node's name and description, the types to drag on, and how many inputs and outputs it has.",
		},
		{
			name: "Logic", kind: "bar", at: [4, 5, 2, 4], chips: ["Luau", "Nodes"],
			what: "What the node does when it runs, written as Luau or built from nodes. Drag the line above it to resize.",
		},
		{
			name: "Logic graph", kind: "canvas", at: [5, 6, 2, 3],
			what: "The logic as nodes. It is the editor's graph, and takes the same keys and gestures.",
			where: "With Nodes chosen",
		},
		{
			name: "Compiled Luau", kind: "panel", at: [5, 6, 3, 4],
			what: "What the logic compiles to, and what the node is saved as. The preview button on the logic graph's tools shows and hides it.",
			where: "With the preview on",
		},
	],
};

/** Node Design on a tablet: one view at a time, switched from the pack's bar. */
export const DESIGNER_LAYOUT_TOUCH: LayoutSpec = {
	id: "designer-layout-touch",
	title: "Node Design, on a tablet",
	summary: "Node Design on a tablet, showing a node's logic built from nodes.",
	device: "tablet",
	columns: "minmax(0, 1fr)",
	rows: "30px 34px 44px minmax(0, 1fr) 40px 26%",
	regions: [
		{
			name: "Header", kind: "bar", at: [1, 2, 1, 2], iconsEnd: ["help", "document", "settings"],
			what: "As on a computer.",
		},
		{
			name: "Pack bar", kind: "bar", at: [2, 3, 1, 2], chips: ["‹ combat", "Preview", "Logic", "Luau", "Nodes"],
			what: "The pack, which opens its node list over the editor; the open node; and the switches between its views. Each is named below.",
			where: "Touch screens only",
		},
		{
			name: "The node, or its logic", kind: "canvas", at: [3, 6, 1, 2],
			what: "Preview shows the node, Logic its logic — each with the whole editor to itself.",
		},
		{
			name: "Logic tools", kind: "float", place: "start", at: [3, 4, 1, 2], icons: ["search", "layout", "terminal"],
			what: "Adding a node, Realign and Straighten, as over the editor's graph, and the preview of the Luau it compiles to.",
		},
		{
			name: "Action row", kind: "float", place: "center", at: [5, 6, 1, 2],
			icons: ["undo", "redo", "straighten", "copy", "cut", "duplicate", "remove", "paste"],
			what: "The same row as the editor's, acting on the logic.",
			where: "Touch screens only",
		},
		{
			name: "Compiled Luau", kind: "panel", at: [6, 7, 1, 2],
			what: "Beneath the logic rather than beside it.",
			where: "With the preview on",
		},
	],
};

/**
 * The editor on a phone, held upright: what a tablet does, and then the bars
 * fold as well -- the top bar into two rows, the graph's settings behind
 * buttons -- and a panel slid out takes nearly the whole width.
 */
export const EDITOR_LAYOUT_PHONE: LayoutSpec = {
	id: "editor-layout-phone",
	title: "The editor, on a phone",
	summary: "The editor on a phone, with Variables slid out and a node selected.",
	device: "phone",
	columns: "86% minmax(0, 1fr)",
	rows: "28px 28px 40px minmax(0, 1fr) 40px 40px 28px",
	regions: [
		{
			name: "Top bar", kind: "bar", at: [1, 2, 1, 3],
			icons: ["refresh", "newFile", "map"], chips: ["Manual", "Dynamic"], iconsEnd: ["build"],
			what: "The same bar in two rows: the project's own buttons, then Docs, Node Design and Settings under them. Compile project is its icon, and the version is in the mark's tooltip.",
		},
		{ kind: "bar", at: [2, 3, 1, 3], icons: ["document", "palette", "settings"] },
		{
			name: "The graph", kind: "canvas", at: [3, 8, 1, 3], number: "middle-end",
			what: "The same gestures as on a tablet; see [Controls](controls).",
		},
		{
			name: "Graph tools", kind: "float", place: "start", at: [3, 4, 1, 3],
			chips: ["Script ▾"], iconsEnd: ["search", "layout", "straighten", "terminal"],
			what: "The script's type and mode behind one button that says which is chosen; the tools as icons.",
			where: "Phones only",
		},
		{
			name: "Compile", kind: "float", place: "end", at: [3, 4, 1, 3], chips: ["Roblox ▾"], iconsEnd: ["build"],
			what: "The target behind a button, and compiling as its icon.",
		},
		{
			name: "A panel, slid out", kind: "drawer", at: [4, 5, 1, 2],
			what: "Nearly the width of the screen, one at a time. Tap the graph beside it to put it away.",
		},
		{
			name: "Action row", kind: "float", place: "center", at: [5, 6, 1, 3],
			icons: ["undo", "redo", "copy", "cut", "duplicate", "remove"],
			what: "As on a tablet, wrapping when the selection offers more than a row holds.",
		},
		{
			name: "Panel buttons", kind: "float", place: "center", at: [6, 7, 1, 3],
			chips: ["Project", "Variables", "Inspector"],
			what: "As on a tablet, in one row.",
		},
		{ name: "Script analysis", kind: "bar", at: [7, 8, 1, 3], what: "As on a computer." },
	],
};

/** Node Design on a phone, showing a node's preview with its tools folded. */
export const DESIGNER_LAYOUT_PHONE: LayoutSpec = {
	id: "designer-layout-phone",
	title: "Node Design, on a phone",
	summary: "Node Design on a phone, showing a node with its tools folded.",
	device: "phone",
	columns: "minmax(0, 1fr)",
	rows: "30px 34px 40px minmax(0, 1fr)",
	regions: [
		{
			name: "Header", kind: "bar", at: [1, 2, 1, 2],
			endItems: [{ icon: "help" }, { icon: "document" }, { chip: "Open Editor" }, { icon: "settings" }],
			what: "As on a computer, with Docs as its icon so the row holds Settings too.",
		},
		{
			name: "Pack bar", kind: "bar", at: [2, 3, 1, 2], chips: ["› combat"],
			endItems: [{ chip: "Preview" }, { chip: "Logic" }],
			what: "As on a tablet.",
		},
		{
			name: "The node, or its logic", kind: "canvas", at: [3, 5, 1, 2],
			what: "As on a tablet: one view at a time, with the whole screen.",
		},
		{
			name: "Node tools", kind: "float", place: "start", at: [3, 4, 1, 2],
			icons: ["rename"], chips: ["Types ▾", "Pins ▾"],
			what: "Details as its icon; the types to drag on and the pin counts each behind a button. A type still drags out of its panel onto the node.",
			where: "Phones only",
		},
		{
			name: "Kind and Save", kind: "float", place: "end", at: [3, 4, 1, 2],
			chips: ["Impure ▾"], iconsEnd: ["build"],
			what: "Whether the node is pure, how a pure one is drawn, and deleting it, behind a button that names its kind; Save as its icon.",
			where: "Phones only",
		},
	],
};

/** Every window the documentation draws, in the order the page draws them. */
export const LAYOUTS: LayoutSpec[] = [
	EDITOR_LAYOUT, EDITOR_LAYOUT_TOUCH, EDITOR_LAYOUT_PHONE,
	DESIGNER_LAYOUT, DESIGNER_LAYOUT_TOUCH, DESIGNER_LAYOUT_PHONE,
];
