/**
 * Tidying a graph up.
 *
 * A layered left-to-right layout, which is the shape a Blueprint-style graph
 * already wants: values flow rightwards into the things that consume them, and
 * execution reads like a sentence. Nodes are ranked by how far they are from
 * something with no inputs, then ordered within each rank to keep wires from
 * crossing more than they must.
 *
 * This is a tidy-up, not a canonical form. It does not try to be clever about
 * long edges or produce the same answer as any particular published algorithm;
 * it tries to turn a graph you have been dragging around for an hour back into
 * something readable, without moving it somewhere you have to go and find.
 */

import type { NodeScript } from "../core/schema.js";
import type { Registry } from "../core/nodes/index.js";
import { nodeBounds } from "./geometry.js";
import { commentContents } from "./edits.js";

/** Horizontal gap between ranks, and vertical gap between nodes in a rank. */
const GAP_X = 90;
const GAP_Y = 34;
/** Breathing room left around a comment's contents when it is re-fitted. */
const COMMENT_PAD = 26;
const COMMENT_HEADER = 44;

/**
 * Repositions nodes into ranked columns.
 *
 * Pass `only` to tidy a selection and leave the rest of the graph alone; the
 * laid-out block is placed back over the space the selection occupied, so a
 * partial tidy does not fling those nodes across the canvas.
 */
export function autoLayout(
	script: NodeScript, registry: Registry, only?: ReadonlySet<string>,
): NodeScript {
	const subject = script.nodes.filter((n) => !only || only.has(n.id));
	if (subject.length < 2) return script;

	const ids = new Set(subject.map((n) => n.id));
	const original = boundsOf(subject, registry);

	// Comment membership is captured before anything moves, so each comment can
	// be re-fitted around the same nodes afterwards rather than being left
	// behind enclosing empty canvas.
	const members = new Map<string, Set<string>>();
	for (const comment of script.comments) {
		members.set(comment.id, commentContents(script, registry, comment.id));
	}

	const edges = script.links
		.filter((l) => ids.has(l.from.node) && ids.has(l.to.node) && l.from.node !== l.to.node)
		.map((l) => ({ from: l.from.node, to: l.to.node }));

	const rank = rankNodes(subject.map((n) => n.id), edges);
	const columns = groupByRank(subject.map((n) => n.id), rank);
	orderWithinColumns(columns, edges, script, rank);

	// -- placement ---------------------------------------------------------
	const placed = new Map<string, { x: number; y: number }>();
	let x = 0;

	for (const column of columns) {
		let y = 0;
		let widest = 0;
		for (const id of column) {
			const node = script.nodes.find((n) => n.id === id)!;
			const box = nodeBounds(node, registry);
			placed.set(id, { x, y });
			y += box.h + GAP_Y;
			widest = Math.max(widest, box.w);
		}
		x += widest + GAP_X;
	}

	// Centre each column vertically against the tallest, so a short column of
	// pure inputs sits beside the middle of what it feeds rather than the top.
	const columnHeights = columns.map((column) =>
		column.reduce((total, id) => {
			const node = script.nodes.find((n) => n.id === id)!;
			return total + nodeBounds(node, registry).h + GAP_Y;
		}, -GAP_Y),
	);
	const tallest = Math.max(0, ...columnHeights);
	columns.forEach((column, index) => {
		const offset = (tallest - columnHeights[index]) / 2;
		for (const id of column) {
			const at = placed.get(id)!;
			placed.set(id, { x: at.x, y: at.y + offset });
		}
	});

	const nodes = script.nodes.map((node) => {
		const at = placed.get(node.id);
		if (!at) return node;
		return {
			...node,
			x: Math.round(original.x + at.x),
			y: Math.round(original.y + at.y),
		};
	});

	const moved: NodeScript = { ...script, nodes };
	return { ...moved, comments: refitComments(moved, registry, members) };
}

// ---------------------------------------------------------------------------

interface Edge {
	from: string;
	to: string;
}

