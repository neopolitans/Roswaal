/**
 * The workspace: a centre that fills the window, with the docks floating over
 * it as columns of cards.
 *
 * The rendering half of the system designed in `docs/PANELS.md`. It takes a
 * `Layout` and the contents of each panel, and puts them where the layout says:
 * the left dock's cards down the left, clear of the side strip, the right
 * dock's down the right, and the bottom dock as the status pill. A dock's size
 * is its cards' width; its handle is on the cards' inner edge.
 *
 * ## Each dock is placed by style, never by position in the tree
 *
 * Beako moves a panel by `append`-ing the live node, so it keeps its scroll
 * position, its content and its listeners. React cannot: a component moved to
 * a different parent unmounts and remounts, throwing all of that away. So each
 * dock is rendered once, in a fixed place, and moving a panel between docks is
 * a change to which dock lists it.
 *
 * ## On a phone or a tablet, docks are drawers
 *
 * One panel at a time, over the graph, opened from the top clusters on a tablet
 * and from the bottom bar on a phone. `WorkspaceControls` is how those buttons,
 * which are drawn by whoever draws the chrome, reach the drawers.
 */

import {
	type CSSProperties,
	createContext,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import {
	COMPACT_QUERY,
	type DockSide,
	dockVisible,
	dropZone,
	floatingPanels,
	type Layout,
	MIN_FLOAT,
	PANEL_IDS,
	PANEL_TITLES,
	type PanelFrame,
	type PanelId,
	panelsIn,
} from "./panels.js";
import { trackPointer } from "./pointer.js";

export interface WorkspaceProps {
	layout: Layout;
	/** What each panel draws. A panel with no content is not rendered. */
	contents: Partial<Record<PanelId, ReactNode>>;
	/** The graph, node map, source view or placeholder. Never absent. */
	centre: ReactNode;
	/**
	 * Drawn over the centre, in its own layer.
	 *
	 * The compile toast, which floats over the bottom-right of the graph and
	 * must not be a grid item — it is an overlay on the centre rather than a
	 * thing beside it.
	 */
	floating?: ReactNode;
	/** A dock was dragged to a new size. Absent means the splitters are inert. */
	onResize?: (side: DockSide, size: number) => void;
	/**
	 * The drag finished.
	 *
	 * Separate from `onResize` so a caller can update as the pointer moves and
	 * store the result only once, rather than writing sixty intermediate widths
	 * a second that nobody asked to keep.
	 */
	onResizeEnd?: () => void;
	/** A splitter was double-clicked: collapse the dock, or bring it back. */
	onToggle?: (side: DockSide) => void;
	/** A panel was dragged into another dock. */
	onMovePanel?: (panel: PanelId, side: DockSide) => void;
	/** A window was moved or resized over the centre. */
	onFramePanel?: (panel: PanelId, frame: PanelFrame) => void;
	/** The drag finished. Separate for the reason `onResizeEnd` is. */
	onFramePanelEnd?: () => void;
	/** Its Dock button was pressed: back to the dock it came from. */
	onDockPanel?: (panel: PanelId) => void;
	/** Out of its dock and into a window at this point over the centre. */
	onFloatPanel?: (panel: PanelId, frame: PanelFrame) => void;
	/**
	 * On a phone, the side docks are drawers over the graph; a change to this
	 * shuts them. The open document, so opening one from the tree gets out of
	 * the way of what was opened.
	 */
	drawerKey?: unknown;
	/**
	 * On a phone or a tablet, slides this panel's drawer out, once for each
	 * new `seq`: the DataModel browser opening an instance's Properties.
	 */
	showDrawer?: { panel: PanelId; seq: number } | null;
	/**
	 * Controls for what is selected, drawn with the drawer buttons on a phone
	 * or a tablet, where there is no keyboard to reach them from. Ignored
	 * elsewhere.
	 */
	touchBar?: ReactNode;
	/**
	 * The floating clusters along the top: drawn over the centre and the docks,
	 * taking clicks only on the clusters themselves.
	 */
	chrome?: ReactNode;
	/** The side strip, down the left edge, when the centre is a canvas. */
	strip?: ReactNode;
}

/** What the chrome's dock buttons need: whether a side is out, and a way to put it out. */
export interface WorkspaceControlsValue {
	/** Drawers rather than docks: a phone or a tablet. */
	compact: boolean;
	/** The side has a panel with something to show. */
	has: (side: "left" | "right") => boolean;
	/** The side's dock is on screen, or its drawer is out. */
	isOpen: (side: "left" | "right") => boolean;
	toggle: (side: "left" | "right") => void;
}

const NO_CONTROLS: WorkspaceControlsValue = {
	compact: false,
	has: () => false,
	isOpen: () => false,
	toggle: () => {},
};

const WorkspaceControls = createContext<WorkspaceControlsValue>(NO_CONTROLS);

/** The dock buttons' view of the workspace. */
export function useWorkspaceControls(): WorkspaceControlsValue {
	return useContext(WorkspaceControls);
}

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

export function Workspace({
	layout,
	contents,
	centre,
	floating,
	onResize,
	onResizeEnd,
	onToggle,
	onMovePanel,
	onFramePanel,
	onFramePanelEnd,
	onDockPanel,
	onFloatPanel,
	drawerKey,
	touchBar,
	showDrawer,
	chrome,
	strip,
}: WorkspaceProps) {
	const surface = useRef<HTMLDivElement>(null);
	// The centre, which a window's coordinates are measured from.
	const centreBox = useRef<HTMLDivElement>(null);
	// The panel under the pointer, and where it would land if released now.
	const [dragging, setDragging] = useState<{ panel: PanelId; over: DockSide | null } | null>(null);
	// A panel with nothing to draw is not open.
	//
	// The inspector only has content while exactly one node is selected, and
	// the variables panel only while a graph is open. Asking `gridTemplate` for
	// tracks from the raw layout reserves those columns anyway — 290px of dead
	// space to the right of the graph whenever nothing is selected, which is
	// exactly the column the old fixed layout only added when it had something
	// to put in it.
	//
	// Derived here rather than in `panels.ts` because it is a fact about
	// rendering, not about the layout: the developer did not close the
	// inspector, and it must come back the moment it has something to say.
	const effective: Layout = {
		...layout,
		panels: Object.fromEntries(
			PANEL_IDS.map((id) => [
				id,
				contents[id] === undefined ? { ...layout.panels[id], open: false } : layout.panels[id],
			]),
		) as Layout["panels"],
	};

	const compact = useCompact();
	// Which panel's drawer is out, on a phone or a tablet. Never more than one,
	// and one panel per drawer: the tree and Variables shared a drawer at
	// first and each got half of it, which is not enough of either.
	const [drawer, setDrawer] = useState<PanelId | null>(null);
	// The panel each side last showed, so its button brings back that one.
	const lastShown = useRef<Partial<Record<DockSide, PanelId>>>({});
	useEffect(() => {
		if (drawer) lastShown.current[layout.panels[drawer].dock] = drawer;
	}, [drawer, layout]);
	useEffect(() => setDrawer(null), [drawerKey]);
	useEffect(() => {
		if (showDrawer) setDrawer(showDrawer.panel);
	}, [showDrawer]);
	// A panel that has gone quiet -- the Inspector once nothing is selected --
	// takes its drawer with it.
	const openPanel = drawer !== null && contents[drawer] !== undefined ? drawer : null;

	// Dragging something out of a drawer -- a variable, a file -- puts the
	// drawer away, or it would cover the graph the drag is headed for.
	useEffect(() => {
		const element = surface.current;
		if (!compact || !element) return;
		const onStart = (e: Event) => {
			if (e.target instanceof Element && e.target.closest(".dock.drawer")) setDrawer(null);
		};
		element.addEventListener("dragstart", onStart);
		return () => element.removeEventListener("dragstart", onStart);
	}, [compact]);

	// The panels a side's drawers offer, in the order the dock stacks them.
	//
	// Floating panels too, by the dock they came from: a window over the graph
	// is a desktop's arrangement, and on a tablet it would sit on top of the
	// only thing there is room for. And a collapsed dock still offers its
	// panels -- collapsing is a choice about a wide window, and the splitter
	// that would undo it is not drawn here.
	const drawerPanels = (side: "left" | "right"): PanelId[] =>
		PANEL_IDS.filter(
			(id) =>
				layout.panels[id].dock === side && layout.panels[id].open && contents[id] !== undefined,
		).sort((a, b) => layout.panels[a].order - layout.panels[b].order || a.localeCompare(b));
	const drawers = compact
		? { left: drawerPanels("left"), right: drawerPanels("right") }
		: { left: [], right: [] };

	// Out, or put away: the side's last panel, or its first.
	const toggleDrawer = (side: "left" | "right") => {
		const ids = drawers[side];
		if (openPanel !== null && ids.includes(openPanel)) {
			setDrawer(null);
			return;
		}
		const last = lastShown.current[side];
		setDrawer(last && ids.includes(last) ? last : (ids[0] ?? null));
	};
	const controls: WorkspaceControlsValue = compact
		? {
				compact,
				has: (side) => drawers[side].length > 0,
				isOpen: (side) => openPanel !== null && drawers[side].includes(openPanel),
				toggle: toggleDrawer,
			}
		: {
				compact,
				has: (side) =>
					PANEL_IDS.some((id) => layout.panels[id].dock === side && contents[id] !== undefined),
				isOpen: (side) => dockVisible(effective, side),
				toggle: (side) => onToggle?.(side),
			};

	return (
		<WorkspaceControls.Provider value={controls}>
			<div
				className={cx(
					"workspace",
					dragging && "dragging",
					compact && "compact",
					strip !== undefined && strip !== null && "has-strip",
				)}
				ref={surface}
				// The cards' widths, for what the centre shows when it is a sheet
				// rather than a canvas: it keeps clear of them.
				style={
					{
						"--left-w": `${!compact && dockVisible(effective, "left") ? effective.docks.left.size : 0}px`,
						"--right-w": `${!compact && dockVisible(effective, "right") ? effective.docks.right.size : 0}px`,
					} as CSSProperties
				}
			>
				<div className="centre" ref={centreBox}>
					{centre}
					{strip}
					{floating}
					{compact && (touchBar || drawers.left.length + drawers.right.length > 0) && (
						// A phone's bar along the bottom: the two sides' cards at its ends
						// and what can be done to the selection between them. On a tablet
						// the side buttons are on the top clusters instead.
						<div className="drawer-toggles">
							{drawers.left.length > 0 && (
								<button
									className={cx("tb icon-only drawer-toggle", controls.isOpen("left") && "on")}
									aria-expanded={controls.isOpen("left")}
									title={drawers.left.map((id) => PANEL_TITLES[id]).join(" and ")}
									onClick={() => toggleDrawer("left")}
								>
									<Icon name="panelLeft" size={18} />
								</button>
							)}
							{touchBar && <div className="touch-bar">{touchBar}</div>}
							{drawers.right.length > 0 && (
								<button
									className={cx("tb icon-only drawer-toggle", controls.isOpen("right") && "on")}
									aria-expanded={controls.isOpen("right")}
									title={drawers.right.map((id) => PANEL_TITLES[id]).join(" and ")}
									onClick={() => toggleDrawer("right")}
								>
									<Icon name="panelRight" size={18} />
								</button>
							)}
						</div>
					)}
					{/* Over the graph rather than beside it. Inside the centre, so a
				    window's coordinates are the graph's and a dock opening does not
				    drag every window sideways with it. */}
					{(compact ? [] : floatingPanels(effective)).map((id) => (
						<FloatingPanel
							key={id}
							id={id}
							frame={effective.panels[id].frame}
							onFrame={onFramePanel}
							onFrameEnd={onFramePanelEnd}
							onDock={onDockPanel}
						>
							{contents[id]}
						</FloatingPanel>
					))}
				</div>

				{compact && openPanel && (
					<div className="drawer-backdrop" onPointerDown={() => setDrawer(null)} />
				)}

				{(["left", "right", "bottom"] as DockSide[]).map((side) =>
					(
						compact && side !== "bottom"
							? drawers[side].length > 0
							: dockVisible(effective, side)
					) ? (
						<Dock
							key={side}
							side={side}
							layout={effective}
							contents={contents}
							drawer={
								compact && side !== "bottom"
									? { ids: drawers[side], open: openPanel, onShow: setDrawer }
									: undefined
							}
							onDragPanel={onMovePanel && !compact ? startDrag : undefined}
							onFloat={
								onFloatPanel && !compact
									? (panel) => onFloatPanel(panel, layout.panels[panel].frame)
									: undefined
							}
							splitter={
								!compact && side !== "bottom" && onResize && onToggle ? (
									<Splitter
										side={side}
										size={effective.docks[side].size}
										onResize={(size) => onResize(side, size)}
										onResizeEnd={onResizeEnd}
										onToggle={() => onToggle(side)}
									/>
								) : undefined
							}
						/>
					) : null,
				)}

				{chrome && <div className="workspace-chrome">{chrome}</div>}

				{/* The preview, drawn over everything and hit by nothing. It has to be
			    `pointer-events: none` or `elementFromPoint` would answer "the
			    overlay" for every position under it, which is every position. */}
				{dragging?.over && <DropPreview side={dragging.over} layout={effective} />}
			</div>
		</WorkspaceControls.Provider>
	);

	// A press on a panel's own heading, which may become a drag.
	//
	// The heading is the handle rather than a bar the dock adds, because every
	// panel already has one — the project name, "Variables", "Node", the
	// diagnostics summary — and a second title strip above those would be a row
	// of chrome repeating what is directly beneath it.
	//
	// Nothing happens until the pointer has moved `DRAG_THRESHOLD`. That is what
	// lets the headings keep the jobs they already had: the Add button inside
	// the Variables heading still adds, and clicking the diagnostics bar still
	// collapses it, because neither is a drag until you move.
	function startDrag(panel: PanelId, event: ReactPointerEvent<HTMLElement>) {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		// Only the heading is the handle. Without this, dragging a file in the
		// project tree would also be dragging the tree out of its dock — and the
		// tree's own drag-and-drop would be fighting this one for the gesture.
		if (!target.closest("h2, .bar")) return;
		// A control inside a heading belongs to the panel, not to the dock.
		if (target.closest("button, input, select, textarea, a")) return;

		const startX = event.clientX;
		const startY = event.clientY;
		let started = false;

		const move = (e: PointerEvent) => {
			if (!started) {
				if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
				started = true;
				// A press-and-move over text is a selection gesture as far as the
				// browser is concerned, so without this the drag leaves half the
				// editor highlighted behind it. Cleared once, here, rather than
				// suppressed on the way down -- a press that never becomes a drag
				// must still be able to select and to focus.
				window.getSelection()?.removeAllRanges();
			}
			const rect = surface.current?.getBoundingClientRect();
			setDragging({ panel, over: rect ? dropZone(rect, e.clientX, e.clientY) : null });
		};

		const end = (e: PointerEvent | undefined) => {
			setDragging(null);
			// A cancelled pointer was not dropped anywhere.
			if (!started || !e) return;
			const rect = surface.current?.getBoundingClientRect();
			const side = rect ? dropZone(rect, e.clientX, e.clientY) : null;
			if (side) {
				onMovePanel?.(panel, side);
				return;
			}
			// Dropped over the graph: a window, where it was dropped. A drop in
			// the middle is not a miss; it is the other place a panel can be.
			const centre = centreBox.current?.getBoundingClientRect();
			if (!centre || !onFloatPanel) return;
			if (
				e.clientX < centre.x ||
				e.clientX > centre.right ||
				e.clientY < centre.y ||
				e.clientY > centre.bottom
			)
				return;
			onFloatPanel(panel, {
				// Under the pointer by its own heading, which is what was grabbed.
				x: Math.round(e.clientX - centre.x - 40),
				y: Math.round(e.clientY - centre.y - 10),
				w: layout.panels[panel].frame.w,
				h: layout.panels[panel].frame.h,
			});
		};

		trackPointer(event, { move, end });
	}
}

/**
 * A panel in a window over the graph.
 *
 * Dragged by its title bar and resized from its bottom-right corner, which is
 * the same pair of gestures a comment has — one shape of window in the tool
 * rather than two.
 *
 * The bar is this component's own rather than the panel's heading, unlike a
 * docked panel: a window needs somewhere to put the button that docks it again,
 * and a heading that is already carrying an Add button has no room for it.
 */
function FloatingPanel({
	id,
	frame,
	onFrame,
	onFrameEnd,
	onDock,
	children,
}: {
	id: PanelId;
	frame: PanelFrame;
	onFrame?: (panel: PanelId, frame: PanelFrame) => void;
	onFrameEnd?: () => void;
	onDock?: (panel: PanelId) => void;
	children: ReactNode;
}) {
	// The frame the drag started from.
	//
	// Held rather than read per frame, for the reason the comment resize holds
	// its starting box: working the next frame out from the current one
	// accumulates rounding, and a window walks away from the pointer.
	const start = useRef<{ frame: PanelFrame; x: number; y: number } | null>(null);

	function drag(e: ReactPointerEvent<HTMLElement>, mode: "move" | "nw" | "se") {
		if (e.button !== 0 || !onFrame) return;
		const target = e.target as HTMLElement;
		// The same handle rule the docks use: the heading moves the panel, and a
		// control inside the heading still belongs to the panel.
		if (mode === "move" && !target.closest("h2, .bar")) return;
		if (target.closest("button, input, select, textarea, a")) return;
		e.preventDefault();
		e.stopPropagation();
		start.current = { frame, x: e.clientX, y: e.clientY };

		const move = (at: PointerEvent) => {
			const from = start.current;
			if (!from) return;
			// A move with nothing held is a release this never heard. See the
			// splitter, which has the same check.
			if (at.buttons === 0) {
				stop();
				return;
			}
			const dx = at.clientX - from.x;
			const dy = at.clientY - from.y;
			if (mode === "move") {
				onFrame(id, { ...from.frame, x: from.frame.x + dx, y: from.frame.y + dy });
				return;
			}
			if (mode === "se") {
				onFrame(id, {
					...from.frame,
					w: Math.max(MIN_FLOAT.w, from.frame.w + dx),
					h: Math.max(MIN_FLOAT.h, from.frame.h + dy),
				});
				return;
			}
			// The top-left moves the window as it shrinks it, by exactly what the
			// size lost, so the opposite corner stays where it is. Clamped by the
			// amount *taken* rather than by the size, or the window slides past
			// its own bottom-right once it has nothing left to give — the same
			// arithmetic a comment's corner does.
			const takeX = Math.min(dx, from.frame.w - MIN_FLOAT.w);
			const takeY = Math.min(dy, from.frame.h - MIN_FLOAT.h);
			onFrame(id, {
				x: from.frame.x + takeX,
				y: from.frame.y + takeY,
				w: from.frame.w - takeX,
				h: from.frame.h - takeY,
			});
		};
		const stop = trackPointer(e, {
			move,
			end: () => {
				start.current = null;
				onFrameEnd?.();
			},
		});
	}

	return (
		<div
			className={cx("float-panel", `float-${id}`)}
			style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
		>
			{/* No bar of its own. The panel's heading is the handle, which is the
			    argument the docks already make: every panel has one — "Variables"
			    with its Add button, the project name, "Node" — and a strip above
			    it would be a second title saying the same word.

			    The dock button is the exception, because a window needs somewhere
			    to put it and a heading carrying an Add button has no room. It sits
			    over the heading's right end, and the heading makes space for it. */}
			<div className="float-body" onPointerDown={(e) => drag(e, "move")}>
				{/* The same wrapper a dock puts round a panel. Without it every rule
				    written for `.panel` — and every panel that renders a fragment
				    rather than one element — lands differently in a window than in
				    a dock, which is the one thing a panel moving between them must
				    not do. */}
				<div className={cx("panel", `panel-${id}`)}>{children}</div>
			</div>
			{onDock && (
				<button
					className="tb icon-only float-dock"
					title={`Put ${PANEL_TITLES[id]} back in its dock`}
					onClick={() => onDock(id)}
				>
					⇤
				</button>
			)}
			{/* Both corners, for the reason a comment has both: growing a window
			    upwards or leftwards otherwise means resizing it from the bottom
			    and then dragging the whole thing back. */}
			<div className="float-size nw" title="Drag to resize" onPointerDown={(e) => drag(e, "nw")} />
			<div className="float-size se" title="Drag to resize" onPointerDown={(e) => drag(e, "se")} />
		</div>
	);
}

/**
 * Where the panel would land, drawn over the dock it would land in.
 *
 * A rectangle rather than a highlight on the dock itself, because the dock it
 * would land in may not exist yet — dropping into an empty side has to show
 * where that side *would* be, and a dock with no width cannot be highlighted.
 */
function DropPreview({ side, layout }: { side: DockSide; layout: Layout }) {
	// The dock's remembered size, whether or not it is currently on screen: an
	// empty side has to show where it *would* be.
	const size = layout.docks[side].size;
	const style =
		side === "bottom"
			? { left: 0, right: 0, bottom: 0, height: size }
			: side === "left"
				? { left: 0, top: 0, bottom: 0, width: size }
				: { right: 0, top: 0, bottom: 0, width: size };

	return <div className="drop-preview" style={style} />;
}

/**
 * One dock, holding its panels stacked.
 *
 * **No chrome of its own yet.** Stacked rather than tabbed, and with no title
 * bar, because this slice is meant to be invisible: the panels draw exactly
 * what they drew when the workspace was three hard-coded columns. A title bar
 * added here would be a header appearing above the project tree, which is a
 * change to look at rather than a change to the structure.
 *
 * Titles and tabs arrive together in slice 4, when there is more than one panel
 * per dock and a strip has something to say.
 */
function Dock({
	side,
	layout,
	contents,
	drawer,
	onDragPanel,
	onFloat,
	splitter,
}: {
	side: DockSide;
	layout: Layout;
	contents: Partial<Record<PanelId, ReactNode>>;
	/**
	 * A dock drawn as drawers, on a phone or a tablet: the panels it offers,
	 * and which one is out, if any of them. Undefined for a docked dock.
	 */
	drawer?: { ids: PanelId[]; open: PanelId | null; onShow: (panel: PanelId) => void };
	onDragPanel?: (panel: PanelId, event: ReactPointerEvent<HTMLElement>) => void;
	onFloat?: (panel: PanelId) => void;
	/** The handle on the cards' inner edge, for a side dock on a wide screen. */
	splitter?: ReactNode;
}) {
	const ids = drawer?.ids ?? panelsIn(layout, side).filter((id) => contents[id] !== undefined);
	if (ids.length === 0) return null;
	const out = drawer !== undefined && drawer.open !== null && ids.includes(drawer.open);

	return (
		<div
			className={cx("dock", side, drawer !== undefined && "drawer", out && "drawer-open")}
			// A side dock's size is its cards' width. A drawer sizes itself.
			style={
				drawer === undefined && side !== "bottom" ? { width: layout.docks[side].size } : undefined
			}
			// Kept mounted while it is in, so the tree keeps what was expanded
			// and where it was scrolled to -- but out of reach of focus.
			inert={drawer !== undefined && !out}
		>
			{splitter}
			{/* A drawer holds one panel at a time; with more than one on its side,
			    a switch at its top says which. */}
			{drawer !== undefined && ids.length > 1 && (
				<span className="segmented drawer-tabs">
					{ids.map((id) => (
						<button
							key={id}
							className={drawer.open === id ? "on" : ""}
							onClick={() => drawer.onShow(id)}
						>
							{PANEL_TITLES[id]}
						</button>
					))}
				</span>
			)}
			{ids.map((id) => (
				<div
					// The drawer shows the one panel asked for. The others stay
					// mounted beside it, hidden, for the reason the drawer does.
					className={cx(
						"panel",
						`panel-${id}`,
						drawer !== undefined && drawer.open !== id && "panel-away",
					)}
					key={id}
					title={
						onDragPanel
							? `Drag ${PANEL_TITLES[id]} by its heading to another edge, or onto the graph`
							: undefined
					}
					onPointerDown={onDragPanel ? (e) => onDragPanel(id, e) : undefined}
				>
					{/* The button the window has, pointing the other way. Dragging the
					    heading onto the graph does the same thing; a gesture nobody
					    has been told about needs something visible beside it. */}
					{onFloat && (
						<button
							className="tb icon-only panel-float"
							title={`Put ${PANEL_TITLES[id]} in a window over the graph`}
							onClick={() => onFloat(id)}
						>
							⇥
						</button>
					)}
					{contents[id]}
				</div>
			))}
		</div>
	);
}

/**
 * The grab handle between a dock and the centre.
 *
 * Drag to resize; **double-click to collapse the dock, and again to bring it
 * back**. The double-click is how a dock is closed for now: closing belongs on
 * a panel, and a panel has no chrome to put a button in until slice 4 gives it
 * a tab strip. A splitter is the one piece of dock furniture that exists today,
 * so it carries the gesture rather than adding a title bar early purely to hang
 * a button from.
 *
 * The pointer is captured for the duration, so a fast drag that outruns the
 * handle keeps resizing instead of stopping the moment the cursor leaves a
 * five-pixel strip.
 */
function Splitter({
	side,
	size,
	onResize,
	onResizeEnd,
	onToggle,
}: {
	side: DockSide;
	size: number;
	onResize: (size: number) => void;
	onResizeEnd?: () => void;
	onToggle: () => void;
}) {
	const axis = side === "bottom" ? "row" : "col";

	// Drag to resize, on the **window** rather than on the handle.
	//
	// A pointer capture on the handle is the tidier shape and has one failure
	// that matters: if the capture is not granted — or is lost, which a
	// browser may do for its own reasons — the release happens somewhere else
	// and the handle never hears about it. The move listener then survives the
	// drag, and the next time the pointer *passes over* the splitter with no
	// button held it carries on resizing, which is the dock walking outwards on
	// its own.
	//
	// On the window, the release is heard wherever it happens. `buttons` is
	// checked as well, so a move that arrives with nothing held ends the drag
	// rather than acting on it — belt and braces for the same failure.
	function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
		if (e.button !== 0) return;
		e.preventDefault();

		const startX = e.clientX;
		const startY = e.clientY;

		const move = (move: PointerEvent) => {
			if (move.buttons === 0) {
				stop();
				return;
			}
			// Each side grows in a different direction: the left dock follows the
			// pointer, the right and bottom grow as it moves back towards them.
			const delta =
				side === "left"
					? move.clientX - startX
					: side === "right"
						? startX - move.clientX
						: startY - move.clientY;
			onResize(size + delta);
		};
		const stop = trackPointer(e, { move, end: () => onResizeEnd?.() });
	}

	return (
		<div
			className={cx("splitter", side, axis)}
			role="separator"
			aria-orientation={axis === "col" ? "vertical" : "horizontal"}
			title="Drag to resize. Double-click to collapse."
			onPointerDown={onPointerDown}
			onDoubleClick={onToggle}
		/>
	);
}

/**
 * Whether the window is phone-sized or a touch screen, and so the docks are
 * drawers. Node Design's node list asks the same question.
 *
 * A media query rather than a width in state, so it changes when the query
 * does rather than on every pixel of a resize.
 */
export function useCompact(): boolean {
	const [compact, setCompact] = useState(
		() => typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches,
	);
	useEffect(() => {
		const query = window.matchMedia(COMPACT_QUERY);
		const update = () => setCompact(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	return compact;
}
