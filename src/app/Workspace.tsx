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
 * ## Cards
 *
 * A card is one or more panels as tabs, under a header that is its handle:
 * see `Cards.tsx`. Two or more open cards in a dock share its height, and the
 * line between two trades height between them. A card is dragged by its
 * header -- onto another's header for a tab, above or below a card, to an
 * edge for that dock, or onto the graph for a window -- and its menu does the
 * same without dragging, and closes it.
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
	Fragment,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import { CardView, HEADLESS, PanelBody } from "./Cards.jsx";
import { cx } from "./cx.js";
import { Icon } from "./icons.jsx";
import { Menu } from "./Menu.jsx";
import type { MenuEntry } from "./menuModel.js";
import {
	type Card,
	type CardDrop,
	COMPACT_QUERY,
	cardOf,
	cardsIn,
	closePanel,
	type DockSide,
	dockVisible,
	dropCard,
	dropZone,
	floatingCards,
	foldCard,
	fullFootLayout,
	isFoot,
	type Layout,
	MIN_FLOAT,
	membersOf,
	PANEL_IDS,
	PANEL_TITLES,
	type PanelFrame,
	type PanelId,
	reopenPanel,
	separate,
	shareHeight,
	showTab,
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
	 * A drag finished: a dock's width, the height two cards share, or a
	 * window's frame.
	 *
	 * Separate from the change itself so a caller can update as the pointer
	 * moves and store the result only once, rather than writing sixty
	 * intermediate sizes a second that nobody asked to keep.
	 */
	onResizeEnd?: () => void;
	/** A splitter was double-clicked: collapse the dock, or bring it back. */
	onToggle?: (side: DockSide) => void;
	/**
	 * A card was moved, tabbed, folded, closed or resized. `persist` is false
	 * for a stream -- the line between two cards being dragged -- which is
	 * written by `onResizeEnd` when it settles.
	 */
	onLayout?: (change: (layout: Layout) => Layout, persist?: boolean) => void;
	/** A window was moved or resized over the centre. */
	onFramePanel?: (panel: PanelId, frame: PanelFrame) => void;
	/** The drag finished. Separate for the reason `onResizeEnd` is. */
	onFramePanelEnd?: () => void;
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
	/**
	 * Code's full view: the Code panel along the foot, grown up over the graph
	 * to the top bar, the side columns kept. See `fullFootLayout`.
	 */
	fullFoot?: boolean;
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
	onLayout,
	onFramePanel,
	onFramePanelEnd,
	drawerKey,
	touchBar,
	showDrawer,
	chrome,
	strip,
	fullFoot = false,
}: WorkspaceProps) {
	const surface = useRef<HTMLDivElement>(null);
	// The centre, which a window's coordinates are measured from.
	const centreBox = useRef<HTMLDivElement>(null);
	// The card under the pointer, and where it would land if released now.
	const [dragging, setDragging] = useState<{
		panel: PanelId;
		alone: boolean;
		windowed: boolean;
		target: Target | null;
	} | null>(null);
	// The card last used, which its header marks.
	const [focus, setFocus] = useState<PanelId | null>(null);
	// The status pill's height, which the left column stops above: it is a
	// row, or two with a line under it, or a list when there are problems.
	const [pill, setPill] = useState(0);
	// A card's menu, open by its button.
	const [menu, setMenu] = useState<{ panel: PanelId; button: HTMLElement } | null>(null);
	// A panel with nothing to draw is not open.
	//
	// The inspector only has content while exactly one node is selected, and
	// the variables panel only while a graph is open. Derived here rather than
	// in `panels.ts` because it is a fact about rendering, not about the
	// layout: the developer did not close the inspector, and it must come back
	// the moment it has something to say.
	const arranged = fullFoot && contents.code !== undefined ? fullFootLayout(layout) : layout;
	const effective: Layout = {
		...arranged,
		panels: Object.fromEntries(
			PANEL_IDS.map((id) => [
				id,
				contents[id] === undefined ? { ...arranged.panels[id], open: false } : arranged.panels[id],
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
	// only thing there is room for. A card's tabs are offered one by one.
	const drawerPanels = (side: "left" | "right"): PanelId[] =>
		PANEL_IDS.filter(
			(id) =>
				layout.panels[id].dock === side && layout.panels[id].open && contents[id] !== undefined,
		).sort(
			(a, b) =>
				layout.panels[cardOf(layout, a)].order - layout.panels[cardOf(layout, b)].order ||
				layout.panels[a].order - layout.panels[b].order ||
				a.localeCompare(b),
		);
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

	const shown = (id: PanelId) => contents[id] !== undefined;
	const grabber = onLayout && !compact ? grab : undefined;
	const menuFor = onLayout && !compact ? openMenu : undefined;
	const openMenuItems = menu ? menuItems(menu.panel) : null;

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
				// The card a press lands in is the one in use, which its header marks.
				onPointerDownCapture={(e) => {
					const card = (e.target as Element).closest?.<HTMLElement>(".card");
					if (card) setFocus(card.dataset.active as PanelId);
				}}
				// The cards' widths, for what the centre shows when it is a sheet
				// rather than a canvas: it keeps clear of them.
				style={
					{
						"--left-w": `${!compact && dockVisible(effective, "left") ? effective.docks.left.size : 0}px`,
						"--right-w": `${!compact && dockVisible(effective, "right") ? effective.docks.right.size : 0}px`,
						"--pill-h": `${dockVisible(effective, "bottom") ? pill : 0}px`,
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
					{(compact ? [] : floatingCards(effective, shown)).map((card) => (
						<FloatingCard
							key={card.head}
							card={card}
							frame={effective.panels[card.head].frame}
							contents={contents}
							focus={focus !== null && card.tabs.includes(focus)}
							onGrab={grabber}
							onLayout={onLayout}
							onMenu={menuFor}
							onFrame={onFramePanel}
							onFrameEnd={onFramePanelEnd}
						/>
					))}
				</div>

				{compact && openPanel && (
					<div className="drawer-backdrop" onPointerDown={() => setDrawer(null)} />
				)}

				{(["left", "right"] as const).map((side) =>
					compact && drawers[side].length > 0 ? (
						<DrawerDock
							key={side}
							side={side}
							contents={contents}
							drawer={{ ids: drawers[side], open: openPanel, onShow: setDrawer }}
						/>
					) : null,
				)}
				{(compact ? (["bottom"] as const) : (["left", "right", "bottom"] as const)).map((side) =>
					dockVisible(effective, side) ? (
						<DockCards
							key={side}
							side={side}
							layout={effective}
							contents={contents}
							focus={focus}
							onGrab={grabber}
							onLayout={onLayout}
							onLayoutEnd={onResizeEnd}
							onMenu={menuFor}
							onHeight={side === "bottom" ? setPill : undefined}
							only={side === "bottom" ? (card) => !isFoot(effective, card.head) : undefined}
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

				{dockVisible(effective, "bottom") && (
					<FootDock
						layout={effective}
						contents={contents}
						focus={focus}
						full={fullFoot}
						onGrab={grabber}
						onLayout={onLayout}
						onMenu={menuFor}
						splitter={
							onResize && onToggle && !fullFoot ? (
								<Splitter
									side="bottom"
									size={effective.docks.bottom.size}
									onResize={(size) => onResize("bottom", size)}
									onResizeEnd={onResizeEnd}
									onToggle={() => onToggle("bottom")}
								/>
							) : undefined
						}
					/>
				)}

				{chrome && <div className="workspace-chrome">{chrome}</div>}

				{/* The preview, drawn over everything and hit by nothing. It has to be
				    `pointer-events: none` or `elementFromPoint` would answer "the
				    overlay" for every position under it, which is every position. */}
				{dragging?.target && <DropPreview target={dragging.target} />}

				{menu && openMenuItems && (
					<Menu
						at={{ element: menu.button, align: "end" }}
						label={`${PANEL_TITLES[menu.panel]}: move, separate or close`}
						sections={[
							{ entries: openMenuItems.moves },
							{ entries: openMenuItems.card },
							{ label: "Closed", entries: openMenuItems.closed },
						]}
						onClose={() => setMenu(null)}
					/>
				)}
			</div>
		</WorkspaceControls.Provider>
	);

	// A press on a card's header, or on one of its tabs, which may become a
	// drag.
	//
	// Nothing happens until the pointer has moved `DRAG_THRESHOLD`, so the
	// header keeps the jobs it has: a tab still switches, the controls a
	// panel put there still work (they are not handles at all; see
	// `onControl`), and a double-click still folds.
	//
	// What it lands on is decided under the pointer, nearest first: another
	// card's header makes a tab of it; the upper or lower half of a docked card
	// puts it above or below; a window edge, that dock; the graph, a window.
	// A window's own card follows the pointer as it goes, and settles where it
	// is let go unless that is somewhere it docks.
	function grab(panel: PanelId, alone: boolean, event: ReactPointerEvent<HTMLElement>) {
		if (event.button !== 0 || compact || !onLayout) return;
		const head = cardOf(layout, panel);
		const windowed = layout.panels[head].floating && !alone;
		const from = layout.panels[head].frame;
		const startX = event.clientX;
		const startY = event.clientY;
		let started = false;
		let target: Target | null = null;

		const move = (e: PointerEvent) => {
			if (!started) {
				if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
				started = true;
				window.getSelection()?.removeAllRanges();
				setMenu(null);
			}
			if (windowed)
				onFramePanel?.(head, {
					...from,
					x: from.x + e.clientX - startX,
					y: from.y + e.clientY - startY,
				});
			target = targetAt(e.clientX, e.clientY, head, panel, alone, windowed);
			setDragging({ panel, alone, windowed, target });
		};

		const end = (e: PointerEvent | undefined) => {
			setDragging(null);
			if (!started || !e) return;
			const drop = targetAt(e.clientX, e.clientY, head, panel, alone, windowed)?.drop ?? null;
			if (!drop || drop.kind === "float") {
				if (windowed) {
					onFramePanelEnd?.();
					return;
				}
				const centre = centreBox.current?.getBoundingClientRect();
				if (!drop || !centre) return;
				onLayout((l) =>
					dropCard(
						l,
						panel,
						{
							kind: "float",
							frame: {
								// Under the pointer by its own header, which is what was grabbed.
								x: Math.round(e.clientX - centre.x - 40),
								y: Math.round(e.clientY - centre.y - 10),
								w: l.panels[head].frame.w,
								h: l.panels[head].frame.h,
							},
						},
						alone,
					),
				);
				return;
			}
			onLayout((l) => dropCard(l, panel, drop, alone));
		};

		trackPointer(event, { move, end });
	}

	/** What a release here would do, and where to draw it. */
	function targetAt(
		x: number,
		y: number,
		self: PanelId,
		panel: PanelId,
		alone: boolean,
		windowed: boolean,
	): Target | null {
		const box = surface.current?.getBoundingClientRect();
		if (!box) return null;
		const local = (r: DOMRect) => ({
			left: r.left - box.left,
			top: r.top - box.top,
			width: r.width,
			height: r.height,
		});
		// Script analysis is the status pill: no tabs either way. Anything else
		// docked at the bottom is the strip along the foot.
		const analysis =
			panel === "analysis" || (!alone && membersOf(layout, self).includes("analysis"));

		for (const element of document.elementsFromPoint(x, y)) {
			const cardEl = element.closest<HTMLElement>(".workspace .card");
			if (!cardEl) continue;
			const other = cardEl.dataset.card as PanelId;
			if (other === self) {
				// A tab let go over its own card stays where it is.
				if (alone || windowed) continue;
				return null;
			}
			const rect = cardEl.getBoundingClientRect();
			const onHead = element.closest(".card-head") !== null;
			if (onHead && !analysis && !HEADLESS.has(other))
				return { drop: { kind: "tab", host: other }, rect: local(rect), label: "Add as a tab" };
			if (cardEl.closest(".dock.left, .dock.right")) {
				const before = y < rect.top + rect.height / 2;
				return {
					drop: { kind: before ? "before" : "after", card: other },
					rect: {
						...local(rect),
						top: local(rect).top + (before ? -6 : rect.height + 2),
						height: 4,
					},
					line: true,
					label: before ? "Above" : "Below",
				};
			}
			break;
		}

		// A side docks near its edge, or anywhere over its own column while it
		// is showing: the room under its cards is still that dock.
		const column = (side: "left" | "right") => {
			const element = surface.current?.querySelector<HTMLElement>(`.dock.${side}:not(.drawer)`);
			if (!element) return false;
			const r = element.getBoundingClientRect();
			return x >= r.left && x <= r.right && y >= r.top && y <= box.bottom - pill;
		};
		const edge = dropZone(box, x, y);
		const side = column("left") ? "left" : column("right") ? "right" : edge;
		if (side) {
			const label =
				side === "left"
					? "Dock on the left"
					: side === "right"
						? "Dock on the right"
						: analysis
							? "Back to the foot"
							: "Along the foot";
			return { drop: { kind: "dock", side }, rect: dockRect(side, box, !analysis), label };
		}
		const centre = centreBox.current?.getBoundingClientRect();
		if (!centre || x < centre.x || x > centre.right || y < centre.y || y > centre.bottom)
			return null;
		if (windowed) return { drop: { kind: "float", frame: layout.panels[self].frame } };
		const frame = layout.panels[self].frame;
		return {
			drop: { kind: "float", frame },
			rect: { left: x - box.left - 40, top: y - box.top - 10, width: frame.w, height: frame.h },
			label: "A window over the graph",
		};
	}

	/**
	 * Where a dock would be: its column under the top row, the left one
	 * stopping above the status pill, or the pill itself at the foot.
	 */
	function dockRect(side: DockSide, box: DOMRect, foot = false) {
		const edge = 10;
		const row = surface.current?.querySelector<HTMLElement>(".workspace-chrome .tool-group");
		const top = row ? row.getBoundingClientRect().bottom - box.top + edge : 58;
		if (side === "bottom" && foot) {
			// The strip between the side columns, at its height, above the pill's row.
			const left =
				dockVisible(effective, "left") && !compact ? effective.docks.left.size + edge : 0;
			const right =
				dockVisible(effective, "right") && !compact ? effective.docks.right.size + edge : 0;
			const above = edge * 2 + 36;
			const height = Math.min(layout.docks.bottom.size, box.height - top - above);
			return {
				left: edge + left,
				top: box.height - above - height,
				width: Math.max(160, box.width - edge * 2 - left - right),
				height,
			};
		}
		if (side === "bottom") {
			const height = Math.max(pill, 40);
			return {
				left: edge,
				top: box.height - edge - height,
				width: Math.min(640, box.width - edge * 2),
				height,
			};
		}
		const size = layout.docks[side].size;
		const bottom = side === "left" ? pill + edge * 2 : edge;
		return {
			left: side === "left" ? edge : box.width - edge - size,
			top,
			width: size,
			height: Math.max(80, box.height - top - bottom),
		};
	}

	/**
	 * The card's menu: where it can go, its tabs, folding and closing, and what
	 * is closed. Its button again closes it.
	 */
	function openMenu(panel: PanelId, button: HTMLElement) {
		if (!onLayout) return;
		setMenu((open) => (open?.button === button ? null : { panel, button }));
	}

	/** Where the card can go, what can be done to the card, and what is closed to bring back. */
	function menuItems(panel: PanelId): {
		moves: MenuEntry[];
		card: MenuEntry[];
		closed: MenuEntry[];
	} {
		if (!onLayout) return { moves: [], card: [], closed: [] };
		const head = cardOf(layout, panel);
		const state = layout.panels[head];
		const members = membersOf(layout, head).filter((id) => layout.panels[id].open);
		const title = PANEL_TITLES[panel];
		const to = (drop: CardDrop) => () => onLayout((l) => dropCard(l, panel, drop));
		const moves: MenuEntry[] = [];
		const card: MenuEntry[] = [];
		if (!state.floating) {
			const frame = state.frame;
			moves.push({ label: "Float over the graph", run: to({ kind: "float", frame }) });
		}
		if (state.floating || state.dock !== "left")
			moves.push({ label: "Dock on the left", run: to({ kind: "dock", side: "left" }) });
		if (state.floating || state.dock !== "right")
			moves.push({ label: "Dock on the right", run: to({ kind: "dock", side: "right" }) });
		if (head === "analysis" && (state.floating || state.dock !== "bottom"))
			moves.push({ label: "Back to the foot", run: to({ kind: "dock", side: "bottom" }) });
		if (head !== "analysis" && (state.floating || state.dock !== "bottom"))
			moves.push({ label: "Along the foot", run: to({ kind: "dock", side: "bottom" }) });
		if (members.length > 1)
			card.push({ label: `Separate ${title}`, run: () => onLayout((l) => separate(l, panel)) });
		card.push({
			label: state.folded ? "Unfold" : "Fold",
			run: () => onLayout((l) => foldCard(l, head, !state.folded)),
		});
		card.push({ label: `Close ${title}`, run: () => onLayout((l) => closePanel(l, panel)) });
		const closed = PANEL_IDS.filter(
			(id) => !layout.panels[id].open && contents[id] !== undefined,
		).map(
			(id): MenuEntry => ({
				label: `Show ${PANEL_TITLES[id]}`,
				icon: id === "inspector" || id === "properties" ? "panelRight" : "panelLeft",
				run: () => onLayout((l) => reopenPanel(l, id)),
			}),
		);
		return { moves, card, closed };
	}
}

/** What a release under the pointer does, and the outline drawn for it. */
interface Target {
	drop: CardDrop;
	rect?: { left: number; top: number; width: number; height: number };
	line?: boolean;
	label?: string;
}

/**
 * Where the card would land, drawn over the place: the card it would join,
 * the line it would go in at, or the dock or window it would make.
 */
function DropPreview({ target }: { target: Target }) {
	if (!target.rect) return null;
	const { left, top, width, height } = target.rect;
	return (
		<>
			<div
				className={cx(
					"drop-preview",
					target.line && "line",
					target.drop.kind !== "tab" && !target.line && "dashed",
				)}
				style={{ left, top, width, height }}
			/>
			{target.label && (
				<div className="drop-label" style={{ left: left + 8, top: Math.max(4, top - 24) }}>
					{target.label}
				</div>
			)}
		</>
	);
}

/**
 * A dock's cards, top to bottom, with a line between each two.
 *
 * Two or more open cards share the column's height, each by its weight, and
 * the line between two trades height between them. A lone card, or one with
 * the rest folded, is as tall as what it shows, as a card has always been.
 */
function DockCards({
	side,
	layout,
	contents,
	focus,
	onGrab,
	onLayout,
	onLayoutEnd,
	onMenu,
	onHeight,
	only,
	splitter,
}: {
	side: DockSide;
	layout: Layout;
	contents: Partial<Record<PanelId, ReactNode>>;
	focus: PanelId | null;
	onGrab?: (panel: PanelId, alone: boolean, event: ReactPointerEvent<HTMLElement>) => void;
	onLayout?: (change: (layout: Layout) => Layout, persist?: boolean) => void;
	onLayoutEnd?: () => void;
	onMenu?: (panel: PanelId, anchor: HTMLElement) => void;
	/** Told the dock's height as it changes: the status pill's, for the column above it. */
	onHeight?: (height: number) => void;
	/** Which of the dock's cards this column draws: at the bottom, the pill's and not the foot's. */
	only?: (card: Card) => boolean;
	splitter?: ReactNode;
}) {
	const column = useRef<HTMLDivElement>(null);
	const cards = cardsIn(layout, side, (id) => contents[id] !== undefined).filter(
		(card) => !only || only(card),
	);
	const drawn = cards.length > 0;
	useEffect(() => {
		const element = column.current;
		if (!onHeight || !drawn || !element) return;
		// Once now, and on every change after: an observer only reports
		// while the page is being drawn.
		onHeight(element.offsetHeight);
		if (typeof ResizeObserver === "undefined") return;
		const watch = new ResizeObserver(() => onHeight(element.offsetHeight));
		watch.observe(element);
		return () => watch.disconnect();
	}, [onHeight, drawn]);
	if (!drawn) return null;
	const shared = side !== "bottom" && cards.filter((card) => !card.folded).length >= 2;

	// The two cards either side of a line trade height; the rest keep theirs.
	function share(above: Card, below: Card, e: ReactPointerEvent<HTMLDivElement>) {
		if (e.button !== 0 || !onLayout) return;
		e.preventDefault();
		const a = column.current?.querySelector<HTMLElement>(`.card[data-card="${above.head}"]`);
		const b = column.current?.querySelector<HTMLElement>(`.card[data-card="${below.head}"]`);
		if (!a || !b) return;
		const ha = a.offsetHeight;
		const hb = b.offsetHeight;
		const least = (a.querySelector<HTMLElement>(".card-head")?.offsetHeight ?? 30) + 60;
		const perWeight = (ha + hb) / (above.weight + below.weight);
		const startY = e.clientY;
		const handle = e.currentTarget;
		handle.classList.add("active");
		trackPointer(e, {
			move: (m) => {
				const next = Math.min(ha + hb - least, Math.max(least, ha + m.clientY - startY));
				onLayout(
					(l) =>
						shareHeight(l, above.head, below.head, [
							next / perWeight,
							(ha + hb - next) / perWeight,
						]),
					false,
				);
			},
			end: () => {
				handle.classList.remove("active");
				onLayoutEnd?.();
			},
		});
	}

	return (
		<div
			ref={column}
			className={cx("dock", side, shared && "shared")}
			style={side !== "bottom" ? { width: layout.docks[side].size } : undefined}
		>
			{splitter}
			{cards.map((card, i) => {
				const above = cards[i - 1];
				const live = shared && above !== undefined && !above.folded && !card.folded;
				return (
					<Fragment key={card.head}>
						{above && (
							<div
								className={cx("card-split", live && "live")}
								role={live ? "separator" : undefined}
								aria-orientation={live ? "horizontal" : undefined}
								title={
									live ? "Drag to share the height. Double-click to share it evenly." : undefined
								}
								onPointerDown={live ? (e) => share(above, card, e) : undefined}
								onDoubleClick={
									live
										? () => {
												const even = (above.weight + card.weight) / 2;
												onLayout?.((l) => shareHeight(l, above.head, card.head, [even, even]));
											}
										: undefined
								}
							/>
						)}
						<CardView
							card={card}
							contents={contents}
							focus={focus !== null && card.tabs.includes(focus)}
							onGrab={onGrab}
							onShow={(id) => onLayout?.((l) => showTab(l, id))}
							onFold={(folded) => onLayout?.((l) => foldCard(l, card.head, folded))}
							onMenu={onMenu}
							style={shared && !card.folded ? { flex: `${card.weight} 1 0px` } : undefined}
						/>
					</Fragment>
				);
			})}
		</div>
	);
}

/**
 * The strip along the foot of the graph: the bottom dock's cards other than
 * the status pill -- the Code panel, unless it has been moved.
 *
 * Between the side columns rather than under them, so the tree, Variables and
 * the Inspector stay where they are while code is open below the graph, and
 * as tall as the dock's size, which its top edge drags. Two cards here sit
 * side by side. In full view it grows to the top bar.
 */
function FootDock({
	layout,
	contents,
	focus,
	full,
	onGrab,
	onLayout,
	onMenu,
	splitter,
}: {
	layout: Layout;
	contents: Partial<Record<PanelId, ReactNode>>;
	focus: PanelId | null;
	full: boolean;
	onGrab?: (panel: PanelId, alone: boolean, event: ReactPointerEvent<HTMLElement>) => void;
	onLayout?: (change: (layout: Layout) => Layout, persist?: boolean) => void;
	onMenu?: (panel: PanelId, anchor: HTMLElement) => void;
	splitter?: ReactNode;
}) {
	const cards = cardsIn(layout, "bottom", (id) => contents[id] !== undefined).filter((card) =>
		isFoot(layout, card.head),
	);
	if (cards.length === 0) return null;
	return (
		<div
			className={cx("dock", "foot", full && "full")}
			style={full ? undefined : { height: layout.docks.bottom.size }}
		>
			{splitter}
			{cards.map((card) => (
				<CardView
					key={card.head}
					card={card}
					contents={contents}
					focus={focus !== null && card.tabs.includes(focus)}
					onGrab={onGrab}
					onShow={(id) => onLayout?.((l) => showTab(l, id))}
					onFold={(folded) => onLayout?.((l) => foldCard(l, card.head, folded))}
					onMenu={onMenu}
				/>
			))}
		</div>
	);
}

/**
 * A card in a window over the graph: moved by its header, as a docked card
 * is, and resized from any edge or corner, the opposite one staying put.
 */
function FloatingCard({
	card,
	frame,
	contents,
	focus,
	onGrab,
	onLayout,
	onMenu,
	onFrame,
	onFrameEnd,
}: {
	card: Card;
	frame: PanelFrame;
	contents: Partial<Record<PanelId, ReactNode>>;
	focus: boolean;
	onGrab?: (panel: PanelId, alone: boolean, event: ReactPointerEvent<HTMLElement>) => void;
	onLayout?: (change: (layout: Layout) => Layout, persist?: boolean) => void;
	onMenu?: (panel: PanelId, anchor: HTMLElement) => void;
	onFrame?: (panel: PanelId, frame: PanelFrame) => void;
	onFrameEnd?: () => void;
}) {
	// Held rather than read per move: working each frame out from the last
	// accumulates rounding, and a window walks away from the pointer.
	function resize(e: ReactPointerEvent<HTMLElement>, edge: string) {
		if (e.button !== 0 || !onFrame) return;
		e.preventDefault();
		e.stopPropagation();
		const from = frame;
		const x0 = e.clientX;
		const y0 = e.clientY;
		trackPointer(e, {
			move: (m) => {
				const dx = m.clientX - x0;
				const dy = m.clientY - y0;
				const next = { ...from };
				if (edge.includes("e")) next.w = Math.max(MIN_FLOAT.w, from.w + dx);
				if (edge.includes("s")) next.h = Math.max(MIN_FLOAT.h, from.h + dy);
				// Clamped by what is taken rather than by the size, or the window
				// slides past its own far edge once it has nothing left to give.
				if (edge.includes("w")) {
					const take = Math.min(dx, from.w - MIN_FLOAT.w);
					next.x = from.x + take;
					next.w = from.w - take;
				}
				if (edge.includes("n")) {
					const take = Math.min(dy, from.h - MIN_FLOAT.h);
					next.y = from.y + take;
					next.h = from.h - take;
				}
				onFrame(card.head, next);
			},
			end: () => onFrameEnd?.(),
		});
	}

	return (
		<CardView
			card={card}
			contents={contents}
			focus={focus}
			onGrab={onGrab}
			onShow={(id) => onLayout?.((l) => showTab(l, id))}
			onFold={(folded) => onLayout?.((l) => foldCard(l, card.head, folded))}
			onMenu={onMenu}
			className={cx("floating", "float-panel", `float-${card.head}`)}
			style={{
				left: frame.x,
				top: frame.y,
				width: frame.w,
				height: card.folded ? undefined : frame.h,
			}}
		>
			{EDGES.map((edge) => (
				<div
					key={edge}
					className={cx("card-size", edge)}
					title="Drag to resize"
					onPointerDown={(e) => resize(e, edge)}
				/>
			))}
		</CardView>
	);
}

/** A window's edges and corners, each a handle. */
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/**
 * One dock on a phone or a tablet: its panels as drawers, one out at a time,
 * each with a header saying what it is and carrying its controls.
 */
function DrawerDock({
	side,
	contents,
	drawer,
	splitter,
}: {
	side: DockSide;
	contents: Partial<Record<PanelId, ReactNode>>;
	drawer: { ids: PanelId[]; open: PanelId | null; onShow: (panel: PanelId) => void };
	splitter?: ReactNode;
}) {
	const ids = drawer.ids;
	if (ids.length === 0) return null;
	const out = drawer.open !== null && ids.includes(drawer.open);
	return (
		<div
			className={cx("dock", side, "drawer", out && "drawer-open")}
			// Kept mounted while it is in, so the tree keeps what was expanded
			// and where it was scrolled to -- but out of reach of focus.
			inert={!out}
		>
			{splitter}
			{/* A drawer holds one panel at a time. With more than one on its side,
			    they are tabs in its header, as a card's are on a computer. */}
			{ids.map((id) => (
				<DrawerPanel
					key={id}
					id={id}
					away={drawer.open !== id}
					tabs={ids.length > 1 ? ids : undefined}
					onShow={drawer.onShow}
				>
					{contents[id]}
				</DrawerPanel>
			))}
		</div>
	);
}

function DrawerPanel({
	id,
	away,
	tabs,
	onShow,
	children,
}: {
	id: PanelId;
	away: boolean;
	/** Every panel in this drawer, drawn as tabs, when there is more than one. */
	tabs?: PanelId[];
	onShow: (panel: PanelId) => void;
	children: ReactNode;
}) {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	return (
		<div className={cx("panel", `panel-${id}`, away && "panel-away")}>
			{!HEADLESS.has(id) && (
				<header className="card-head">
					{tabs ? (
						<span className="card-tabs" role="tablist">
							{tabs.map((tab) => (
								<button
									key={tab}
									type="button"
									role="tab"
									aria-selected={tab === id}
									className={cx("card-tab", tab === id && "on")}
									onClick={() => onShow(tab)}
								>
									{PANEL_TITLES[tab]}
								</button>
							))}
						</span>
					) : (
						<span className="card-title">{PANEL_TITLES[id]}</span>
					)}
					<span
						className="card-slot"
						ref={(el) => {
							if (el !== slot) setSlot(el);
						}}
					/>
				</header>
			)}
			<PanelBody slot={slot}>{children}</PanelBody>
		</div>
	);
}

/**
 * The grab handle between a dock and the centre.
 *
 * Drag to resize; **double-click to put the dock away**, as its button on the
 * top row does.
 *
 * Followed on the window rather than captured on the handle: if a capture is
 * not granted, or is lost, the release happens somewhere the handle never
 * hears about, and the next time the pointer passes over it with no button
 * held the dock carries on resizing on its own. A move that arrives with
 * nothing held ends the drag, for the same failure.
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
			title="Drag to resize. Double-click to put the dock away."
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