/**
 * Longest-path rank for each node.
 *
 * Relaxed iteratively rather than by topological sort, because a graph being
 * edited may well contain a cycle — an illegal one the compiler will complain
 * about, but not a reason for the tidy button to throw. The pass count bounds
 * the work; a cycle simply stops improving.
 */
function rankNodes(ids: string[], edges: Edge[]): Map<string, number> {
	const rank = new Map(ids.map((id) => [id, 0]));

	for (let pass = 0; pass < ids.length; pass++) {
		let changed = false;
		for (const edge of edges) {
			const next = (rank.get(edge.from) ?? 0) + 1;
			if (next > (rank.get(edge.to) ?? 0)) {
				rank.set(edge.to, next);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return rank;
}

function groupByRank(ids: string[], rank: Map<string, number>): string[][] {
	const max = Math.max(0, ...ids.map((id) => rank.get(id) ?? 0));
	const columns: string[][] = Array.from({ length: max + 1 }, () => []);
	for (const id of ids) columns[rank.get(id) ?? 0].push(id);
	return columns;
}

/**
 * Orders each column by the average position of what feeds it — the barycentre
 * heuristic. One forward pass is enough here: it is the difference between
 * wires that cross constantly and wires that mostly do not, and a second pass
 * buys little on graphs this size.
 */
function orderWithinColumns(
	columns: string[][], edges: Edge[], script: NodeScript, rank: Map<string, number>,
): void {
	const originalY = new Map(script.nodes.map((n) => [n.id, n.y]));
	const incoming = new Map<string, string[]>();
	for (const edge of edges) {
		const list = incoming.get(edge.to);
		if (list) list.push(edge.from);
		else incoming.set(edge.to, [edge.from]);
	}

	// The first column has nothing feeding it, so it keeps the vertical order
	// the author already put it in.
	columns[0]?.sort((a, b) => (originalY.get(a) ?? 0) - (originalY.get(b) ?? 0));

	const positionIn = new Map<string, number>();
	columns[0]?.forEach((id, index) => positionIn.set(id, index));

	for (let i = 1; i < columns.length; i++) {
		const column = columns[i];
		const barycentre = new Map<string, number>();

		for (const id of column) {
			const parents = (incoming.get(id) ?? []).filter(
				(parent) => (rank.get(parent) ?? 0) < i && positionIn.has(parent),
			);
			barycentre.set(
				id,
				parents.length === 0
					? Number.POSITIVE_INFINITY
					: parents.reduce((total, p) => total + positionIn.get(p)!, 0) / parents.length,
			);
		}

		column.sort((a, b) => {
			const difference = barycentre.get(a)! - barycentre.get(b)!;
			// Nodes with nothing above them keep their old order rather than
			// being shuffled arbitrarily.
			if (Number.isNaN(difference) || difference === 0) {
				return (originalY.get(a) ?? 0) - (originalY.get(b) ?? 0);
			}
			return difference;
		});
		column.forEach((id, index) => positionIn.set(id, index));
	}
}

/** Grows each comment back around the nodes it held before the tidy-up. */
function refitComments(
	script: NodeScript, registry: Registry, members: Map<string, Set<string>>,
): NodeScript["comments"] {
	return script.comments.map((comment) => {
		const held = members.get(comment.id);
		if (!held || held.size === 0) return comment;

		const inside = script.nodes.filter((n) => held.has(n.id));
		if (inside.length === 0) return comment;

		const box = boundsOf(inside, registry);
		return {
			...comment,
			x: Math.round(box.x - COMMENT_PAD),
			y: Math.round(box.y - COMMENT_HEADER),
			w: Math.round(box.w + COMMENT_PAD * 2),
			h: Math.round(box.h + COMMENT_HEADER + COMMENT_PAD),
		};
	});
}

function boundsOf(nodes: NodeScript["nodes"], registry: Registry) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const node of nodes) {
		const box = nodeBounds(node, registry);
		minX = Math.min(minX, box.x);
		minY = Math.min(minY, box.y);
		maxX = Math.max(maxX, box.x + box.w);
		maxY = Math.max(maxY, box.y + box.h);
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
