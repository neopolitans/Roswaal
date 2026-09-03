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

export function resolvePins(def: NodeDef, config?: NodeConfig): { inputs: PinDef[]; outputs: PinDef[] } {
	const derived = def.derivePins?.(config ?? {});
	return derived ?? { inputs: def.inputs, outputs: def.outputs };
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
	return {
		x: side === "in" ? node.x : node.x + NODE.width,
		y:
			node.y +
			headerHeight(def, node.config) +
			index * NODE.rowHeight +
			NODE.rowHeight / 2,
	};
}

/** Cubic bezier that leaves an output rightwards and enters an input leftwards. */
export function wirePath(from: Vec, to: Vec): string {
	// Slack grows with distance so short hops stay tight and long ones still
	// leave the pin horizontally instead of cutting across the node.
	const slack = Math.max(NODE.wireSlack, Math.abs(to.x - from.x) * 0.4);
	return `M ${from.x} ${from.y} C ${from.x + slack} ${from.y}, ${to.x - slack} ${to.y}, ${to.x} ${to.y}`;
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
