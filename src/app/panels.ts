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
}

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
		tree: { dock: "left", open: true, order: 0 },
		variables: { dock: "left", open: true, order: 1 },
		inspector: { dock: "right", open: true, order: 0 },
		analysis: { dock: "bottom", open: true, order: 0 },
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

/** Smallest a dock may be dragged to before it is worth closing instead. */
export const MIN_DOCK = 140;

/**
 * The panels in one dock, in order, open ones only.
 *
 * Ordering is by `order` and then by id, so two panels that somehow share an
 * order still come out in a stable sequence rather than in whatever order the
 * object happened to iterate.
 */
export function panelsIn(layout: Layout, side: DockSide): PanelId[] {
	return PANEL_IDS.filter((id) => layout.panels[id].dock === side && layout.panels[id].open)
		.sort((a, b) => layout.panels[a].order - layout.panels[b].order || a.localeCompare(b));
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

/**
 * The grid tracks for the workspace.
 *
 * **Every track is `minmax(0, …)`.** A grid item's automatic minimum size is
 * its *content*, so a dock holding one long path otherwise refuses to shrink
 * below the width of that path — the splitter drags outwards freely and will
 * not come back. This is the single most likely thing to be removed by accident
 * while tidying, and it is why the numbers are built here rather than written
 * in the stylesheet.
 */
export function gridTemplate(layout: Layout): { columns: string; rows: string } {
	const left = dockVisible(layout, "left") ? `minmax(0, ${layout.docks.left.size}px)` : "0px";
	const right = dockVisible(layout, "right") ? `minmax(0, ${layout.docks.right.size}px)` : "0px";
	const bottom = dockVisible(layout, "bottom") ? `minmax(0, ${layout.docks.bottom.size}px)` : "0px";

	return {
		columns: `${left} minmax(0, 1fr) ${right}`,
		rows: `minmax(0, 1fr) ${bottom}`,
	};
}

/**
 * Keeps a restored layout inside the window it is being restored into.
 *
 * A dock size remembered from a larger monitor can otherwise leave no centre
 * pane at all — which puts the splitter that would fix it off screen, and makes
 * the editor unusable in a way that survives a reload.
 *
 * The centre keeps at least `MIN_CENTRE`; the side docks give up whatever is
 * needed, proportionally, before the bottom does. Horizontal space is the
 * scarcer of the two on the machines this runs on.
 */
const MIN_CENTRE = 320;

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
		panels[id] = {
			dock: DOCK_SIDES.includes(value?.dock as DockSide) ? value!.dock : fallback.dock,
			open: typeof value?.open === "boolean" ? value.open : fallback.open,
			order: typeof value?.order === "number" ? value.order : fallback.order,
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
