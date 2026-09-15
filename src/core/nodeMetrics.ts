/**
 * How big a node is drawn, in numbers.
 *
 * In core rather than beside the z-index map it used to live with, because
 * three things need it and only one of them is the canvas: the editor draws
 * nodes from it, the documentation draws its pictures from it, and the compiler
 * asks which nodes a comment box is drawn around -- which is a question about
 * rectangles. `src/core` cannot import from `src/app`, so a shared fact has to
 * live down here or be guessed at twice.
 *
 * `src/app/layers.ts` re-exports it, so everything that reached for it there
 * still can.
 */

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
	 * These three are also written in `theme.css` — as `--pin-slot`, `--pin-pad`
	 * and the node's `border-radius` — because CSS cannot read this file. They
	 * live here as well so the documentation's node previews are drawn from the
	 * same numbers the canvas is, rather than from a second guess at them.
	 * Change one and change the other.
	 *
	 * `rowPadding` is now the pin's *layout* slot rather than where the pin is
	 * drawn: a pin hangs on the node's edge, and the row keeps the space it used
	 * to sit in so labels and values stay in their columns. See `execAspect`.
	 */
	pinSlot: 16,
	rowPadding: 6,
	radius: 7,
	/**
	 * How much of a row a pin still takes once it is drawn on the edge instead
	 * of inside it — `--pin-lane` in `theme.css`.
	 *
	 * The *layout*, not the pin: the pin is still `pinSlot` across. Only its
	 * inner half is inside the node, so the row reserves that much plus air and
	 * the label starts where the pin visibly stops, which is what gives a long
	 * pin name the room the old slot was holding for a dot that has moved out.
	 */
	pinLane: 10,
	/**
	 * The node's own border — `--node-stroke` in `theme.css`.
	 *
	 * Named because a pin has to be placed *through* it. A wire attaches on the
	 * outside of the border and a pin row is laid out inside it, so anything
	 * measured from the row is one pixel in from where the wire is, and the
	 * border shows as a sliver down the side of the dot.
	 */
	nodeStroke: 1,
	/**
	 * An execution pin is an equilateral triangle pointing right, as tall as the
	 * pin slot — so its width is √3⁄2 of that, and this is the only place that
	 * number is written. `theme.css` reads it as `--exec-width`.
	 *
	 * It matters outside the stylesheet because an exec pin hangs *outside* the
	 * node: its width is how far a node's drawing reaches past its own bounds,
	 * which is what a preview's viewBox has to leave room for.
	 */
	execAspect: 0.866,
	/**
	 * Daylight between an execution triangle and the node it hangs off.
	 * `--exec-gap` in `theme.css`. Touching, the two read as one shape with a
	 * bite out of it; apart, the pin reads as something hung on the node.
	 */
	execGap: 5,
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
