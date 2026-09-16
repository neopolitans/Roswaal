/**
 * The canvas ZIndex map.
 *
 * Every overlapping element on the canvas takes its stacking order from here
 * rather than from a literal sprinkled through a stylesheet, so the order is
 * one list to read and one list to change.
 */
export const LAYER = {
	/** The flat canvas colour. Nothing is ever behind this. */
	background: 0,
	/** The grid, which rescales with zoom. */
	grid: 10,
	/** The graph name, bottom right, sitting just above the grid. */
	watermark: 20,
	/**
	 * The transformed layer everything in the graph is drawn inside.
	 *
	 * It needs a number of its own, and the reason is the one thing about this
	 * table that is not obvious. Every value below this one is resolved
	 * *inside* `.world`, which is a stacking context because it is
	 * transformed. So `node: 50` does not mean the node is above the grid --
	 * it means the node is above the wires drawn beside it. What the reader
	 * sees a node painted over is decided here, once, by where `.world` sits
	 * among the grid and the watermark.
	 *
	 * Left unset, `.world` was `z-index: auto`, which paints below every
	 * positioned sibling that has a number. The grid and the watermark both
	 * have one, so both were painted over the top of every node on the canvas
	 * -- faintly enough, at 5% to 14% alpha, to read as texture rather than as
	 * something wrong.
	 */
	world: 25,
	/** Comment boxes group nodes, so they sit behind them. */
	comment: 30,
	/** Comment title bars, which stay grabbable when nodes overlap the body. */
	commentHeader: 35,
	/** Wires pass behind nodes so a pin is never obscured by its own link. */
	wire: 40,
	/** The wire currently being dragged out of a pin. */
	wireDrag: 45,
	node: 50,
	nodeSelected: 55,
	/** Marquee selection rectangle. */
	marquee: 60,
	/**
	 * The read-only cover while the graph is being compiled. Above everything
	 * drawn on the canvas, because its whole job is to swallow the pointer, and
	 * below the menus, which are `position: fixed` and outside this stack
	 * anyway.
	 */
	lock: 65,
	/** Context menus and popovers, above everything on the canvas. */
	menu: 70,
} as const;

export type LayerName = keyof typeof LAYER;

/**
 * Node metrics, which moved to core when the compiler needed them too.
 * Re-exported here because everything drawing a node already imports from this
 * file, and a move should not be a hundred-line diff of import lines.
 */
export { NODE } from "../core/nodeMetrics.js";

/** The canvas's own grid and zoom, which nothing outside it needs. */
export const GRID = {
	/** World-space spacing of the fine grid. */
	fine: 24,
	/** Every nth fine line is drawn heavier. */
	coarseMultiple: 5,
	/** Below this zoom the fine grid is hidden rather than turned into mush. */
	fineFadeBelow: 0.55,
} as const;

export const ZOOM = {
	min: 0.2,
	max: 2.5,
	step: 1.1,
} as const;
