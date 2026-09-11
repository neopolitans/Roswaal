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

/** Canvas geometry, shared by the renderer and the wire router. */
export const NODE = {
	width: 216,
	headerHeight: 30,
	/** Header height when a node shows a second line, e.g. a function signature. */
	headerHeightTall: 46,
	rowHeight: 24,
	/** Height of a compact getter capsule. */
	compactHeight: 28,
	/** Minimum capsule width, and roughly the pixels one character adds. */
	compactMinWidth: 96,
	compactCharWidth: 6.8,
	compactPadding: 46,
	/**
	 * One character of a node's header title, and the space around it.
	 *
	 * Estimated rather than measured, for the reason `compactWidth` estimates:
	 * the wire router cannot wait on a DOM layout, and a node a few pixels wider
	 * than its text is better than a wire that arrives a frame late.
	 *
	 * **One number, used by both sides.** The canvas and the documentation's
	 * pictures each compute a widened node's size, and a pin's position follows
	 * from it — so two estimates that differed by a fraction of a pixel would
	 * put a node and its own picture out of step. `PreviewGeometry` takes this
	 * field for exactly that reason.
	 */
	titleCharWidth: 6.8,
	/**
	 * The header's own padding, plus room for what sits beside the title: the
	 * latent hourglass, and the − / + a growable node carries.
	 */
	headerPadding: 54,
	/** A reroute knot is a dot with a pin either side. */
	rerouteSize: 22,
	/**
	 * The operator pill: space above and below its rows, and the middle column
	 * its symbol sits in. The character width is for 13px bold monospace, in the
	 * same spirit as `compactCharWidth` — estimated rather than measured, so a
	 * wire can be routed to a node that has not rendered yet.
	 */
	operatorPad: 2,
	operatorCharWidth: 8,
	operatorMinSymbol: 30,
	/**
	 * The pill's corner: a constant, rather than half of whatever the pill's
	 * height happens to be.
	 *
	 * `border-radius: 999px` clamps to half the shorter side, which is a capsule
	 * at one row and an *ellipse* at three -- and an ellipse's sides curve away
	 * from the pins sitting against them, so a wire ends at a point outside the
	 * shape it is meant to touch. At exactly half of `compactHeight` this is the
	 * same capsule for a one-row pill and a rounded rectangle for a taller one.
	 * It scales with the canvas for free, because the canvas scales in pixels.
	 */
	operatorRadius: 14,
	/** `.node .literal`'s two widths and a checkbox, which set a pill's width. */
	fieldWidth: 70,
	fieldWide: 92,
	checkWidth: 13,
	/** One of the − / + buttons a variadic pill carries beside its symbol. */
	growButton: 14,
	/** Padding below the last pin row. */
	footer: 10,
	pinRadius: 5,
	/**
	 * The square a pin is drawn in, and the gap between it and the node's edge.
	 *
	 * These three are also written in `theme.css` — as `--pin-slot`, the row's
	 * side padding, and the node's `border-radius` — because CSS cannot read
	 * this file. They live here as well so the documentation's node previews are
	 * drawn from the same numbers the canvas is, rather than from a second
	 * guess at them. Change one and change the other.
	 */
	pinSlot: 16,
	rowPadding: 6,
	radius: 7,
	/** How far a bezier control point reaches horizontally. */
	wireSlack: 70,
	/**
	 * How far a rigid wire runs straight out of a pin before it may turn.
	 *
	 * Smaller than `wireSlack`, because a bezier's control point is a pull
	 * rather than a distance travelled: the curve leaves the pin horizontally
	 * and is already turning, where a rigid wire genuinely goes this far before
	 * bending. Matching the two numbers made the rigid styles look padded.
	 */
	wireStub: 22,
	/**
	 * How far a backwards wire drops before running back, when its two pins are
	 * at nearly the same height. Without it the detour collapses onto a single
	 * line straight through both nodes.
	 */
	wireBackstep: 40,
	/** The 45-degree cut taken off each corner in the angular wire style. */
	wireChamfer: 14,
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
