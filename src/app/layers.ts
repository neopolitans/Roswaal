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
	/** Context menus and popovers, above everything on the canvas. */
	menu: 70,
} as const;

export type LayerName = keyof typeof LAYER;

/** Canvas geometry, shared by the renderer and the wire router. */
export const NODE = {
	width: 216,
	headerHeight: 30,
	/** Header height when a node shows a second line, e.g. a function signature. */
	headerHeightTall: 46,
	rowHeight: 24,
	/** Padding below the last pin row. */
	footer: 10,
	pinRadius: 5,
	/** How far a bezier control point reaches horizontally. */
	wireSlack: 70,
} as const;

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
