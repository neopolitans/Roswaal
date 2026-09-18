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
 * those two. Beako's browser docks are the same three, and matching them is
 * deliberate — the two tools sit in one workflow and should not need learning
 * twice.
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
export type PanelId = "tree" | "variables" | "inspector" | "analysis";

export const PANEL_IDS: PanelId[] = ["tree", "variables", "inspector", "analysis"];

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
		tree: { dock: "left", open: true, order: 0, floating: false, frame: DEFAULT_FRAME },
		variables: { dock: "left", open: true, order: 1, floating: false, frame: DEFAULT_FRAME },
		inspector: { dock: "right", open: true, order: 0, floating: false, frame: DEFAULT_FRAME },
		analysis: { dock: "bottom", open: true, order: 0, floating: false, frame: DEFAULT_FRAME },
	},
	docks: {
		left: { size: 260, open: true },
		right: { size: 290, open: true },
		bottom: { size: 190, open: true },
	},
};

export const PANEL_TITLES: Record<PanelId, string> = {
	tree: "Project",
	variables: "Variables",
	inspector: "Inspector",
	analysis: "Script analysis",
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
		(id) => layout.panels[id].dock === side
			&& layout.panels[id].open
			&& !layout.panels[id].floating,
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
	layout: Layout, side: DockSide, size: number, width: number, height: number,
): Layout {
	const clamped = Math.round(
		Math.min(maxDockSize(layout, side, width, height), Math.max(MIN_DOCK, size)),
	);
	return { ...layout, docks: { ...layout.docks, [side]: { ...layout.docks[side], size: clamped } } };
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
			floating: typeof (value as { floating?: unknown } | undefined)?.floating === "boolean"
				? (value as { floating: boolean }).floating
				: fallback.floating,
			frame: {
				x: typeof frame?.x === "number" ? Math.max(0, frame.x) : fallback.frame.x,
				y: typeof frame?.y === "number" ? Math.max(0, frame.y) : fallback.frame.y,
				w: typeof frame?.w === "number" ? Math.max(MIN_FLOAT.w, frame.w) : fallback.frame.w,
				h: typeof frame?.h === "number" ? Math.max(MIN_FLOAT.h, frame.h) : fallback.frame.h,
			},
		};
	}

	const docks = {} as Record<DockSide, DockState>;
	for (const side of DOCK_SIDES) {
		const fallback = DEFAULT_LAYOUT.docks[side];
		const value = raw.docks?.[side];
		docks[side] = {
			size:
				typeof value?.size === "number" && value.size >= MIN_DOCK ? value.size : fallback.size,
			open: typeof value?.open === "boolean" ? value.open : fallback.open,
		};
	}

	return { panels, docks };
}

// ---------------------------------------------------------------------------
// Moving a panel
// ---------------------------------------------------------------------------

/**
 * Which dock a drop at this point lands in, or `null` for "leave it alone".
 *
 * Blunt on purpose: the left 22%, the right 22%, the lower 30% of what remains,
 * and the middle changes nothing. Edges win by axis, so a corner is never
 * ambiguous.
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
): DockSide | null {
	const across = (x - rect.x) / rect.width;
	const down = (y - rect.y) / rect.height;
	if (across < 0 || across > 1 || down < 0 || down > 1) return null;

	if (across < 0.22) return "left";
	if (across > 0.78) return "right";
	if (down > 0.7) return "bottom";
	return null;
}

/**
 * Moves a panel into a dock, at the end of whatever is already there.
 *
 * Orders are renumbered wholesale rather than nudged, so they cannot drift into
 * duplicates or gaps however many times a panel is moved.
 */
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
	const state = layout.panels[panel];
	if (state.floating === floating) return layout;

	const panels = { ...layout.panels, [panel]: { ...state, floating, open: true } };
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
	return {
		...layout,
		panels: { ...layout.panels, [panel]: { ...layout.panels[panel], frame: clamped } },
	};
}

export function movePanel(layout: Layout, panel: PanelId, side: DockSide): Layout {
	if (layout.panels[panel].dock === side && !layout.panels[panel].floating) return layout;

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
