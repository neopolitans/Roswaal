/**
 * Canvas geometry.
 *
 * Node size and pin positions are computed from the graph rather than measured
 * from the DOM, so a wire can be routed to a node that has not rendered yet and
 * layout never depends on when React commits.
 */

import { NODE } from "./layers.js";
import type { GraphNode, NodeConfig, NodeDef, PinDef } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { nodeTitle, resolveNodePins } from "../core/nodes/index.js";

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Vec {
	x: number;
	y: number;
}

/**
 * Re-exported through geometry because everything drawing a node already
 * imports from here. The resolution itself lives in the registry, which is the
 * only place that knows about splitting.
 */
export function resolvePins(def: NodeDef, config?: NodeConfig): { inputs: PinDef[]; outputs: PinDef[] } {
	return resolveNodePins(def, config);
}

/**
 * The capsule form Unreal uses for a variable getter: no header, no rows, one
 * output on the right. Only for nodes whose whole meaning is their name.
 */
export function isCompact(def: NodeDef | undefined): boolean {
	return def?.display === "compact";
}

/** A knot in a wire: a dot with one pin either side and no chrome at all. */
export function isReroute(def: NodeDef | undefined): boolean {
	return def?.display === "reroute";
}

/**
 * The text a capsule shows, which is also what sets its width.
 *
 * The same rule the header uses, so a getter and a full node answer "what is
 * this called" identically — this used to reach for the subtitle instead, which
 * happened to give the same answer and only because the two capsule nodes put
 * their name there.
 */
export function compactLabel(def: NodeDef, node: GraphNode): string {
	return nodeTitle(def, node);
}

/**
 * Capsule width, estimated from the label rather than measured.
 *
 * Measuring would mean the wire router waiting on a DOM layout, and a wire
 * arriving a frame late is worse than a capsule a few pixels wider than its
 * text. The font is fixed, so the estimate is close.
 */
export function compactWidth(def: NodeDef, node: GraphNode): number {
	const label = compactLabel(def, node);
	return Math.round(
		Math.max(NODE.compactMinWidth, label.length * NODE.compactCharWidth + NODE.compactPadding),
	);
}

/**
 * Header height for one node. Nodes with a subtitle get a taller header, and
 * every pin below it shifts down, so this has to be the single source both the
 * renderer and the wire router consult.
 */
export function headerHeight(def: NodeDef | undefined, config?: NodeConfig): number {
	const subtitle = def?.subtitle?.(config ?? {});
	return subtitle ? NODE.headerHeightTall : NODE.headerHeight;
}

export function nodeHeight(
	inputs: PinDef[], outputs: PinDef[], def?: NodeDef, config?: NodeConfig,
): number {
	const rows = Math.max(inputs.length, outputs.length, 1);
	return headerHeight(def, config) + rows * NODE.rowHeight + NODE.footer;
}

export function nodeBounds(node: GraphNode, registry: Registry): Rect {
	const def = registry.get(node.def);
	if (!def) return { x: node.x, y: node.y, w: NODE.width, h: NODE.headerHeight + NODE.footer };
	if (isReroute(def)) {
		return { x: node.x, y: node.y, w: NODE.rerouteSize, h: NODE.rerouteSize };
	}
	if (isCompact(def)) {
		return {
			x: node.x, y: node.y,
			w: compactWidth(def, node), h: NODE.compactHeight,
		};
	}
	const { inputs, outputs } = resolvePins(def, node.config);
	return {
		x: node.x, y: node.y, w: NODE.width,
		h: nodeHeight(inputs, outputs, def, node.config),
	};
}

/** World position of a pin's connection point. */
export function pinPosition(
	node: GraphNode, registry: Registry, pinId: string, side: "in" | "out",
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
	return {
		x: side === "in" ? node.x : node.x + NODE.width,
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
 * repository should not have to agree about it. People have modified Unreal's
 * Blueprint UI to get the two rigid styles before now, which is the argument
 * for having them here rather than making somebody fork this to get them.
 */
export type WireStyle = "curved" | "rigid" | "angular";

/**
 * Where a wire is allowed to bend, before any style is applied.
 *
 * `rigid` and `angular` are the *same route* — this one — drawn two ways, which
 * is the whole reason they are built together. If each style had its own router
 * they could disagree about which side of a node a wire passes, and switching
 * style would move wires rather than restyle them.
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
	if (to.x - from.x >= stub * 2) {
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
 * the documentation's node previews among them, because a reference page should
 * draw a wire the way the reference draws a wire rather than the way whoever
 * last built the site happened to have their editor set.
 */
export function wirePath(from: Vec, to: Vec, style: WireStyle = "curved"): string {
	if (style === "curved") {
		// Slack grows with distance so short hops stay tight and long ones still
		// leave the pin horizontally instead of cutting across the node.
		const slack = Math.max(NODE.wireSlack, Math.abs(to.x - from.x) * 0.4);
		return `M ${from.x} ${from.y} C ${from.x + slack} ${from.y}, ${to.x - slack} ${to.y}, ${to.x} ${to.y}`;
	}
	return polyline(manhattan(from, to), style === "angular" ? NODE.wireChamfer : 0);
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.w <= outer.x + outer.w &&
		inner.y + inner.h <= outer.y + outer.h
	);
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
