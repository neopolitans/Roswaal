/**
 * Where the panels are.
 *
 * The state half of the dock system designed in `docs/PANELS.md`. Pure data and
 * pure functions: nothing here touches the DOM, so the whole layout can be
 * reasoned about — and tested — without rendering anything.
 *
 * ## Three objects and one derivation
 *
 * `panels` says which dock each panel is in and whether it is open. `docks`
 * says how big each dock is. `gridAreas()` derives everything visible from
 * those two. Left, right and bottom are the docks an editor's user already
 * knows, and matching them is deliberate: a layout should not need learning.
 *
 * Nothing else decides where anything goes, so when the layout is wrong there
 * is one function to read rather than a trail of style mutations to
 * reconstruct.
 *
 * ## The centre is not a dock
 *
 * It always exists, it cannot be closed, and it is what the docks surround.
 * Making it a fourth dock would mean every rule here needs a special case for
 * "the one you cannot get rid of", which is a worse trade than naming it apart.
 */

/** Docks, in the order they wrap the centre. */
export type DockSide = "left" | "right" | "bottom";

export const DOCK_SIDES: DockSide[] = ["left", "right", "bottom"];

/**
 * The panels Roswaal has.
 *
 * A closed union rather than open strings: a layout restored from an older
 * version can name a panel that no longer exists, and the difference between
 * "drop it" and "render nothing, silently" is whether the type says which
 * names are real.
 */
export type PanelId = "tree" | "variables" | "inspector" | "properties" | "analysis" | "code";

export const PANEL_IDS: PanelId[] = [
	"tree",
	"variables",
	"inspector",
	"properties",
	"analysis",
	"code",
];

export interface PanelState {
	dock: DockSide;
	open: boolean;
	/** Position within its dock. Renumbered wholesale on every move. */
	order: number;
	/**
	 * Out of the docks and over the graph, in a window of its own.
	 *
	 * A dock is a column: it takes width from the canvas for as long as it is
	 * open, and everything in it is as wide as the widest thing in it. A window
	 * is the other trade — it covers the graph, and it is exactly as big as you
	 * drag it. Variables is the panel this was asked for, because a list of
	 * names and types wants width in bursts and none the rest of the time.
	 *
	 * `dock` is kept while floating, so docking again puts the panel back where
	 * it came from rather than in whichever dock is first.
	 */
	floating: boolean;
	/** Where the window sits over the centre, and how big. Pixels. */
	frame: PanelFrame;
	/**
	 * The panel whose card this one is a tab of. Absent, it heads a card of its
	 * own. A tab's `dock`, `floating` and `frame` follow its head's, so moving
	 * a card moves every tab in it.
	 */
	tabOf?: PanelId;
	/** A card's share of its dock's height against the other cards. Read on the head. */
	weight?: number;
	/** A card folded to its header. Read on the head. */
	folded?: boolean;
	/** The tab a card shows. Read on the head; absent, its first. */
	active?: PanelId;
}

/** One card: its head, its tabs in order with the head first, and what it shows. */
export interface Card {
	head: PanelId;
	tabs: PanelId[];
	active: PanelId;
	weight: number;
	folded: boolean;
}

