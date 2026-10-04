/**
 * Pictures of a whole window, for the page that introduces the interface.
 *
 * A toolbar drawing answers "which button is Settings". This answers the
 * question before it: what the parts of the screen are and where each one
 * sits, each part numbered, with the legend under the picture saying what
 * each number is.
 *
 * ## Drawn in the editor's own markup, at the editor's own size
 *
 * Every cluster and card is the markup the editor renders -- `.tool-group`,
 * `.dock > .panel`, `.status`, `.pin-popover` -- so the picture takes the
 * editor's stylesheet and cannot drift from it in look. Each window is laid
 * out at a real window's size (`SCREEN`) on grid tracks measured from the real
 * one, and the whole screen is then scaled down with `zoom`, so a cluster is
 * exactly as wide relative to the window as it is on screen and never has to
 * wrap to fit a box someone guessed. Where a part is positioned by the editor
 * against a parent the picture does not have, the position alone is restated
 * inline; the look never is.
 *
 * Drawn from one spec into the same figure a toolbar uses: the same legend
 * markup and the same `data-control` pairing, so the linking script lights a
 * part from its row and a row from its part with no second script.
 *
 * Core, so the website and the Docs window draw it identically; the glyphs are
 * handed in, as they are for a toolbar.
 */

import { controlKey, glyphHtml, itemsHtml, type ToolbarArt, type ToolbarItem } from "./toolbars.js";

/**
 * What a region is, which decides how it is drawn: the canvas, a row of
 * clusters along an edge, one cluster floating on its own, a card, or a card
 * slid out over the canvas.
 */
export type RegionKind = "canvas" | "row" | "float" | "panel" | "drawer";

/** What the legend says about a part: its name, its line, and when it is there. */
export interface LayoutPart {
	/**
	 * The legend's name for it, and the key tying it to its row. Absent, it is
	 * drawn and not listed.
	 */
	name?: string;
	/** One line for the legend. Inline markup, so it can link to a page. */
	what?: string;
	/** Beside the name in the legend: when it is there, if not always. */
	where?: string;
}

/** One cluster of a row: its controls, drawn as the editor draws them. */
export interface LayoutCluster extends LayoutPart {
	items: ToolbarItem[];
	/** A class beside `tool-group`: `mark-group`, `graph-tabs`. */
	wrap?: string;
	/** The flexible gap before it, which pushes it to the far end. */
	apart?: boolean;
}

/**
 * A card's contents, by what the card is. Each is drawn in the markup of the
 * component that draws the real one, with the demo project's contents.
 */
export type LayoutCard =
	/** The Project card: `App.tsx`'s heading over `ProjectTree`'s rows. */
	| { t: "project"; project: string; rows: ToolbarItem[] }
	/** The Variables card with nothing declared yet. */
	| { t: "variables" }
	/** The Inspector with nothing selected: `GraphSettings`. */
	| { t: "graphSettings"; graph: string; scriptClass: string; nodes: number; functions: number }
	/** The status pill: `StatusPanel`'s bar and its first entry. */
	| { t: "status"; errors: number; warnings: number; entry?: string }
	/** The side strip, along the bottom or down the left edge: `CanvasStrip`. */
	| { t: "strip"; vertical?: boolean }
	/** The bar along the bottom on a touch screen: `Workspace`'s, with `TouchBar`'s actions. */
	| { t: "bottomBar"; cards: boolean; actions: [string, string][] }
	/** Node Design's node list: `PackView`'s aside. */
	| { t: "packList"; pack: string; nodes: [string, string][] }
	/** The pack bar on a touch screen: `PackView`'s, with `NodeEditor`'s switches on a phone. */
	| { t: "packBar"; pack: string; node: string; views?: boolean }
	/** The node's plate: the title bar and its fold, the plate and the pin counts. */
	| { t: "plate"; title?: string; counts: "buttons" | "popout" }
	/** The selected pin's editor, docked under the plate: `PinPopover`. */
	| { t: "pinEditor"; pin: string; type: string; logic: string }
	/** Logic written as Luau: the sheet it is typed in. */
	| { t: "luau"; code: string }
	/** The logic's head: the word and the Luau | Nodes switch. */
	| { t: "logicHead" }
	/** What stops the node saving, or that nothing does: `node-problems`. */
	| { t: "problems"; text: string };

export interface LayoutRegion extends LayoutPart {
	kind: RegionKind;
	/**
	 * Grid lines it spans: row start and end, column start and end. Lines
	 * rather than named areas, because a floating region shares its cells with
	 * the canvas underneath it, and named areas cannot overlap.
	 */
	at: [number, number, number, number];
	/** Which end of its cells it sits at, across. */
	place?: "start" | "center" | "end";
	/** Which end of its cells it sits at, down. Absent: it fills them. */
	align?: "start" | "center" | "end";
	/** A row of clusters, each numbered on its own: the top row. */
	clusters?: LayoutCluster[];
	/** One cluster on its own: the Node Design palette, the logic's tools. */
	items?: ToolbarItem[];
	/** A class beside the cluster's `tool-group`. */
	wrap?: string;
	/** A card, in its component's markup. */
	card?: LayoutCard;
	/** The canvas's word in its corner, as `.watermark` draws it: Script, Events. */
	watermark?: [string, string];
}

export interface LayoutSpec {
	/** Stable; derives the exported constant's name, as a toolbar's does. */
	id: string;
	title: string;
	/** One line under the picture: what window this is, and on what. */
	summary: string;
	/** A window on a computer, a tablet held sideways, or a phone held upright. */
	device: "desktop" | "tablet" | "phone";
	/**
	 * A class the window itself carries, which the editor's stylesheet scopes
	 * some of its rules by: Node Design's badges are `.designer .badge`.
	 */
	screenClass?: string;
	/** `grid-template-columns`, in the screen's own pixels. */
	columns: string;
	/** `grid-template-rows`, in the screen's own pixels. */
	rows: string;
	regions: LayoutRegion[];
}

/**
 * The window each device is drawn as, in CSS pixels, and how far it is scaled
 * down to sit on a page. A computer's is a 1600-by-900 window; a tablet's an
 * iPad held sideways; a phone's a 393-point iPhone.
 */
