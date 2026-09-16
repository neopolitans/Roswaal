/**
 * Canvas geometry.
 *
 * Node size and pin positions are computed from the graph rather than measured
 * from the DOM, so a wire can be routed to a node that has not rendered yet and
 * layout never depends on when React commits.
 */

import { NODE } from "./layers.js";
import { execReach } from "../core/pinLayout.js";
import type { GraphNode } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";

export interface Vec {
	x: number;
	y: number;
}

/**
 * Node sizing moved to `src/core/nodeBox.ts` when the compiler needed it too:
 * asking which nodes a comment is drawn around is a question about rectangles,
 * and `src/core` cannot import from here. Re-exported so every drawing module
 * still reaches for it in the place it always did.
 */
export {
	compactLabel, compactWidth, headerHeight, isCompact, isOperator, isReroute, nodeBounds,
	nodeHeight, nodeWidth, operatorLayoutOf, rectContains, resolvePins, type Rect,
} from "../core/nodeBox.js";

import {
	compactWidth, headerHeight, isCompact, isOperator, isReroute, nodeWidth,
	operatorLayoutOf, resolvePins, type Rect,
} from "../core/nodeBox.js";

/** World position of a pin's connection point. */
export function pinPosition(
	node: GraphNode, registry: Registry, pinId: string, side: "in" | "out", wide = false,
): Vec | null {
	const def = registry.get(node.def);
	if (!def) return null;
	const { inputs, outputs } = resolvePins(def, node.config);
	const list = side === "in" ? inputs : outputs;
	const index = list.findIndex((p) => p.id === pinId);
	if (index === -1) return null;

	// Both pins of a knot sit at its centre, so a wire passes straight through
	// it rather than jogging around a box.
	if (isReroute(def)) {
		return {
			x: node.x + NODE.rerouteSize / 2,
			y: node.y + NODE.rerouteSize / 2,
		};
	}

	// A capsule has one pin, on the right, halfway down.
	if (isCompact(def)) {
		return {
			x: node.x + compactWidth(def, node),
			y: node.y + NODE.compactHeight / 2,
		};
	}

	// A pill's inputs run down its left; its one result sits on the right, level
	// with the middle of the pill rather than with a row.
	if (isOperator(def)) {
		const layout = operatorLayoutOf(def, node.config, node.literals);
		return side === "in"
			? { x: node.x, y: node.y + layout.rowsTop + index * NODE.rowHeight + NODE.rowHeight / 2 }
			: { x: node.x + layout.width, y: node.y + layout.height / 2 };
	}
	const reach = list[index].kind === "exec" ? execReach(NODE) : 0;
	return {
		x: side === "in" ? node.x - reach : node.x + nodeWidth(def, node, wide) + reach,
		y:
			node.y +
			headerHeight(def, node.config) +
			index * NODE.rowHeight +
			NODE.rowHeight / 2,
	};
}

/**
 * How a wire is drawn between two pins.
 *
 * A preference rather than a property of the graph: it changes nothing about
 * what the graph means or what it compiles to, and two people sharing a
 * repository should not have to agree about it. People have modified other
 * node editors to get the two rigid styles before now, which is the argument
 * for having them here rather than making somebody fork this to get them.
 */
export type WireStyle = "curved" | "rigid" | "angular";

/**
 * Where a wire is allowed to bend, before any style is applied.
 *
 * The route for `rigid`, and for the wires `angular` has no straight line to
 * take — see `diagonal`. It was the route for both until 0.47.0, when angular
 * turned out to be drawing a chamfered right angle where it was meant to be
 * drawing a diagonal.
 *
 * There is deliberately no obstacle avoidance. A router that dodged nodes would
 * reroute every wire in the graph whenever one node moved, and a wire that
 * takes a different path each time you nudge something is harder to follow than
 * one that crosses a node.
 */
function manhattan(from: Vec, to: Vec): Vec[] {
	const stub = NODE.wireStub;

	// The ordinary case: output on the left of its input. One vertical run,
	// halfway between them, so two wires between the same pair of columns do
	// not sit on top of each other's corners.
	//
	// Any forward gap counts, however short. This used to ask for two stubs'
	// worth of room, and nodes set closer than that took the backwards detour
	// below — a loop out and around, for a wire whose input was plainly to the
	// right. The vertical run just sits closer to both pins.
	if (to.x > from.x) {
		if (from.y === to.y) return [from, to];
		const midX = (from.x + to.x) / 2;
		return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
	}

	// Backwards — a loop, or a node dragged to the left of its source. The wire
	// has to leave rightwards and enter leftwards regardless, so it goes out,
	// along a lane, and back.
	const outX = from.x + stub;
	const inX = to.x - stub;
	// Two pins at the same height would put the lane straight through both
	// nodes and the whole detour would collapse onto one invisible line.
	const midY =
		Math.abs(to.y - from.y) < NODE.rowHeight
			? from.y + NODE.wireBackstep
			: (from.y + to.y) / 2;

	return [
		from,
		{ x: outX, y: from.y },
		{ x: outX, y: midY },
		{ x: inX, y: midY },
		{ x: inX, y: to.y },
		to,
	];
}