export interface PanelFrame {
	/** From the centre's top-left, not the window's: a dock is not the screen. */
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Smallest a floating panel may be dragged to, so its heading survives. */
export const MIN_FLOAT = { w: 200, h: 140 };

/**
 * Where a window opens when nothing has moved it yet.
 *
 * Inset from the top-left of the graph rather than centred: a window that opens
 * in the middle covers whatever you were looking at, and the first thing
 * anybody does with one is drag it out of the way. Low enough to clear the
 * tools that float across the top of the canvas.
 */
export const DEFAULT_FRAME: PanelFrame = { x: 28, y: 64, w: 320, h: 420 };

export interface DockState {
	/**
	 * Pixels along the axis the dock resizes on — width for the sides, height
	 * for the bottom.
	 */
	size: number;
	/** Closed entirely, regardless of what its panels say. */
	open: boolean;
}

export interface Layout {
	panels: Record<PanelId, PanelState>;
	docks: Record<DockSide, DockState>;
}

/**
 * Where everything sits before anybody moves it.
 *
 * Chosen to be exactly what the editor looked like before it had docks: the
 * tree and variables on the left, the inspector on the right, the analysis
 * panel along the bottom. A layout feature whose first act is to rearrange your
 * editor is a layout feature you fight.
 */
export const DEFAULT_LAYOUT: Layout = {
	panels: {
		tree: { dock: "left", open: true, order: 0, floating: false, frame: DEFAULT_FRAME, weight: 3 },
		variables: {
			dock: "left",
			open: true,
			order: 1,
			floating: false,
			frame: DEFAULT_FRAME,
			weight: 2,
		},
		inspector: {
			dock: "right",
			open: true,
			order: 0,
			floating: false,
			frame: DEFAULT_FRAME,
			weight: 3,
		},
		// A place instance's properties, under the Inspector: there only once
		// one is opened from the DataModel browser.
		properties: {
			dock: "right",
			open: true,
			order: 1,
			floating: false,
			frame: DEFAULT_FRAME,
			weight: 2,
		},
		analysis: { dock: "bottom", open: true, order: 0, floating: false, frame: DEFAULT_FRAME },
		// The code of a Code Block, a Luau Expression or a type, a tab per
		// field, along the foot of the graph between the side columns. Shut
		// until a field is opened, which opens it; see `isFoot`.
		code: {
			dock: "bottom",
			open: false,
			order: 1,
			floating: false,
			frame: { x: 28, y: 64, w: 560, h: 360 },
			// An even share of a side column, if it is moved to one.
			weight: 3,
		},
	},
	docks: {
		left: { size: 260, open: true },
		right: { size: 290, open: true },
		// The strip along the foot: the Code panel's height, which its top edge drags.
		bottom: { size: 300, open: true },
	},
};

/**
 * The foot's height before 0.155.0, which nothing drew: the bottom dock was
 * the status pill alone, sized by what it said. A stored layout carries it
 * untouched, and it is too short for code, so it is read as no choice made.
 */
const UNCHOSEN_FOOT = 190;

export const PANEL_TITLES: Record<PanelId, string> = {
	tree: "Project",
	variables: "Variables",
	inspector: "Inspector",
	properties: "Properties",
	analysis: "Script analysis",
	code: "Code",
};

/**
 * When the side docks are drawers over the graph rather than columns beside
 * it: a phone either way up, or any touch screen. On an iPad the docks as
 * columns left the graph a strip down the middle, and a finger wants the
 * graph more than a tree it opens a file from once.
 *
 * A touch screen is `hover: none` and `pointer: coarse` together, which is
 * what a tablet reports and a laptop with a touch screen does not — its
 * primary pointer is the trackpad. The docs ask the same question in
 * `theme.css`, for their contents.
 */
export const COMPACT_QUERY =
	"(max-width: 699px), (max-height: 479px), (hover: none) and (pointer: coarse)";

/** Smallest a dock may be dragged to before it is worth closing instead. */
export const MIN_DOCK = 140;

/**
 * The graph's share, which nothing may take.
 *
 * A dock size restored from a larger monitor can otherwise leave no centre pane
 * at all -- and that puts the splitter that would fix it off screen, making the
 * editor unusable in a way that survives a reload.
 */
const MIN_CENTRE = 320;

/**
 * The panels in one dock, in order, open ones only.
 *
 * Ordering is by `order` and then by id, so two panels that somehow share an
 * order still come out in a stable sequence rather than in whatever order the
 * object happened to iterate.
 */
export function panelsIn(layout: Layout, side: DockSide): PanelId[] {
	return PANEL_IDS.filter(
		(id) =>
			layout.panels[id].dock === side && layout.panels[id].open && !layout.panels[id].floating,
	).sort((a, b) => layout.panels[a].order - layout.panels[b].order || a.localeCompare(b));
}

/**
 * Is this dock drawn at all?
 *
 * A dock with nothing in it is not a thin empty strip, it is absent — and it
 * has to be genuinely absent rather than zero-sized, because a zero-width track
 * still shows its border and reads as a rendering fault.
 */
export function dockVisible(layout: Layout, side: DockSide): boolean {
	return layout.docks[side].open && panelsIn(layout, side).length > 0;
}

/** How thick a splitter is, in pixels. Its hit area is larger; see the CSS. */
export const SPLITTER = 5;

/**
 * The grid tracks for the workspace: five columns and three rows.
 *
 * Each dock is followed (or preceded) by its splitter's own track, so the
 * splitter is a real grid item on a boundary rather than something positioned
 * over one. A splitter that floated on top would need the dock's size in two
 * places and would drift from it by a pixel at some zoom level.
 *
 * **Every dock track is `minmax(0, …)`.** A grid item's automatic minimum size
 * is its *content*, so a dock holding one long path otherwise refuses to shrink
 * below the width of that path — the splitter drags outwards freely and will
 * not come back. This is the single most likely thing to be removed by accident
 * while tidying, and it is why the numbers are built here rather than written
 * in the stylesheet.
 */
export function gridTemplate(layout: Layout): { columns: string; rows: string } {
	const track = (side: DockSide) =>
		dockVisible(layout, side) ? `minmax(0, ${layout.docks[side].size}px)` : "0px";
	// A splitter with no dock beside it is not a thin grabbable strip at the
	// edge of the graph; it is nothing.
	const bar = (side: DockSide) => (dockVisible(layout, side) ? `${SPLITTER}px` : "0px");

	return {
		columns: `${track("left")} ${bar("left")} minmax(0, 1fr) ${bar("right")} ${track("right")}`,
		// The bottom dock is sized by its content, not by `docks.bottom.size`,
		// and has no splitter. Its one panel -- script analysis -- already owns
		// its height: it collapses to a summary bar with its own chevron and
		// caps itself below that. A fixed track fights both, and a dock stretched
		// to 190px around a 60px panel is a slab of empty background under the
		// graph.
		//
		// `docks.bottom.size` is still carried and still persisted, because slice
		// 4 turns analysis into a panel that fills its dock like the others and
		// this becomes a track like the others.
		rows: `minmax(0, 1fr) 0px ${dockVisible(layout, "bottom") ? "auto" : "0px"}`,
	};
}

/**
 * The largest a dock may be dragged to, so the centre keeps `MIN_CENTRE`.
 *
 * The opposite dock is subtracted first: two docks that could each take the
 * whole window would leave the centre at nothing between them, and the splitter
 * that would fix it under the other dock's edge.
 */
export function maxDockSize(layout: Layout, side: DockSide, width: number, height: number): number {
	if (side === "bottom") return Math.max(MIN_DOCK, height - MIN_CENTRE);
	const other: DockSide = side === "left" ? "right" : "left";
	const taken = dockVisible(layout, other) ? layout.docks[other].size : 0;
	return Math.max(MIN_DOCK, width - taken - MIN_CENTRE);
}

/** A dock resized by dragging, clamped to something usable. */
export function resizeDock(
	layout: Layout,
	side: DockSide,
	size: number,
	width: number,
	height: number,
): Layout {
	const clamped = Math.round(
		Math.min(maxDockSize(layout, side, width, height), Math.max(MIN_DOCK, size)),
	);
	return {
		...layout,
		docks: { ...layout.docks, [side]: { ...layout.docks[side], size: clamped } },
	};
}

/** Collapses a dock, or brings it back. */
export function toggleDock(layout: Layout, side: DockSide): Layout {
	const dock = layout.docks[side];
	return { ...layout, docks: { ...layout.docks, [side]: { ...dock, open: !dock.open } } };
}

/**
 * Keeps a layout inside the window it is being shown in.
 *
 * Runs on restore and on every window resize. The centre keeps at least
 * `MIN_CENTRE`; the side docks give up whatever is needed, proportionally,
 * before the bottom does -- horizontal space is the scarcer of the two on the
 * machines this runs on.
 */
export function clampLayout(layout: Layout, width: number, height: number): Layout {
	const docks = { ...layout.docks };

	const sides: DockSide[] = ["left", "right"];
	let used = sides
		.filter((side) => dockVisible(layout, side))
		.reduce((sum, side) => sum + docks[side].size, 0);

	if (width - used < MIN_CENTRE) {
		const available = Math.max(0, width - MIN_CENTRE);
		const scale = used === 0 ? 0 : available / used;
		for (const side of sides) {
			if (!dockVisible(layout, side)) continue;
			docks[side] = { ...docks[side], size: Math.max(0, Math.floor(docks[side].size * scale)) };
		}
		used = available;
	}

	if (dockVisible(layout, "bottom")) {
		const most = Math.max(0, height - MIN_CENTRE);
		docks.bottom = { ...docks.bottom, size: Math.min(docks.bottom.size, most) };
	}

	return { ...layout, docks };
}

/**
 * Reads a stored layout, keeping anything valid and defaulting the rest.
 *
 * Never throws and never rejects wholesale. A layout is a convenience, and the
 * cost of one bad field should be that field reverting — not an editor that
 * will not open, and not a silent reset of an arrangement somebody built.
 */
export function readLayout(stored: unknown): Layout {
	if (typeof stored !== "object" || stored === null) return DEFAULT_LAYOUT;
	const raw = stored as Partial<Layout>;

	const panels = {} as Record<PanelId, PanelState>;
	for (const id of PANEL_IDS) {
		const fallback = DEFAULT_LAYOUT.panels[id];
		const value = raw.panels?.[id];
		const frame = (value as { frame?: Partial<PanelFrame> } | undefined)?.frame;
		panels[id] = {
			dock: DOCK_SIDES.includes(value?.dock as DockSide) ? value!.dock : fallback.dock,
			open: typeof value?.open === "boolean" ? value.open : fallback.open,
			order: typeof value?.order === "number" ? value.order : fallback.order,
			floating:
				typeof (value as { floating?: unknown } | undefined)?.floating === "boolean"
					? (value as { floating: boolean }).floating
					: fallback.floating,
			frame: {
				x: typeof frame?.x === "number" ? Math.max(0, frame.x) : fallback.frame.x,
				y: typeof frame?.y === "number" ? Math.max(0, frame.y) : fallback.frame.y,
				w: typeof frame?.w === "number" ? Math.max(MIN_FLOAT.w, frame.w) : fallback.frame.w,
				h: typeof frame?.h === "number" ? Math.max(MIN_FLOAT.h, frame.h) : fallback.frame.h,
			},
		};
		const card = value as Partial<PanelState> | undefined;
		if (typeof card?.weight === "number" && card.weight > 0) panels[id].weight = card.weight;
		else if (fallback.weight !== undefined) panels[id].weight = fallback.weight;
		if (card?.folded === true) panels[id].folded = true;
		if (PANEL_IDS.includes(card?.active as PanelId)) panels[id].active = card!.active;
		if (PANEL_IDS.includes(card?.tabOf as PanelId) && card!.tabOf !== id)
			panels[id].tabOf = card!.tabOf;
	}
	// A tab of a tab, or of a panel that is gone, heads its own card: a card
	// is one level deep, and a stored loop must not hide a panel for good.
	for (const id of PANEL_IDS) {
		const host = panels[id].tabOf;
		if (host !== undefined && panels[host].tabOf !== undefined) delete panels[id].tabOf;
	}

	const docks = {} as Record<DockSide, DockState>;
	for (const side of DOCK_SIDES) {
		const fallback = DEFAULT_LAYOUT.docks[side];
		const value = raw.docks?.[side];
		const unchosen = side === "bottom" && value?.size === UNCHOSEN_FOOT;
		docks[side] = {
			size:
				typeof value?.size === "number" && value.size >= MIN_DOCK && !unchosen
					? value.size
					: fallback.size,
			open: typeof value?.open === "boolean" ? value.open : fallback.open,
		};
	}

	return { panels, docks };
}

// ---------------------------------------------------------------------------
// Moving a panel
// ---------------------------------------------------------------------------

/** How near an edge the pointer must be for a drop to dock there, in pixels. */
export const EDGE_REACH = 64;

/**
 * Which dock a drop at this point lands in, or `null` for "leave it alone".
 *
 * Blunt on purpose: within `EDGE_REACH` of the left, the right or the bottom,
 * and everywhere else changes nothing. Edges win by axis, so a corner is
 * never ambiguous. A distance rather than a share of the window: a fifth of a
 * wide monitor is a quarter of a metre, and the band reached halfway to the
 * middle of the graph.
 *
 * Proximity-weighted rules — nearest edge, weighted by distance — describe
 * better and behave worse. The answer flips under small movements near a
 * corner, and there is no way to predict where a drop will land without trying
 * it. The blunt version is predictable, and the preview rectangle drawn during
 * the drag makes it visible, so it does not also have to be memorable.
 *
 * Releasing over the middle meaning "no change" matters as much as the bands: a
 * drag you thought better of has somewhere safe to end, and it is the largest
 * target on screen.
 */
export function dropZone(
	rect: { x: number; y: number; width: number; height: number },
	x: number,
	y: number,
	reach = EDGE_REACH,
): DockSide | null {
	const left = x - rect.x;
	const top = y - rect.y;
	if (left < 0 || left > rect.width || top < 0 || top > rect.height) return null;

	if (left < reach) return "left";
	if (left > rect.width - reach) return "right";
	if (top > rect.height - reach) return "bottom";
	return null;
}

/** The panels drawn over the centre, in a window each. */
export function floatingPanels(layout: Layout): PanelId[] {
	return PANEL_IDS.filter((id) => layout.panels[id].floating && layout.panels[id].open);
}

/**
 * Out of its dock and into a window, or back again.
 *
 * Docking again needs no side: `dock` was never cleared, so the panel returns
 * to the one it left — and that dock is opened, for the reason dropping into a
 * dock opens it. A panel that came back to a closed dock would read as having
 * been thrown away.
 */
export function floatPanel(layout: Layout, panel: PanelId, floating: boolean): Layout {
	const head = cardOf(layout, panel);
	const state = layout.panels[head];
	if (state.floating === floating) return layout;

	// The card goes as one: its tabs follow its head.
	const panels = { ...layout.panels };
	for (const id of membersOf(layout, head)) panels[id] = { ...panels[id], floating, open: true };
	if (floating) return { ...layout, panels };

	const side = state.dock;
	return {
		...layout,
		panels,
		docks: { ...layout.docks, [side]: { ...layout.docks[side], open: true } },
	};
}

/** A window was dragged or resized. Clamped so it cannot be lost or shrunk away. */
export function framePanel(layout: Layout, panel: PanelId, frame: PanelFrame): Layout {
	const clamped: PanelFrame = {
		// Not below zero: a window dragged off the top-left would take its own
		// heading with it, and the heading is the only way to drag it back.
		x: Math.max(0, Math.round(frame.x)),
		y: Math.max(0, Math.round(frame.y)),
		w: Math.max(MIN_FLOAT.w, Math.round(frame.w)),
		h: Math.max(MIN_FLOAT.h, Math.round(frame.h)),
	};
	const panels = { ...layout.panels };
	for (const id of membersOf(layout, cardOf(layout, panel)))
		panels[id] = { ...panels[id], frame: clamped };
	return { ...layout, panels };
}

/**
 * Moves a panel into a dock, at the end of whatever is already there.
 *
 * Orders are renumbered wholesale rather than nudged, so they cannot drift into
 * duplicates or gaps however many times a panel is moved.
 */
export function movePanel(layout: Layout, panel: PanelId, side: DockSide): Layout {
	if (layout.panels[panel].dock === side && !layout.panels[panel].floating) return layout;
	// A card moves with its tabs. A lone panel keeps the original rule below.
	if (membersOf(layout, cardOf(layout, panel)).length > 1)
		return dropCard(layout, panel, { kind: "dock", side });

	const panels = {
		...layout.panels,
		// Dropping a window into a dock is how you dock it, so the drop wins over
		// the fact that it was floating a moment ago.
		[panel]: { ...layout.panels[panel], dock: side, open: true, floating: false },
	};
	const renumbered = { ...panels };
	for (const dock of DOCK_SIDES) {
		PANEL_IDS.filter((id) => panels[id].dock === dock)
			.sort((a, b) => panels[a].order - panels[b].order || a.localeCompare(b))
			.forEach((id, i) => {
				renumbered[id] = { ...panels[id], order: i };
			});
	}

	// A dock somebody has just dropped a panel into has to be open, or the
	// panel vanishes and the gesture reads as having deleted it.
	return {
		...layout,
		panels: renumbered,
		docks: { ...layout.docks, [side]: { ...layout.docks[side], open: true } },
	};
}

// ---------------------------------------------------------------------------
// Cards: panels as tabs, sharing a dock's height
// ---------------------------------------------------------------------------

/** The panel heading the card this one is in: itself, unless it is a tab. */
export function cardOf(layout: Layout, panel: PanelId): PanelId {
	return layout.panels[panel].tabOf ?? panel;
}

/** A card's panels, its head first and its tabs in their order. */
export function membersOf(layout: Layout, head: PanelId): PanelId[] {
	return [
		head,
		...PANEL_IDS.filter((id) => layout.panels[id].tabOf === head).sort(
			(a, b) => layout.panels[a].order - layout.panels[b].order || a.localeCompare(b),
		),
	];
}

/**
 * A card as it is drawn: only the panels open and with something to show.
 * Null when none are, so a card whose head has gone quiet still shows its
 * other tabs, and one with nothing left is not an empty frame.
 */
function cardFrom(layout: Layout, head: PanelId, shown: (id: PanelId) => boolean): Card | null {
	const tabs = membersOf(layout, head).filter((id) => layout.panels[id].open && shown(id));
	if (tabs.length === 0) return null;
	const state = layout.panels[head];
	const active = state.active !== undefined && tabs.includes(state.active) ? state.active : tabs[0];
	return { head, tabs, active, weight: state.weight ?? 1, folded: state.folded === true };
}

/** The cards in one dock, in order. */
export function cardsIn(
	layout: Layout,
	side: DockSide,
	shown: (id: PanelId) => boolean = () => true,
): Card[] {
	return PANEL_IDS.filter((id) => {
		const p = layout.panels[id];
		return p.tabOf === undefined && p.dock === side && !p.floating;
	})
		.sort((a, b) => layout.panels[a].order - layout.panels[b].order || a.localeCompare(b))
		.map((head) => cardFrom(layout, head, shown))
		.filter((card): card is Card => card !== null);
}

/** The cards in a window each, over the centre. */
export function floatingCards(
	layout: Layout,
	shown: (id: PanelId) => boolean = () => true,
): Card[] {
	return PANEL_IDS.filter(
		(id) => layout.panels[id].tabOf === undefined && layout.panels[id].floating,
	)
		.map((head) => cardFrom(layout, head, shown))
		.filter((card): card is Card => card !== null);
}

/** Changes one panel's state, leaving the rest alone. */
function patch(layout: Layout, id: PanelId, change: Partial<PanelState>): Layout {
	return { ...layout, panels: { ...layout.panels, [id]: { ...layout.panels[id], ...change } } };
}

/** Numbers a dock's cards 0, 1, 2… in the order given. */
function renumber(layout: Layout, heads: PanelId[]): Layout {
	let next = layout;
	heads.forEach((id, i) => {
		next = patch(next, id, { order: i });
	});
	return next;
}

/** The cards' heads in a dock, in order, whether or not they show. */
function headsIn(layout: Layout, side: DockSide): PanelId[] {
	return PANEL_IDS.filter((id) => {
		const p = layout.panels[id];
		return p.tabOf === undefined && p.dock === side && !p.floating;
	}).sort((a, b) => layout.panels[a].order - layout.panels[b].order || a.localeCompare(b));
}

/**
 * One panel out of its card, into a card of its own where the card was.
 *
 * A tab simply stops being one. A head with tabs hands the card to its first
 * tab -- its place, its share of the height, its fold and its window -- so
 * taking the head away does not scatter the rest.
 */
export function separate(layout: Layout, panel: PanelId): Layout {
	const state = layout.panels[panel];
	if (state.tabOf !== undefined) {
		const head = layout.panels[state.tabOf];
		let next = patch(layout, panel, {
			tabOf: undefined,
			active: undefined,
			folded: false,
			weight: head.weight,
			dock: head.dock,
			floating: head.floating,
			frame: head.frame,
		});
		if (head.active === panel) next = patch(next, state.tabOf, { active: undefined });
		// Beside the card it came from, not at the end of the dock.
		if (!head.floating) {
			const heads = headsIn(next, head.dock).filter((id) => id !== panel);
			heads.splice(heads.indexOf(state.tabOf) + 1, 0, panel);
			next = renumber(next, heads);
		}
		return next;
	}
	const [, first, ...rest] = membersOf(layout, panel);
	if (first === undefined) return layout;
	let next = patch(layout, first, {
		tabOf: undefined,
		order: state.order,
		weight: state.weight,
		folded: state.folded,
		active: state.active === panel ? undefined : state.active,
		dock: state.dock,
		floating: state.floating,
		frame: state.frame,
	});
	for (const id of rest) next = patch(next, id, { tabOf: first });
	next = patch(next, panel, { active: undefined, folded: false });
	if (!state.floating) {
		const heads = headsIn(next, state.dock).filter((id) => id !== panel);
		heads.splice(heads.indexOf(first) + 1, 0, panel);
		next = renumber(next, heads);
	}
	return next;
}

/** Where a dragged card, or one tab of it, can land. */
export type CardDrop =
	| { kind: "tab"; host: PanelId }
	| { kind: "before" | "after"; card: PanelId }
	| { kind: "dock"; side: DockSide }
	| { kind: "float"; frame: PanelFrame };

/**
 * Moves a card -- its head and every tab -- or, with `alone`, one panel out
 * of its card on its own. Every move opens the dock it lands in: a card
 * dropped into a closed dock would read as thrown away.
 */
export function dropCard(layout: Layout, panel: PanelId, drop: CardDrop, alone = false): Layout {
	const solo = alone && membersOf(layout, cardOf(layout, panel)).length > 1;
	let next = solo ? separate(layout, panel) : layout;
	const head = solo ? panel : cardOf(next, panel);
	const group = membersOf(next, head);
	const follow = (change: Partial<PanelState>) => {
		for (const id of group) next = patch(next, id, change);
	};

	if (drop.kind === "tab") {
		const host = cardOf(next, drop.host);
		if (group.includes(host)) return layout;
		const hs = next.panels[host];
		const base = membersOf(next, host).length;
		group.forEach((id, i) => {
			next = patch(next, id, {
				tabOf: host,
				dock: hs.dock,
				floating: hs.floating,
				frame: hs.frame,
				order: base + i,
				active: undefined,
				folded: false,
			});
		});
		next = patch(next, host, { active: panel, folded: false });
		return openDock(next, hs.floating ? null : hs.dock);
	}

	if (drop.kind === "float") {
		follow({ floating: true, frame: drop.frame });
		return next;
	}

	const side = drop.kind === "dock" ? drop.side : next.panels[cardOf(next, drop.card)].dock;
	follow({ dock: side, floating: false });
	const heads = headsIn(next, side).filter((id) => id !== head);
	if (drop.kind === "dock") heads.push(head);
	else {
		const target = cardOf(next, drop.card);
		if (target === head) return layout;
		// The card it lands beside lends it a matching share, so it arrives at
		// a sensible height rather than as a sliver or the whole column.
		next = patch(next, head, { weight: next.panels[target].weight ?? 1 });
		heads.splice(heads.indexOf(target) + (drop.kind === "after" ? 1 : 0), 0, head);
	}
	return openDock(renumber(next, heads), side);
}

function openDock(layout: Layout, side: DockSide | null): Layout {
	if (side === null || layout.docks[side].open) return layout;
	return { ...layout, docks: { ...layout.docks, [side]: { ...layout.docks[side], open: true } } };
}

/** Which tab a card shows. */
export function showTab(layout: Layout, panel: PanelId): Layout {
	const head = cardOf(layout, panel);
	return patch(layout, head, { active: panel, folded: false });
}

/** Folds a card to its header, or opens it again. */
export function foldCard(layout: Layout, panel: PanelId, folded: boolean): Layout {
	return patch(layout, cardOf(layout, panel), { folded });
}

/**
 * Two neighbouring cards' shares of the height, after the line between them
 * was dragged. The others keep theirs.
 */
export function shareHeight(
	layout: Layout,
	above: PanelId,
	below: PanelId,
	weights: [number, number],
): Layout {
	return patch(patch(layout, above, { weight: weights[0] }), below, { weight: weights[1] });
}

/**
 * Closes one panel: out of its card, and shut. Its menu's Panels list, or
 * whatever asks for it, brings it back as a card of its own.
 */
export function closePanel(layout: Layout, panel: PanelId): Layout {
	return patch(separate(layout, panel), panel, { open: false });
}

/** A closed panel back, as a card of its own at the end of its dock. */
export function reopenPanel(layout: Layout, panel: PanelId): Layout {
	const state = layout.panels[panel];
	let next = patch(layout, panel, { open: true, tabOf: undefined, folded: false });
	if (!state.floating)
		next = renumber(next, [...headsIn(next, state.dock).filter((id) => id !== panel), panel]);
	return openDock(next, state.floating ? null : state.dock);
}

// ---------------------------------------------------------------------------
// The foot

/**
 * Whether a card docked at the bottom is drawn along the foot of the graph.
 *
 * The bottom dock holds two kinds of card. Script analysis is the status
 * pill, at the bottom left, as tall as what it says. Anything else docked
 * there -- the Code panel by default -- is a strip across the foot of the
 * graph between the side columns, as tall as `docks.bottom.size`, which its
 * top edge drags.
 */
export function isFoot(layout: Layout, head: PanelId): boolean {
	const state = layout.panels[head];
	return (
		state.tabOf === undefined &&
		!state.floating &&
		state.dock === "bottom" &&
		!membersOf(layout, head).includes("analysis")
	);
}

/**
 * The layout as Code's full view draws it: the Code panel on its own along
 * the foot, whatever card or dock it is in, so the strip can grow over the
 * graph and the side columns stay where they are.
 *
 * Not stored: full view is a moment's arrangement, and leaving it puts the
 * panel back exactly where it was.
 */
export function fullFootLayout(layout: Layout): Layout {
	const alone =
		membersOf(layout, cardOf(layout, "code")).length > 1 ? separate(layout, "code") : layout;
	return patch(alone, "code", {
		dock: "bottom",
		floating: false,
		open: true,
		folded: false,
		tabOf: undefined,
	});
}