export const SCREEN: Record<LayoutSpec["device"], { width: number; height: number; zoom: number }> =
	{
		desktop: { width: 1600, height: 900, zoom: 0.5 },
		tablet: { width: 1133, height: 744, zoom: 0.55 },
		phone: { width: 393, height: 852, zoom: 0.68 },
	};

/** Every part the legend lists, in the order they are numbered: clusters inside their row. */
export function listedRegions(spec: LayoutSpec): (LayoutPart & { name: string })[] {
	return spec.regions
		.flatMap((region): LayoutPart[] => (region.clusters ? region.clusters : [region]))
		.filter((part): part is LayoutPart & { name: string } => part.name !== undefined);
}

/** Every glyph a diagram draws, for the test that holds them against the icon set. */
export function layoutIcons(spec: LayoutSpec): string[] {
	const glyphsOf = (items: ToolbarItem[]) =>
		items.flatMap((item) =>
			(item.t === "icon" || item.t === "button" || item.t === "treeRow") && item.icon
				? [item.icon]
				: item.t === "popout"
					? [...(item.icon ? [item.icon] : []), "chevron"]
					: item.t === "mark" && item.glyph
						? [item.glyph]
						: [],
		);
	return spec.regions.flatMap((region) => [
		...glyphsOf(region.items ?? []),
		...(region.clusters ?? []).flatMap((cluster) => glyphsOf(cluster.items)),
		...(region.card?.t === "project" ? glyphsOf(region.card.rows) : []),
	]);
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

// ---------------------------------------------------------------------------
// Drawing one
// ---------------------------------------------------------------------------

/**
 * A region that holds real markup gives up the diagram box's own paint, so
 * the markup's is what shows.
 */
const BARE =
	"display:block;padding:0;margin:0;border:0;background:none;box-shadow:none;overflow:visible;color:inherit;" +
	"position:relative;min-width:0;min-height:0";

/**
 * A card's dock, in place rather than positioned over a window: `.dock` and
 * `.dock > .panel` give the card its look, and only where it sits is undone.
 */
const IN_PLACE =
	"position:relative;inset:auto;left:auto;right:auto;top:auto;bottom:auto;transform:none;" +
	"width:100%;height:100%;max-height:none;max-width:none;z-index:auto;pointer-events:auto";

/** A control in a picture: never a tab stop, never pressed. */
const INERT = ` tabindex="-1"`;

function tie(part: LayoutPart): string {
	return part.name
		? ` data-control="${escapeXml(controlKey(part.name))}" data-name="${escapeXml(part.name)}"`
		: "";
}

/** A text box or a dropdown, as the editor draws one, holding its value. */
function input(value: string, cls = "tb"): string {
	return `<input class="${cls}"${INERT} readonly value="${escapeXml(value)}" style="pointer-events:none">`;
}

function select(value: string, cls = "tb"): string {
	return `<select class="${cls}"${INERT} style="pointer-events:none"><option>${escapeXml(value)}</option></select>`;
}

function field(label: string, control: string): string {
	return `<label class="field"><span>${escapeXml(label)}</span>${control}</label>`;
}

const DOCK_BUTTON = `<button type="button" class="tb icon-only panel-float"${INERT}>⇥</button>`;

/** A card the editor's window draws; Node Design's are `designerCardHtml`. */
function cardHtml(card: LayoutCard, art: ToolbarArt): string {
	const dock = (inner: string) => `<div class="dock" style="${IN_PLACE}">${inner}</div>`;
	switch (card.t) {
		case "project":
			return dock(
				`<div class="panel panel-tree" style="max-height:100%">${DOCK_BUTTON}` +
					`<h2 class="project-head"><span class="project-name">${escapeXml(card.project)}</span>` +
					`<span class="segmented project-views"><button type="button" class="on"${INERT}>Files</button>` +
					`<button type="button"${INERT}>DataModel</button></span></h2>` +
					`<div class="tree">${itemsHtml(card.rows, art)}</div></div>`,
			);
		case "variables":
			return dock(
				`<div class="panel panel-variables">${DOCK_BUTTON}<div class="variables">` +
					`<h2><span>Variables</span><button type="button" class="tb"${INERT}>Add</button></h2>` +
					`<div class="variable-list"><p class="hint">None yet. A variable is a value the whole ` +
					`script can read and write, as opposed to a local, which only exists inside the block ` +
					`that declared it.</p>` +
					`<h3 class="variables-sub"><span>Modules</span><button type="button" class="tb"${INERT}>Add</button></h3>` +
					`<p class="hint">None. A module is required once at the top of the generated file and ` +
					`read wherever you drag it — so four uses write one <code>require</code>.</p></div></div></div>`,
			);
		case "graphSettings":
			return dock(
				`<div class="panel panel-inspector">${DOCK_BUTTON}<div class="inspector graph-settings"><h2>Graph</h2>` +
					`<div class="inspector-body"><div class="node-heading graph-heading">${escapeXml(card.graph)}` +
					`<small>${escapeXml(card.scriptClass)} · Roblox</small></div>` +
					field("Script", select(card.scriptClass)) +
					field("Type checking", select("Strict")) +
					field(
						"Target",
						`<span class="target-pick">${select("Roblox", "tb doc-target roblox")}</span>`,
					) +
					`<p class="graph-figures"><span><b>${card.nodes}</b> nodes</span>` +
					`<span><b>${card.functions}</b> functions</span></p>` +
					`<p class="summary">Select a node for its settings. With nothing selected, these are the graph's.</p>` +
					`</div></div></div>`,
			);
		case "status":
			return dock(
				`<div class="panel panel-analysis">${DOCK_BUTTON}<div class="status"><div class="bar">` +
					`<span>▾</span><span class="count"${card.errors ? ` style="color:var(--danger)"` : ""}>${card.errors} error${card.errors === 1 ? "" : "s"}</span>` +
					`<span class="count"${card.warnings ? ` style="color:var(--warning)"` : ""}>${card.warnings} warning${card.warnings === 1 ? "" : "s"}</span>` +
					`<span class="spacer" style="flex:1"></span></div>` +
					`${card.entry ? `<div class="list"><div class="entry warning"><span class="sev">warning</span><span>${escapeXml(card.entry)}</span></div></div>` : ""}` +
					`</div></div>`,
			);
		case "strip": {
			// Laid out as the editor lays it out on that kind of screen. The
			// stylesheet decides by the *reader's* pointer, so the picture of
			// a tablet would otherwise follow the mouse it is read with.
			const v = card.vertical;
			const rule = v ? "width:60%;height:1px;margin:3px 0" : "width:1px;height:60%;margin:0 3px";
			const button = (icon: string) =>
				`<button type="button" class="tb icon-only"${INERT}>${glyphHtml(icon, 16, art)}</button>`;
			return (
				`<div class="side-strip tool-group" style="position:static;transform:none;display:flex;` +
				`flex-direction:${v ? "column" : "row"};flex-wrap:nowrap;align-items:center;padding:${v ? "4px 3px" : "3px 6px"}">` +
				button("plus") +
				`<input class="strip-zoom" type="range"${INERT} min="10" max="300" value="100" style="pointer-events:none;` +
				`${v ? "writing-mode:vertical-lr;direction:rtl;width:22px;height:120px;margin:4px 0" : "writing-mode:horizontal-tb;width:120px;height:22px;margin:0 4px"}">` +
				button("minus") +
				`<button type="button" class="strip-percent"${INERT} style="min-width:3.4em">100%</button>` +
				`<span class="strip-rule" style="${rule}"></span>` +
				button("undo") +
				button("redo") +
				`<span class="strip-rule" style="${rule}"></span>` +
				button("fit") +
				`</div>`
			);
		}
		case "bottomBar": {
			// The card buttons are hidden by the stylesheet on a wide screen,
			// which is the reader's, so they are shown here outright.
			const toggle = (icon: string) =>
				`<button type="button" class="tb icon-only drawer-toggle"${INERT} style="display:inline-grid">` +
				`${glyphHtml(icon, 16, art)}</button>`;
			const actions = card.actions
				.map(
					([icon]) =>
						`<button type="button" class="tb icon-only"${INERT}>` +
						`${glyphHtml(icon, 16, art)}</button>`,
				)
				.join("");
			return (
				`<div class="drawer-toggles" style="position:static;transform:none;display:flex;max-width:none">` +
				`${card.cards ? toggle("panelLeft") : ""}` +
				`<div class="touch-bar"><div class="touch-bar-group">${actions}</div></div>` +
				`${card.cards ? toggle("panelRight") : ""}</div>`
			);
		}
		default:
			return designerCardHtml(card, art);
	}
}

type DesignerCard = Extract<
	LayoutCard,
	{ t: "packList" | "packBar" | "plate" | "pinEditor" | "luau" | "logicHead" | "problems" }
>;

/** A card Node Design draws, each inside the `.node-editor` its rules are scoped to. */
function designerCardHtml(card: DesignerCard, art: ToolbarArt): string {
	const editor = (inner: string) =>
		`<div class="node-editor" style="display:block;position:relative;width:100%;height:100%">${inner}</div>`;
	switch (card.t) {
		case "packList":
			return (
				`<div class="pack-view" style="display:block;position:relative;width:100%;height:100%">` +
				`<aside class="pack-nodes" style="position:relative;left:auto;top:auto;width:100%;max-height:none">` +
				`<button type="button" class="tb with-icon pack-back"${INERT}>` +
				`${glyphHtml("chevron", 14, art, 90)}Node packs</button>` +
				`<h1>${escapeXml(card.pack)}</h1>` +
				`<div class="pack-badges"><span class="badge">JSON</span><span class="badge">Roblox and Lune</span></div>` +
				`<div class="pack-requires"><span class="tool-label">Requires</span><span class="hint">Nothing else</span>${select("Add…")}</div>` +
				`<button type="button" class="tb primary with-icon"${INERT}>` +
				`${glyphHtml("newFile", 15, art)}New node</button>` +
				`<ul>${card.nodes
					.map(
						([title, id], i) =>
							`<li><button type="button" class="pack-node${i === 0 ? " on" : ""}"${INERT}>` +
							`<span class="swatch" style="background:#536a8c"></span><span class="title">${escapeXml(title)}</span>` +
							`<span class="id">${escapeXml(id)}</span></button></li>`,
					)
					.join("")}</ul></aside></div>`
			);
		case "packBar":
			return (
				`<div class="pack-view compact" style="display:block;position:relative">` +
				`<div class="pack-compact-bar" style="position:relative;top:auto;left:auto;width:max-content;max-width:none;display:flex;flex-wrap:nowrap;align-items:center;gap:8px">` +
				`<button type="button" class="tb with-icon"${INERT}>` +
				`${glyphHtml("chevron", 14, art, -90)}${escapeXml(card.pack)}</button>` +
				`<span class="pack-compact-current">${escapeXml(card.node)}</span>` +
				`${card.views ? `<span class="pack-compact-slot"><span class="segmented"><button type="button" class="on"${INERT}>Preview</button><button type="button"${INERT}>Logic</button></span></span>` : ""}` +
				`</div></div>`
			);
		case "plate": {
			const counts =
				card.counts === "popout"
					? itemsHtml([{ t: "popout", text: "Pins" }], art)
					: `<span class="tool-label">Inputs</span><button type="button" class="tb icon-only"${INERT}>−</button>` +
						`<button type="button" class="tb icon-only"${INERT}>+</button><span class="divider"></span>` +
						`<span class="tool-label">Outputs</span><button type="button" class="tb icon-only"${INERT}>−</button>` +
						`<button type="button" class="tb icon-only"${INERT}>+</button>`;
			const head = card.title
				? `<div class="plate-head"><span class="plate-title">${escapeXml(card.title)}</span>` +
					`<button type="button" class="tb icon-only"${INERT}>${glyphHtml("chevron", 14, art)}</button></div>`
				: "";
			return editor(
				`<div class="node-editor-stage" style="position:relative;inset:auto;top:auto;right:auto;width:100%;height:100%">` +
					head +
					`<div class="node-plate" style="left:8%;right:8%;top:${card.title ? "16%" : "30%"};bottom:${card.title ? "20%" : "32%"};width:auto;height:auto"></div>` +
					`<div class="plate-counts tool-group">${counts}</div></div>`,
			);
		}
		case "pinEditor":
			return editor(
				`<div class="pin-popover docked" style="position:relative;left:auto;top:auto;width:100%;height:100%;box-sizing:border-box">` +
					`<div class="pin-popover-head"><span class="chip-dot data" style="color:${escapeXml(art.pinColor?.(card.type, "data") ?? "currentColor")}"></span>` +
					`<strong>${escapeXml(card.pin)}</strong><span class="hint">input</span><span style="flex:1"></span>` +
					`<button type="button" class="tb icon-only"${INERT}>${glyphHtml("chevron", 14, art)}</button>` +
					`<button type="button" class="tb icon-only"${INERT}>${glyphHtml("close", 14, art)}</button></div>` +
					`<label><span>Name</span>${input(card.pin)}</label>` +
					`<div class="hint">In the logic: <code>${escapeXml(card.logic)}</code></div>` +
					`<label><span>Type</span>${select(card.type)}</label>` +
					`<label><span>Default</span>${select("Text")}</label>` +
					`<label><span>Choices</span>${input("Optional, comma separated")}</label>` +
					`<label><span>Tooltip</span>${input("Optional")}</label>` +
					`<div class="pin-popover-actions"><button type="button" class="tb"${INERT}>↑</button>` +
					`<button type="button" class="tb"${INERT}>↓</button><span style="flex:1"></span>` +
					`<button type="button" class="tb danger"${INERT}>Remove</button></div></div>`,
			);
		case "luau":
			return editor(
				`<div class="luau-field" style="position:relative;inset:auto;left:auto;right:auto;top:auto;bottom:auto;width:100%;height:100%;box-sizing:border-box;margin:0">` +
					`<div style="padding:8px 12px;font-family:var(--font-mono, monospace)">${escapeXml(card.code)}</div></div>`,
			);
		case "logicHead":
			return editor(
				`<div class="node-logic" style="position:relative;inset:auto;background:none">` +
					`<div class="logic-head" style="position:relative;left:auto;bottom:auto;display:inline-flex;align-items:center;gap:8px">` +
					`<strong>Logic</strong><div class="segmented"><button type="button" class="on"${INERT}>Luau</button>` +
					`<button type="button"${INERT}>Nodes</button></div></div></div>`,
			);
		case "problems":
			// At the right of its cell, as the real one sits at the right of the window.
			return (
				`<div class="node-editor" style="display:flex;flex-direction:row;justify-content:flex-end;position:relative;width:100%">` +
				`<div class="node-problems" style="position:relative;left:auto;right:auto;bottom:auto;width:max-content"><span>${escapeXml(card.text)}</span></div></div>`
			);
	}
}

/**
 * One cluster, with its tie and its number on a wrapper rather than on the
 * cluster: the tabs cluster scrolls, and would clip a number pinned inside it.
 */
function clusterHtml(
	items: ToolbarItem[],
	art: ToolbarArt,
	options: { wrap?: string; part?: LayoutPart; badge?: string },
): string {
	const group =
		`<div class="tool-group${options.wrap ? ` ${escapeXml(options.wrap)}` : ""}"` +
		` style="flex:none;flex-wrap:nowrap">${itemsHtml(items, art)}</div>`;
	return options.part
		? `<div style="position:relative;flex:none;display:flex"${tie(options.part)}>${options.badge ?? ""}${group}</div>`
		: group;
}

/**
 * The picture: the window, at its real size, scaled to the page. Its parts
 * are numbered as the legend numbers them.
 *
 * `aria-hidden`, as a toolbar's picture is: the legend under it says
 * everything the picture does, in order, and is what a screen reader reads.
 */
export function layoutHtml(spec: LayoutSpec, art: ToolbarArt): string {
	const screen = SCREEN[spec.device];
	const numbers = new Map<LayoutPart, number>(listedRegions(spec).map((part, i) => [part, i + 1]));
	// The number keeps its own size: the screen is scaled, the badge is read.
	const badgeOf = (part: LayoutPart) => {
		const n = numbers.get(part);
		return n === undefined
			? ""
			: `<span class="docs-layout-num" style="position:absolute;left:0;top:0;transform:translate(-25%, -25%);z-index:30;zoom:calc(1 / var(--z))">${n}</span>`;
	};

	const regions = spec.regions
		.map((region) => {
			const [r1, r2, c1, c2] = region.at;
			const place = region.place ? ` place-${region.place}` : "";
			const grid = `grid-row:${r1} / ${r2};grid-column:${c1} / ${c2}`;
			const align = region.align ? `;align-self:${region.align}` : "";
			const justify = region.place ? `;justify-self:${region.place}` : "";
			if (region.kind === "canvas") {
				const n = numbers.get(region);
				const watermark = region.watermark
					? `<div class="canvas" style="position:absolute;inset:0;background:none;pointer-events:none">` +
						`<div class="watermark"><small>${escapeXml(region.watermark[0])}</small>${escapeXml(region.watermark[1])}</div></div>`
					: "";
				return (
					`<div class="docs-layout-region kind-canvas" style="${grid};position:relative;border:0;border-radius:0;` +
					`align-content:center;justify-content:center"${tie(region)}>` +
					`${n === undefined ? "" : `<span class="docs-layout-num" style="zoom:calc(1 / var(--z))">${n}</span>`}${watermark}</div>`
				);
			}
			const open = (inner: string, part: LayoutPart | undefined, extra = "") =>
				`<div class="docs-layout-region kind-${region.kind}${place}" style="${grid};${BARE}${align}${justify};${extra}"` +
				`${part ? tie(part) : ""}>${inner}</div>`;
			if (region.clusters) {
				const row = region.clusters
					.map(
						(cluster) =>
							(cluster.apart ? `<span class="spacer"></span>` : "") +
							clusterHtml(cluster.items, art, {
								wrap: cluster.wrap,
								part: cluster,
								badge: badgeOf(cluster),
							}),
					)
					.join("");
				return open(
					`<div class="floating-tools" style="position:relative;inset:auto;top:auto;left:auto;right:auto;` +
						`width:100%;flex-wrap:nowrap;align-items:center;pointer-events:auto">${row}</div>`,
					undefined,
					// Over the cards, as the real chrome is over the docks: a badge on
					// a cluster was drawn under the card beside it.
					"position:relative;z-index:6",
				);
			}
			if (region.items) {
				return open(
					clusterHtml(region.items, art, { wrap: region.wrap }) + badgeOf(region),
					region,
				);
			}
			return open((region.card ? cardHtml(region.card, art) : "") + badgeOf(region), region);
		})
		.join("");

	// The window at its own size, scaled to the page. In a column narrower
	// than that the picture scrolls sideways, as a toolbar's does, rather than
	// squeezing a cluster onto two lines.
	// The bezel, as the stylesheet draws a device's: it is restated because
	// the stylesheet's device frames also size and shrink their contents.
	const bezel =
		spec.device === "tablet"
			? "border:10px solid var(--border-strong);border-radius:22px;"
			: spec.device === "phone"
				? "border:9px solid var(--border-strong);border-radius:28px;"
				: "";
	const corner = spec.device === "tablet" ? 12 : spec.device === "phone" ? 19 : 4;
	// The scale is the stylesheet's `--z`, stepped to the column's width so
	// a desktop or a tablet fills it; the desktop stands on a monitor.
	return (
		`<div class="docs-layout-fit"><div class="docs-layout-frame${spec.device === "desktop" ? " monitor" : ""}" aria-hidden="true"` +
		` style="display:block;width:max-content;max-width:none;aspect-ratio:auto;padding:0;margin:14px auto;${bezel}">` +
		`<div class="docs-layout-screen dev-${spec.device}${spec.screenClass ? ` ${escapeXml(spec.screenClass)}` : ""}" style="position:relative;overflow:visible;zoom:var(--z);width:${screen.width}px;height:${screen.height}px;` +
		`border-radius:calc(${corner}px / var(--z));display:grid;grid-template-columns:${escapeXml(spec.columns)};grid-template-rows:${escapeXml(spec.rows)};` +
		`background:var(--bg-canvas);font:13px/1.45 "Segoe UI", system-ui, -apple-system, sans-serif;color:var(--fg)">` +
		`${regions}</div></div></div>`
	);
}

// ---------------------------------------------------------------------------
// The demo project, as the cards show it
// ---------------------------------------------------------------------------

const folder = (label: string, depth: number, tone?: string): ToolbarItem => ({
	t: "treeRow",
	label,
	depth,
	twist: "open",
	icon: tone ? "folderOpenFilled" : "folderOpen",
	tone,
});

/** The demo project's tree, as the Project card lists it with Events open. */
const DEMO_TREE: ToolbarItem[] = [
	{ t: "treeSection", text: "Graph content" },
	folder(".roswaal", 1),
	folder("nodes", 2),
	{
		t: "treeRow",
		label: "example.nodedef.luau",
		depth: 3,
		icon: "luauScript",
		tone: "luau tree-script-module",
		readonly: true,
	},
	folder("scripts", 2),
	folder("ReplicatedStorage", 3, "tree-folder-special"),
	folder("ServerScriptService", 3, "tree-folder-special"),
	folder("StarterPlayer", 3, "tree-folder-special"),
	folder("StarterPlayerScripts", 4, "tree-folder-special"),
	{
		t: "treeRow",
		label: "Events.nodescript",
		depth: 3,
		icon: "document",
		tone: "nodescript",
		current: true,
	},
	{ t: "treeRow", label: "Game.nodemap", depth: 3, icon: "map", tone: "nodemap" },
	{ t: "treeSection", text: "Compile content" },
	folder("src", 1),
	folder("ReplicatedStorage", 2, "tree-folder-special"),
	folder("ServerScriptService", 2, "tree-folder-special"),
	folder("StarterPlayer", 2, "tree-folder-special"),
	folder("StarterPlayerScripts", 3, "tree-folder-special"),
	{
		t: "treeRow",
		label: "Events.server.luau",
		depth: 2,
		icon: "luauScript",
		tone: "luau",
		readonly: true,
		badge: "generated",
	},
];

const MARK: ToolbarItem = { t: "mark", window: true, version: true };
const PROJECT_CLUSTER: ToolbarItem[] = [
	{ t: "icon", icon: "panelLeft", on: true },
	{ t: "icon", icon: "refresh" },
	{ t: "icon", icon: "newFile" },
	{ t: "icon", icon: "map" },
];
const TOOLS_CLUSTER: ToolbarItem[] = [
	{ t: "icon", icon: "search" },
	{ t: "icon", icon: "layout" },
	{ t: "icon", icon: "straighten", on: true },
	{ t: "icon", icon: "terminal" },
];
const COMPILE_CLUSTER: ToolbarItem[] = [
	{ t: "segmented", options: ["Manual", "Dynamic"], on: 0 },
	{ t: "divider" },
	{ t: "button", text: "Compile project" },
	{ t: "button", text: "Compile script", icon: "build", primary: true },
];
const WINDOWS_CLUSTER: ToolbarItem[] = [
	{ t: "icon", icon: "panelRight", on: true },
	{ t: "divider" },
	{ t: "icon", icon: "document" },
	{ t: "icon", icon: "palette" },
	{ t: "icon", icon: "settings" },
];
const PALETTE: ToolbarItem[] = [
	{ t: "pinChip", text: "Execution" },
	...[
		"any",
		"boolean",
		"number",
		"string",
		"table",
		"function",
		"Instance",
		"Vector3",
		"CFrame",
		"Color3",
	].map((type): ToolbarItem => ({ t: "pinChip", text: type, type })),
];
const WARNING = '"Instance" is not connected to anything that runs.';

// ---------------------------------------------------------------------------
// The windows
// ---------------------------------------------------------------------------

/**
 * The editor on a computer, with Events open and nothing selected. Measured
 * from the real window at 1600 by 900: the clusters along the top, Project
 * and Variables down the left, the Inspector at the right as tall as what it
 * shows, the status pill and the side strip along the foot.
 *
 * The graph comes first so the rest is painted over it, which is why it is
 * the first number.
 */
export const EDITOR_LAYOUT: LayoutSpec = {
	id: "editor-layout",
	title: "The editor",
	summary: "The editor on a computer, with a graph open and nothing selected.",
	device: "desktop",
	columns: "10px 352px minmax(0, 1fr) 290px 8px",
	rows: "10px 38px 10px 498px 8px 182px minmax(0, 1fr) 62px 7px",
	regions: [
		{
			name: "The graph",
			kind: "canvas",
			at: [1, 10, 1, 6],
			watermark: ["Script", "Events"],
			what: "Fills the window; everything else floats over it. Every key and gesture it takes is on [Controls](controls).",
		},
		{
			kind: "row",
			at: [2, 3, 2, 5],
			clusters: [
				{
					wrap: "mark-group",
					items: [MARK],
					name: "The mark",
					what: "Opens your projects, the demos and the other windows. Beside it, the build.",
				},
				{
					items: PROJECT_CLUSTER,
					name: "The project",
					what: "The button for the Project and Variables cards, then Refresh, New graph and New node map.",
				},
				{
					wrap: "graph-tabs",
					items: [{ t: "tab", text: "Events", on: true }],
					name: "Tabs",
					what: "One per open graph.",
				},
				{
					items: TOOLS_CLUSTER,
					name: "Graph tools",
					what: "Add node, Realign, Straighten and Preview.",
				},
				{
					apart: true,
					items: COMPILE_CLUSTER,
					name: "Compiling",
					what: "Manual or Dynamic, Compile project, and Compile script for the open graph.",
				},
				{
					items: WINDOWS_CLUSTER,
					name: "Inspector and windows",
					what: "The button for the Inspector's card, then Docs, Node Design and Settings. Every button is on [Toolbars](toolbars).",
				},
			],
		},
		{
			name: "Project",
			kind: "panel",
			at: [4, 5, 2, 3],
			card: { t: "project", project: "onevent-proj", rows: DEMO_TREE },
			what: "The project's files: graphs, node maps, and the Luau compiled from them. With a place, its DataModel too. See [The Project panel](project-panel).",
		},
		{
			name: "Variables",
			kind: "panel",
			at: [6, 7, 2, 3],
			card: { t: "variables" },
			what: "What the open graph declares — variables, modules, functions and locals. Drag one onto the graph to use it.",
		},
		{
			name: "Inspector",
			kind: "panel",
			at: [4, 5, 4, 5],
			align: "start",
			card: { t: "graphSettings", graph: "Events", scriptClass: "Script", nodes: 6, functions: 0 },
			what: "With nothing selected, the graph's own settings: what it compiles to, its type checking and its target. Select a node for its settings instead.",
		},
		{
			name: "Script analysis",
			kind: "panel",
			at: [8, 9, 2, 4],
			place: "start",
			card: { t: "status", errors: 0, warnings: 1, entry: WARNING },
			what: "Errors and warnings in the open graph. The bar folds the list away.",
		},
		{
			name: "Side strip",
			kind: "float",
			at: [8, 9, 1, 6],
			place: "center",
			align: "end",
			card: { t: "strip" },
			what: "Zoom in, the zoom slider and zoom out, back to 100%, undo and redo, and fitting the graph to the window.",
		},
	],
};

/**
 * The editor on a tablet held sideways: a touch screen, so the cards slide
 * out over the graph one side at a time, the side strip stands down the left
 * edge, and the edits a keyboard makes are a bar along the bottom.
 *
 * Written from `Workspace.tsx` and the stylesheet rather than from a capture:
 * a desktop browser has a mouse, and lays the window out for one.
 */
export const EDITOR_LAYOUT_TOUCH: LayoutSpec = {
	id: "editor-layout-touch",
	title: "The editor, on a tablet",
	summary:
		"The editor on a tablet held sideways, with the Inspector slid out and nothing selected.",
	device: "tablet",
	columns: "10px 64px minmax(0, 1fr) 340px 10px",
	rows: "10px 38px 10px minmax(0, 1fr) 62px 10px",
	regions: [
		{
			name: "The graph",
			kind: "canvas",
			at: [1, 7, 1, 6],
			watermark: ["Script", "Events"],
			what: "One finger pans and two pinch; press and hold to select a group. Tap with two fingers to undo, three to redo. The rest is on [Controls](controls).",
		},
		{
			kind: "row",
			at: [2, 3, 2, 5],
			clusters: [
				{ wrap: "mark-group", items: [MARK], name: "The mark", what: "As on a computer." },
				{
					items: PROJECT_CLUSTER.map((item) =>
						item.t === "icon" && item.on ? { ...item, on: false } : item,
					),
					name: "The project",
					what: "As on a computer; Project and Variables slide out over the graph. Held upright, Refresh and the New buttons are in **More**.",
				},
				{
					wrap: "graph-tabs",
					items: [{ t: "tab", text: "Events", on: true }],
					name: "Tabs",
					what: "One per open graph.",
				},
				{ items: TOOLS_CLUSTER, name: "Graph tools", what: "As on a computer." },
				{
					apart: true,
					items: COMPILE_CLUSTER,
					name: "Compiling",
					what: "As on a computer. Held upright, only Compile script stays, as its icon.",
				},
				{
					items: WINDOWS_CLUSTER,
					name: "Inspector and windows",
					what: "The Inspector slides out from the right. Held upright, Docs, Node Design and Settings are in **More**.",
				},
			],
		},
		{
			name: "Side strip",
			kind: "float",
			at: [4, 5, 2, 3],
			place: "start",
			align: "center",
			card: { t: "strip", vertical: true },
			what: "Down the left edge, under a thumb.",
		},
		{
			name: "A card, slid out",
			kind: "drawer",
			at: [4, 6, 4, 5],
			align: "start",
			card: { t: "graphSettings", graph: "Events", scriptClass: "Script", nodes: 6, functions: 0 },
			what: "Project, Variables and the Inspector come out over the graph one side at a time. Tap the graph beside one to put it away.",
		},
		{
			name: "Script analysis",
			kind: "panel",
			at: [5, 6, 2, 4],
			place: "start",
			card: { t: "status", errors: 0, warnings: 1, entry: WARNING },
			what: "As on a computer.",
		},
		{
			name: "Action row",
			kind: "float",
			at: [5, 6, 3, 4],
			place: "center",
			align: "end",
			card: {
				t: "bottomBar",
				cards: false,
				actions: [
					["undo", "Undo"],
					["redo", "Redo"],
				],
			},
			what: "The edits a keyboard makes, as buttons; more of them while something is selected. Each one is named below.",
			where: "Touch screens only",
		},
	],
};

/**
 * The editor on a phone, held upright: the top row keeps the mark, the open
 * graph's tab, Compile script and More, and the card buttons are at the ends
 * of the bar along the bottom. Measured from the real window at 500 wide, the
 * narrowest a desktop browser goes, and drawn at a phone's 393.
 */
export const EDITOR_LAYOUT_PHONE: LayoutSpec = {
	id: "editor-layout-phone",
	title: "The editor, on a phone",
	summary: "The editor on a phone, with a graph open and nothing selected.",
	device: "phone",
	columns: "6px minmax(0, 1fr) 6px",
	rows: "10px 40px minmax(0, 1fr) 62px 10px 38px 12px",
	regions: [
		{
			name: "The graph",
			kind: "canvas",
			at: [1, 8, 1, 4],
			watermark: ["Script", "Events"],
			what: "The same gestures as on a tablet; see [Controls](controls). There is no side strip: pinch to zoom.",
		},
		{
			kind: "row",
			at: [2, 3, 2, 3],
			clusters: [
				{
					wrap: "mark-group",
					items: [{ t: "mark", window: true, glyph: "graph" }],
					name: "The mark",
					what: "With a grey graph beside it, to say this is the editor. It opens your projects.",
				},
				{
					wrap: "graph-tabs",
					items: [{ t: "tab", text: "Events", on: true, closable: false }],
					name: "The open graph",
					what: "Its tab. The others are in a list beside it.",
				},
				{
					apart: true,
					items: [{ t: "icon", icon: "build", primary: true }],
					name: "Compile script",
					what: "As its icon.",
				},
				{
					items: [{ t: "popout", icon: "more" }],
					name: "More",
					what: "The rest of a computer's row, with Add node and Preview.",
				},
			],
		},
		{
			name: "Script analysis",
			kind: "panel",
			at: [4, 5, 2, 3],
			place: "start",
			card: { t: "status", errors: 0, warnings: 1, entry: WARNING },
			what: "Above the bar.",
		},
		{
			name: "Bottom bar",
			kind: "float",
			at: [6, 7, 2, 3],
			place: "center",
			card: {
				t: "bottomBar",
				cards: true,
				actions: [
					["undo", "Undo"],
					["redo", "Redo"],
				],
			},
			what: "Project and Variables at its left end, the Inspector at its right: each slides up over the graph. Between them, the action row.",
		},
	],
};

/**
 * Node Design on a computer, with a node open and a pin selected. Measured
 * from the real window at 1600 by 900: the node list at the left, the Luau
 * filling the middle, the node on its plate in the top-right corner with the
 * pin's editor under it, and the palette, the problems and the logic's head
 * along the foot.
 */
export const DESIGNER_LAYOUT: LayoutSpec = {
	id: "designer-layout",
	title: "Node Design",
	summary:
		"Node Design on a computer, with a node open, its logic written as Luau, and a pin selected.",
	device: "desktop",
	screenClass: "designer",
	columns: "10px 260px 10px 790px 10px 512px 8px",
	rows: "10px 38px 10px 368px 10px 303px minmax(0, 1fr) 35px 8px 39px 10px",
	regions: [
		{
			name: "Logic",
			kind: "canvas",
			at: [1, 12, 1, 8],
			what: "Behind everything: what the node does when it runs, as the graph its nodes build. Written as Luau, the sheet below is in front of it.",
		},
		{
			kind: "row",
			at: [2, 3, 2, 7],
			clusters: [
				{
					wrap: "mark-group",
					items: [{ t: "mark", window: true, text: "Node Design", version: true }],
					name: "The mark",
					what: "Which window this is. It opens your projects and the other windows.",
				},
				{
					apart: true,
					items: [
						{ t: "button", text: "Details", icon: "rename" },
						{ t: "divider" },
						{ t: "badge", text: "Impure" },
						{ t: "divider" },
						{ t: "icon", icon: "remove" },
						{ t: "button", text: "Saved", icon: "build", primary: true },
					],
					name: "Node actions",
					what: "Details, the node's kind, delete, and Save. Each is on [Toolbars](toolbars).",
					where: "With a node open",
				},
				{
					items: [
						{ t: "icon", icon: "help" },
						{ t: "icon", icon: "document" },
						{ t: "icon", icon: "graph" },
						{ t: "icon", icon: "settings" },
					],
					name: "Other windows",
					what: "How custom nodes work, Docs, the editor, and Settings.",
				},
			],
		},
		{
			name: "Node list",
			kind: "panel",
			at: [4, 7, 2, 3],
			align: "start",
			card: {
				t: "packList",
				pack: "example-copy",
				nodes: [
					["Log With Prefix", "example_copy.logWithPrefix"],
					["Doubled", "example_copy.doubled"],
				],
			},
			what: "The pack's nodes, what it requires, and a new node. Back to every pack from its top.",
		},
		{
			name: "Luau",
			kind: "panel",
			at: [4, 8, 4, 5],
			card: { t: "luau", code: "print($in.prefix, $in.message)" },
			what: "The logic as a template. Built from nodes instead, the graph behind it shows.",
		},
		{
			name: "The node",
			kind: "panel",
			at: [4, 5, 6, 7],
			card: { t: "plate", title: "Log With Prefix", counts: "buttons" },
			what: "On a plate, as a graph will draw it, with its pin counts under it. Click a pin to edit it; the title bar folds the plate away.",
		},
		{
			name: "Pin editor",
			kind: "panel",
			at: [6, 7, 6, 7],
			card: { t: "pinEditor", pin: "Prefix", type: "string", logic: "$in.prefix" },
			what: "The selected pin's name, type, default, choices and tooltip. **Details**, when on, is a card under it.",
			where: "With a pin selected",
		},
		{
			name: "Problems",
			kind: "panel",
			at: [8, 9, 6, 7],
			card: { t: "problems", text: "Saved, and the project loads it." },
			what: "What stops the node saving, or that it is ready to.",
		},
		{
			name: "Logic head",
			kind: "float",
			at: [10, 11, 4, 5],
			place: "start",
			card: { t: "logicHead" },
			what: "Write the logic as Luau, or build it from nodes. Built from nodes, Add node, Realign, Straighten and Preview join it.",
		},
		{
			name: "Pin types",
			kind: "float",
			at: [10, 11, 4, 7],
			place: "end",
			align: "center",
			items: PALETTE,
			wrap: "pin-palette",
			what: "Drag one onto the node: the left half adds an input, the right half an output.",
		},
	],
};

/**
 * Node Design on a tablet held sideways: a touch screen, so the node list is
 * behind the pack bar. Written from the stylesheet, as the editor's tablet
 * picture is.
 */
export const DESIGNER_LAYOUT_TOUCH: LayoutSpec = {
	id: "designer-layout-touch",
	title: "Node Design, on a tablet",
	summary: "Node Design on a tablet held sideways, with a node open and its logic written as Luau.",
	device: "tablet",
	screenClass: "designer",
	columns: "10px minmax(0, 1fr) 10px 470px 10px",
	rows: "10px 38px 10px 44px 8px 330px minmax(0, 1fr) 35px 8px 39px 10px",
	regions: [
		{
			name: "Logic",
			kind: "canvas",
			at: [1, 12, 1, 6],
			what: "As on a computer, with the touch gestures on [Controls](controls).",
		},
		{
			kind: "row",
			at: [2, 3, 2, 5],
			clusters: [
				{
					wrap: "mark-group",
					items: [{ t: "mark", window: true, text: "Node Design", version: true }],
					name: "The mark",
					what: "As on a computer.",
				},
				{
					apart: true,
					items: [
						{ t: "button", text: "Details", icon: "rename" },
						{ t: "divider" },
						{ t: "badge", text: "Impure" },
						{ t: "divider" },
						{ t: "icon", icon: "remove" },
						{ t: "button", text: "Saved", icon: "build", primary: true },
					],
					name: "Node actions",
					what: "As on a computer.",
					where: "With a node open",
				},
				{
					items: [
						{ t: "icon", icon: "help" },
						{ t: "icon", icon: "document" },
						{ t: "icon", icon: "graph" },
						{ t: "icon", icon: "settings" },
					],
					name: "Other windows",
					what: "As on a computer. They open in this tab, and the back button returns.",
				},
			],
		},
		{
			name: "Pack bar",
			kind: "float",
			at: [4, 5, 2, 3],
			place: "start",
			card: { t: "packBar", pack: "example-copy", node: "Log With Prefix" },
			what: "The pack, which slides its node list out over the editor, and the open node.",
			where: "Touch screens only",
		},
		{
			name: "Luau",
			kind: "panel",
			at: [6, 8, 2, 3],
			card: { t: "luau", code: "print($in.prefix, $in.message)" },
			what: "As on a computer.",
		},
		{
			name: "The node",
			kind: "panel",
			at: [4, 7, 4, 5],
			card: { t: "plate", title: "Log With Prefix", counts: "buttons" },
			what: "On its plate, as on a computer.",
		},
		{
			name: "Problems",
			kind: "panel",
			at: [8, 9, 4, 5],
			card: { t: "problems", text: "Saved, and the project loads it." },
			what: "As on a computer.",
		},
		{
			name: "Logic head",
			kind: "float",
			at: [10, 11, 2, 3],
			place: "start",
			card: { t: "logicHead" },
			what: "As on a computer.",
		},
		{
			name: "Pin types",
			kind: "float",
			at: [10, 11, 2, 5],
			place: "end",
			align: "center",
			items: PALETTE.slice(0, 7),
			wrap: "pin-palette",
			what: "As on a computer. At this width the real row wraps onto a second line; the first is drawn.",
		},
	],
};

/**
 * Node Design on a phone, showing a node rather than its logic: the node and
 * its logic take turns, switched from the pack bar. Measured from the real
 * window at 500 wide and drawn at a phone's 393.
 */
export const DESIGNER_LAYOUT_PHONE: LayoutSpec = {
	id: "designer-layout-phone",
	title: "Node Design, on a phone",
	summary: "Node Design on a phone, showing a node rather than its logic.",
	device: "phone",
	screenClass: "designer",
	columns: "6px minmax(0, 1fr) 6px",
	rows: "10px 40px 8px 44px minmax(0, 1fr) 38px 10px 40px 8px",
	regions: [
		{
			name: "The node, or its logic",
			kind: "canvas",
			at: [5, 10, 1, 4],
			what: "One at a time, with the whole screen.",
		},
		{
			kind: "row",
			at: [2, 3, 2, 3],
			clusters: [
				{
					wrap: "mark-group",
					items: [{ t: "mark", window: true, glyph: "palette" }],
					name: "The mark",
					what: "With a grey palette beside it, to say this is Node Design.",
				},
				{
					apart: true,
					items: [
						{ t: "icon", icon: "rename" },
						{ t: "divider" },
						{ t: "popout", text: "Impure" },
						{ t: "icon", icon: "build", primary: true },
					],
					name: "Node actions",
					what: "Details and Save as their icons; the node's kind, and delete, behind a button that names the kind.",
					where: "With a node open",
				},
				{
					items: [{ t: "popout", icon: "more" }],
					name: "More",
					what: "How custom nodes work, Docs, the editor and Settings.",
				},
			],
		},
		{
			name: "Pack bar",
			kind: "float",
			at: [4, 5, 2, 3],
			place: "start",
			card: { t: "packBar", pack: "example-copy", node: "Log With Prefix", views: true },
			what: "As on a tablet, with the switch between the node and its logic.",
		},
		{
			name: "The node",
			kind: "panel",
			at: [5, 7, 2, 3],
			card: { t: "plate", counts: "popout" },
			what: "On its plate; **Pins** under it holds the pin counts.",
			where: "With the node showing",
		},
		{
			name: "Problems",
			kind: "panel",
			at: [6, 7, 2, 3],
			card: { t: "problems", text: "Saved, and the project loads it." },
			what: "As on a computer, beside **Pins**.",
		},
		{
			name: "Pin types",
			kind: "float",
			at: [8, 9, 2, 3],
			place: "center",
			items: [{ t: "popout", text: "Types" }],
			wrap: "pin-palette",
			what: "The types to drag onto the node, behind a button. A type still drags out of its list.",
			where: "With the node showing",
		},
	],
};

/** Every window the documentation draws, in the order the page draws them. */
export const LAYOUTS: LayoutSpec[] = [
	EDITOR_LAYOUT,
	EDITOR_LAYOUT_TOUCH,
	EDITOR_LAYOUT_PHONE,
	DESIGNER_LAYOUT,
	DESIGNER_LAYOUT_TOUCH,
	DESIGNER_LAYOUT_PHONE,
];
