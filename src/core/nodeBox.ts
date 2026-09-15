/**
 * How big a node is, and therefore which of them a rectangle contains.
 *
 * Pure functions over a `GraphNode` and the registry, computed from the graph
 * rather than measured from the DOM — so a wire can be routed to a node that has
 * not rendered yet, a documentation picture can be drawn with no browser at all,
 * and the compiler can ask which nodes a comment box is drawn around.
 *
 * That third caller is why this is in core. `src/app/geometry.ts` re-exports
 * every name here, so nothing that reached for them there had to change.
 */

import { NODE } from "./nodeMetrics.js";
import {
	operatorEditorWidth, operatorFields, operatorLayout, type OperatorLayout,
} from "./operatorLayout.js";
import type { GraphNode, NodeConfig, NodeDef, PinDef } from "./schema.js";
import type { Registry } from "./nodes/index.js";
import { nodeTitle, resolveNodePins } from "./nodes/index.js";

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Whether `outer` completely contains `inner`. */
export function rectContains(outer: Rect, inner: Rect): boolean {
	return (
		inner.x >= outer.x
		&& inner.y >= outer.y
		&& inner.x + inner.w <= outer.x + outer.w
		&& inner.y + inner.h <= outer.y + outer.h
	);
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
 * The capsule form node editors use for a variable getter: no header, no rows,
 * one output on the right. Only for nodes whose whole meaning is their name.
 */
export function isCompact(def: NodeDef | undefined): boolean {
	return def?.display === "compact";
}

/** A knot in a wire: a dot with one pin either side and no chrome at all. */
export function isReroute(def: NodeDef | undefined): boolean {
	return def?.display === "reroute";
}

/** A comparison or a logical operator, drawn as its expression. */
export function isOperator(def: NodeDef | undefined): boolean {
	return def?.display === "operator";
}

/** Where everything on an operator pill goes, from the node's own pins. */
export function operatorLayoutOf(def: NodeDef, config?: NodeConfig): OperatorLayout {
	const { inputs } = resolvePins(def, config);
	return operatorLayout(
		{
			symbol: def.operator ?? def.title,
			editor: operatorEditorWidth(operatorFields(inputs), NODE),
			rows: inputs.filter((p) => p.kind === "data").length,
			growable: def.variadic !== undefined,
		},
		NODE,
	);
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
 * How wide an ordinary node is drawn.
 *
 * `NODE.width` unless the reader asked for wide nodes, in which case the header
 * sets it — a title the node cannot show is the thing that option exists to
 * fix. Measured from the *header*, which is two lines with the title above the
 * subtitle, so the wider of the two decides. Deliberately not `compactLabel`'s
 * "subtitle or title" rule: that is for a capsule, which shows one line.
 *
 * Never narrower than `NODE.width`. A node that shrank to fit a short title
 * would leave every graph ragged, and this is about names that do not fit
 * rather than about packing.
 */
export function nodeWidth(
	def: NodeDef | undefined, node: GraphNode, wide = false,
): number {
	if (!wide || !def) return NODE.width;
	const subtitle = def.subtitle?.(node.config ?? {}) ?? "";
	const longest = Math.max(nodeTitle(def, node).length, subtitle.length);
	return Math.round(Math.max(NODE.width, longest * NODE.titleCharWidth + NODE.headerPadding));
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

export function nodeBounds(node: GraphNode, registry: Registry, wide = false): Rect {
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
	if (isOperator(def)) {
		const layout = operatorLayoutOf(def, node.config);
		return { x: node.x, y: node.y, w: layout.width, h: layout.height };
	}
	const { inputs, outputs } = resolvePins(def, node.config);
	return {
		x: node.x, y: node.y, w: nodeWidth(def, node, wide),
		h: nodeHeight(inputs, outputs, def, node.config),
	};
}