/**
 * The angular route: out of the pin, one straight run, into the pin.
 *
 * A short horizontal stub at each end so the wire leaves and arrives level with
 * its pin — which is what makes it read as attached rather than as a line that
 * happens to end there — and a single straight segment between them. **Not a
 * chamfered right angle**, which is what this style drew for its first eleven
 * releases and is a different shape entirely: the diagonal is the whole line
 * rather than a corner treatment.
 *
 * The stub shrinks on a short hop so the two never overlap and send the middle
 * run backwards. Level pins get one straight line, because a stub either side
 * of a horizontal run is the same horizontal run with two extra points in it.
 *
 * A wire that has to go *backwards* keeps the Manhattan lane: there is no
 * straight line from a pin to something behind it that does not cross its own
 * node, so it goes out, along and back, with its corners cut.
 */
function diagonal(from: Vec, to: Vec): Vec[] {
	if (from.y === to.y) return [from, to];

	const stub = Math.min(NODE.wireStub, Math.max(0, (to.x - from.x) / 2));
	if (stub <= 0) return manhattan(from, to);

	return [from, { x: from.x + stub, y: from.y }, { x: to.x - stub, y: to.y }, to];
}

/**
 * A polyline, with each corner optionally cut at 45 degrees.
 *
 * `chamfer` of zero gives square corners; anything else gives the slope between
 * two axis-aligned runs. The cut is clamped to half of the shorter adjoining
 * segment, so a corner between two short runs shrinks its own chamfer rather
 * than overshooting into the next one and drawing a wire that doubles back.
 */
function polyline(points: Vec[], chamfer: number): string {
	const round = (n: number) => Math.round(n * 100) / 100;
	let d = `M ${round(points[0].x)} ${round(points[0].y)}`;

	for (let i = 1; i < points.length - 1; i++) {
		const prev = points[i - 1];
		const corner = points[i];
		const next = points[i + 1];

		const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
		const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
		const cut = Math.min(chamfer, inLength / 2, outLength / 2);

		if (cut <= 0) {
			d += ` L ${round(corner.x)} ${round(corner.y)}`;
			continue;
		}

		const back = {
			x: corner.x - ((corner.x - prev.x) / inLength) * cut,
			y: corner.y - ((corner.y - prev.y) / inLength) * cut,
		};
		const forward = {
			x: corner.x + ((next.x - corner.x) / outLength) * cut,
			y: corner.y + ((next.y - corner.y) / outLength) * cut,
		};
		d += ` L ${round(back.x)} ${round(back.y)} L ${round(forward.x)} ${round(forward.y)}`;
	}

	const end = points[points.length - 1];
	return `${d} L ${round(end.x)} ${round(end.y)}`;
}

/**
 * The path between two pins, in the developer's chosen style.
 *
 * `curved` is the default, and is what every caller that does not care gets —
 * the static docs site among them, which has no preferences to read. The Docs
 * window passes the reader's own style, so its pictures match their canvas.
 */
export function wirePath(from: Vec, to: Vec, style: WireStyle = "curved"): string {
	if (style === "curved") {
		// Slack grows with distance so short hops stay tight and long ones still
		// leave the pin horizontally instead of cutting across the node.
		const slack = Math.max(NODE.wireSlack, Math.abs(to.x - from.x) * 0.4);
		return `M ${from.x} ${from.y} C ${from.x + slack} ${from.y}, ${to.x - slack} ${to.y}, ${to.x} ${to.y}`;
	}
	if (style === "angular") {
		const route = diagonal(from, to);
		// A diagonal route turns twice and both turns are already soft; a route
		// that fell back to the lane is a right angle and wants its corners cut.
		return polyline(route, route.length > 4 ? NODE.wireChamfer : 0);
	}
	return polyline(manhattan(from, to), 0);
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Normalises a drag between two points into a positive-extent rectangle. */
export function rectFromPoints(a: Vec, b: Vec): Rect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	};
}

export interface View {
	x: number;
	y: number;
	zoom: number;
}

export function screenToWorld(view: View, sx: number, sy: number): Vec {
	return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
}

export function worldToScreen(view: View, wx: number, wy: number): Vec {
	return { x: wx * view.zoom + view.x, y: wy * view.zoom + view.y };
}
