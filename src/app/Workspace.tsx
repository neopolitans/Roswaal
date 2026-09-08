/**
 * The dockable workspace: three docks around a centre.
 *
 * The rendering half of the system designed in `docs/PANELS.md`. It takes a
 * `Layout` and the contents of each panel, and puts them where the layout says.
 *
 * ## Panels are placed by `grid-area`, never by position in the tree
 *
 * The most important line in the design, and the one place this departs from
 * Beako's docks. Beako moves a panel by `append`-ing the live node, so it keeps
 * its scroll position, its content and its listeners. React cannot: a component
 * moved to a different parent unmounts and remounts, throwing all of that away.
 * A project tree that jumps back to the top whenever you dock it reads as a
 * scrolling bug rather than a layout one, and would be debugged as one.
 *
 * So every panel is rendered **once**, in a fixed place in this tree, and only
 * its `gridArea` changes. Moving a panel between docks is then a style change,
 * which React applies without touching the subtree.
 *
 * ## Every child is pinned to its track
 *
 * `display: none` does not merely hide a grid child — it stops it being a grid
 * *item*, and auto-placement closes up behind it. Beako lost an afternoon to
 * this: with both docks closed, its centre was auto-placed into the left dock's
 * track and took that track's width, while every piece of state was correct.
 *
 * Every element below therefore names its `gridArea` explicitly. That looks
 * like tidiness and is not.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import {
	dockVisible, dropZone, gridTemplate, panelsIn, PANEL_IDS, PANEL_TITLES,
	type DockSide, type Layout, type PanelId,
} from "./panels.js";

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
}

/** How far the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

export function Workspace({
	layout, contents, centre, floating, onResize, onResizeEnd, onToggle, onMovePanel,
}: WorkspaceProps) {
	const surface = useRef<HTMLDivElement>(null);
	/** The panel under the pointer, and where it would land if released now. */
	const [dragging, setDragging] = useState<{ panel: PanelId; over: DockSide | null } | null>(null);
	/**
	 * A panel with nothing to draw is not open.
	 *
	 * The inspector only has content while exactly one node is selected, and
	 * the variables panel only while a graph is open. Asking `gridTemplate` for
	 * tracks from the raw layout reserves those columns anyway — 290px of dead
	 * space to the right of the graph whenever nothing is selected, which is
	 * exactly the column the old fixed layout only added when it had something
	 * to put in it.
	 *
	 * Derived here rather than in `panels.ts` because it is a fact about
	 * rendering, not about the layout: the developer did not close the
	 * inspector, and it must come back the moment it has something to say.
	 */
	const effective: Layout = {
		...layout,
		panels: Object.fromEntries(
			PANEL_IDS.map((id) => [
				id,
				contents[id] === undefined
					? { ...layout.panels[id], open: false }
					: layout.panels[id],
			]),
		) as Layout["panels"],
	};

	const tracks = gridTemplate(effective);

	return (
		<div
			className={`workspace${dragging ? " dragging" : ""}`}
			ref={surface}
			style={{ gridTemplateColumns: tracks.columns, gridTemplateRows: tracks.rows }}
		>
			{(["left", "right", "bottom"] as DockSide[]).map((side) =>
				dockVisible(effective, side) ? (
					<Dock
						key={side}
						side={side}
						layout={effective}
						contents={contents}
						onDragPanel={onMovePanel ? startDrag : undefined}
					/>
				) : null,
			)}

			{/* Side docks only. The bottom is content-sized -- see `gridTemplate`
			    -- so there is nothing for a splitter there to drag. */}
			{(["left", "right"] as DockSide[]).map((side) =>
				dockVisible(effective, side) && onResize && onToggle ? (
					<Splitter
						key={`split-${side}`}
						side={side}
						size={effective.docks[side].size}
						onResize={(size) => onResize(side, size)}
						onResizeEnd={onResizeEnd}
						onToggle={() => onToggle(side)}
					/>
				) : null,
			)}

			<div className="centre" style={{ gridArea: "centre" }}>
				{centre}
				{floating}
			</div>

			{/* The preview, drawn over everything and hit by nothing. It has to be
			    `pointer-events: none` or `elementFromPoint` would answer "the
			    overlay" for every position under it, which is every position. */}
			{dragging?.over && <DropPreview side={dragging.over} layout={effective} />}
		</div>
	);

	/**
	 * A press on a panel's own heading, which may become a drag.
	 *
	 * The heading is the handle rather than a bar the dock adds, because every
	 * panel already has one — the project name, "Variables", "Node", the
	 * diagnostics summary — and a second title strip above those would be a row
	 * of chrome repeating what is directly beneath it.
	 *
	 * Nothing happens until the pointer has moved `DRAG_THRESHOLD`. That is what
	 * lets the headings keep the jobs they already had: the Add button inside
	 * the Variables heading still adds, and clicking the diagnostics bar still
	 * collapses it, because neither is a drag until you move.
	 */
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

		const up = (e: PointerEvent) => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			setDragging(null);
			if (!started) return;
			const rect = surface.current?.getBoundingClientRect();
			const side = rect ? dropZone(rect, e.clientX, e.clientY) : null;
			if (side) onMovePanel?.(panel, side);
		};

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
	}
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
	side, layout, contents, onDragPanel,
}: {
	side: DockSide;
	layout: Layout;
	contents: Partial<Record<PanelId, ReactNode>>;
	onDragPanel?: (panel: PanelId, event: ReactPointerEvent<HTMLElement>) => void;
}) {
	const ids = panelsIn(layout, side).filter((id) => contents[id] !== undefined);
	if (ids.length === 0) return null;

	return (
		<div className={`dock ${side}`} style={{ gridArea: side }}>
			{ids.map((id) => (
				<div
					className={`panel panel-${id}`}
					key={id}
					title={onDragPanel ? `Drag ${PANEL_TITLES[id]} by its heading to another edge` : undefined}
					onPointerDown={onDragPanel ? (e) => onDragPanel(id, e) : undefined}
				>
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
	side, size, onResize, onResizeEnd, onToggle,
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
		const handle = e.currentTarget;
		handle.setPointerCapture(e.pointerId);

		const startX = e.clientX;
		const startY = e.clientY;

		const move = (move: PointerEvent) => {
			// Each side grows in a different direction: the left dock follows the
			// pointer, the right and bottom grow as it moves back towards them.
			const delta =
				side === "left" ? move.clientX - startX
				: side === "right" ? startX - move.clientX
				: startY - move.clientY;
			onResize(size + delta);
		};
		const up = () => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", up);
			handle.removeEventListener("pointercancel", up);
			onResizeEnd?.();
		};

		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", up);
		handle.addEventListener("pointercancel", up);
	}

	return (
		<div
			className={`splitter ${side} ${axis}`}
			style={{ gridArea: `split-${side}` }}
			role="separator"
			aria-orientation={axis === "col" ? "vertical" : "horizontal"}
			title="Drag to resize. Double-click to collapse."
			onPointerDown={onPointerDown}
			onDoubleClick={onToggle}
		/>
	);
}
