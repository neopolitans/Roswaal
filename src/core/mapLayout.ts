/**
 * Where a node map's nodes sit on its graph.
 *
 * A map opens on the canvas as a graph does. Its nodes are drawn the size the
 * canvas draws a node of the same rows, and each keeps the place it was put
 * in the `.nodemap`. A node with no place yet -- every node of a map made
 * before the graph, or one just imported -- is laid out: left to right, a
 * column a level, each parent level with the middle of what it holds.
 */

import type { MapNode, NodeMap } from "./nodemap.js";

/** A map node's measurements, in world units: the canvas's own for a node of its rows. */
export const MAP_NODE = {
	width: 250,
	head: 30,
	row: 24,
	foot: 12,
	/** Between a node and the column after it: room for the flow wire. */
	columnGap: 70,
	/** Between two leaves, one above the other. */
	rowGap: 34,
} as const;

/** How tall a node is: the DataModel has one row, everything else two. */
export function mapNodeHeight(root: boolean): number {
	return MAP_NODE.head + (root ? 1 : 2) * MAP_NODE.row + MAP_NODE.foot;
}

export interface Point {
	x: number;
	y: number;
}

/**
 * Every node laid out left to right from the root: a column a level, leaves
 * one under another, each parent level with the middle of its children.
 */
export function autoLayout(map: NodeMap): Map<string, Point> {
	const out = new Map<string, Point>();
	const step = mapNodeHeight(false) + MAP_NODE.rowGap;
	let next = 0;
	const place = (node: MapNode, depth: number): number => {
		const x = depth * (MAP_NODE.width + MAP_NODE.columnGap);
		let y: number;
		if (node.children.length === 0) {
			y = next * step;
			next++;
		} else {
			const ys = node.children.map((child) => place(child, depth + 1));
			y = (ys[0] + ys[ys.length - 1]) / 2;
		}
		// Headers line up along a row: the root is shorter, so it is centred on
		// the header of the row it stands for.
		out.set(node.id, { x, y });
		return y;
	};
	place(map.root, 0);
	return out;
}

/**
 * Where each node is drawn: the place it was given, or where the layout puts
 * it. A node with no place under one that has one keeps the layout's offset
 * from its parent, so it appears beside the parent rather than at the layout's
 * idea of where the parent is.
 */
export function mapPositions(map: NodeMap): Map<string, Point> {
	const laid = autoLayout(map);
	const out = new Map<string, Point>();
	const visit = (node: MapNode, parent: MapNode | null) => {
		if (node.pos) out.set(node.id, node.pos);
		else {
			const own = laid.get(node.id) ?? { x: 0, y: 0 };
			const placed = parent ? out.get(parent.id) : undefined;
			const parentLaid = parent ? laid.get(parent.id) : undefined;
			out.set(
				node.id,
				placed && parentLaid
					? { x: placed.x + own.x - parentLaid.x, y: placed.y + own.y - parentLaid.y }
					: own,
			);
		}
		for (const child of node.children) visit(child, node);
	};
	visit(map.root, null);
	return out;
}

/** A node's box at its place. */
export function mapNodeBox(
	at: Point,
	root: boolean,
): { x: number; y: number; w: number; h: number } {
	return { x: at.x, y: at.y, w: MAP_NODE.width, h: mapNodeHeight(root) };
}

/** The flow pins, at the header's middle: in on the left edge, out on the right. */
export function mapPins(at: Point): { in: Point; out: Point } {
	const y = at.y + MAP_NODE.head / 2;
	return { in: { x: at.x - 11, y }, out: { x: at.x + MAP_NODE.width + 13, y } };
}

/** Every node given the place the layout puts it: Realign. */
export function realignMap(map: NodeMap): MapNode {
	const laid = autoLayout(map);
	const visit = (node: MapNode): MapNode => ({
		...node,
		pos: laid.get(node.id),
		children: node.children.map(visit),
	});
	return visit(map.root);
}
