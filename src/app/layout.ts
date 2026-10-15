/**
 * Realign: tidying a graph up with the flow layout (`core/layout/flow.ts`),
 * the same layout an import gets (0.182.0).
 *
 * It follows execution from the graph's entry: a chain of steps runs along a
 * row, each step's values tucked under the step before, and a node with
 * several ways on starts a lane for each to its right. What the entry does not
 * reach is set out below.
 *
 * - The graph does not jump: its entry stays where it was, or a pinned node
 *   does, and the rest is laid out round it. Any other pinned node stays put.
 * - A selection of several nodes is laid out on its own and put back where
 *   the selection was.
 * - A comment box is fitted back round what it held, its title in a gap of its
 *   own above its row; one marked Preserve nodes on Realign moves as one block
 *   with what it holds where it was put.
 *
 * It replaced 0.178.0's column layout, which ranked every node by the longest
 * run of wires into it, data and execution alike.
 */

import type { GraphId } from "../core/functionGraph.js";
import {
	applyFlow,
	BOX_PAD,
	type KeptBox,
	layoutFlow,
	type Rect,
	titleHeight,
} from "../core/layout/flow.js";
import type { Registry } from "../core/nodes/index.js";
import type { Comment, NodeScript } from "../core/schema.js";
import { containedBy } from "./edits.js";
import { nodeBounds, resolvePins } from "./geometry.js";

/** The gap left between a comment's title and the row above it. */
const TITLE_GAP = 12;

export interface LayoutOptions {
	/**
	 * Tidy only these nodes and leave the rest of the graph alone. The laid-out
	 * block is placed back over the space the selection occupied, so a partial
	 * tidy does not fling those nodes across the canvas.
	 */
	only?: ReadonlySet<string>;
	/**
	 * Nodes are being drawn wide enough for their headers, so the layout
	 * measures them at that width.
	 */
	wideNodes?: boolean;
	/**
	 * The graph on screen, by its entry: null for the file's own, a function's
	 * id for its graph. Absent, the entry is the node that starts the graph.
	 */
	graph?: GraphId;
}

/** Lays the view out, or the selection in it. */
export function autoLayout(
	view: NodeScript,
	registry: Registry,
	options: LayoutOptions = {},
): NodeScript {
	const { only, wideNodes = false } = options;
	const subject = only ? view.nodes.filter((n) => only.has(n.id)) : view.nodes;
	if (subject.length < 2) return view;
	const ids = new Set(subject.map((n) => n.id));

	// What each comment holds, before anything moves. Only the comments wholly
	// inside what is being laid out take part.
	const members = new Map<string, Set<string>>();
	for (const comment of view.comments) {
		const held = [...containedBy(view, registry, comment)].filter((id) => ids.has(id));
		const nodes = held.filter((id) => view.nodes.some((n) => n.id === id));
		if (nodes.length > 0) members.set(comment.id, new Set(nodes));
	}
	const scope: NodeScript = only
		? {
				...view,
				nodes: subject,
				links: view.links.filter((l) => ids.has(l.from.node) && ids.has(l.to.node)),
				comments: view.comments.filter((c) => members.has(c.id)),
			}
		: view;
	const byId = new Map(scope.nodes.map((n) => [n.id, n]));
	const isStep = (id: string) => {
		const node = byId.get(id);
		const def = node && registry.get(node.def);
		if (!node || !def) return false;
		const pins = resolvePins(def, node.config, node.literals);
		return [...pins.inputs, ...pins.outputs].some((p) => p.kind === "exec");
	};
	const rectOf = (c: Comment): Rect => ({ x: c.x, y: c.y, w: c.w, h: c.h });
	const inside = (a: Rect, b: Rect) =>
		a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

	// Boxes kept as drawn: the outermost marked one, and every comment in it.
	const preserved = scope.comments.filter((c) => c.preserve && members.has(c.id));
	const outermost = preserved.filter(
		(c) => !preserved.some((o) => o !== c && inside(rectOf(c), rectOf(o))),
	);
	const kept: KeptBox[] = outermost.map((c) => ({
		id: c.id,
		nodes: members.get(c.id) as Set<string>,
		rect: rectOf(c),
	}));
	const keptNodes = new Set(kept.flatMap((k) => [...k.nodes]));
	const keptComments = new Map(
		outermost.map((c) => [
			c.id,
			scope.comments.filter((o) => o === c || inside(rectOf(o), rectOf(c))).map((o) => o.id),
		]),
	);
	const moving = new Set([...keptComments.values()].flat());

	// The rest: room above each box's first step for its title, and its steps
	// kept clear of tucked values; a box round values only lowers the value
	// its reader outside the box reads.
	const headed = new Map<string, number>();
	const boxed = new Map<string, string>();
	const valueRooms = new Map<string, number>();
	const refitted = scope.comments.filter((c) => members.has(c.id) && !moving.has(c.id));
	// Smallest first, so a step in two boxes counts as in the inner one.
	for (const c of [...refitted].sort((a, b) => a.w * a.h - b.w * b.h)) {
		const held = [...(members.get(c.id) as Set<string>)].filter((id) => !keptNodes.has(id));
		const room = titleHeight(c.text, c.w) + TITLE_GAP;
		const steps = held.filter(isStep);
		if (steps.length === 0) {
			const root = held.find((id) =>
				scope.links.some((l) => l.from.node === id && !held.includes(l.to.node)),
			);
			if (root) valueRooms.set(root, Math.max(valueRooms.get(root) ?? 0, room));
			continue;
		}
		const head = steps.reduce((a, b) => ((byId.get(b)?.x ?? 0) < (byId.get(a)?.x ?? 0) ? b : a));
		headed.set(head, Math.max(headed.get(head) ?? 0, room));
		for (const s of steps) if (!boxed.has(s)) boxed.set(s, c.id);
	}

	const entryNode = scope.nodes.find((n) => registry.get(n.def)?.role === "entry");
	const graph: GraphId =
		options.graph !== undefined
			? options.graph
			: entryNode && entryNode.def !== "script.begin"
				? entryNode.id
				: null;
	const result = layoutFlow(scope, registry, graph, {
		headed,
		boxed,
		valueRooms,
		kept,
		wide: wideNodes,
	});
	let laid = applyFlow(scope, result, keptComments);

	// Each comment back round what it held, its title in the room left for it.
	laid = {
		...laid,
		comments: laid.comments.map((c) => {
			if (moving.has(c.id) || !members.has(c.id)) return c;
			const held = laid.nodes.filter((n) => members.get(c.id)?.has(n.id));
			const boxes = held.map((n) => nodeBounds(n, registry, wideNodes));
			const left = Math.min(...boxes.map((b) => b.x)) - BOX_PAD;
			const right = Math.max(...boxes.map((b) => b.x + b.w)) + BOX_PAD;
			const top = Math.min(...boxes.map((b) => b.y));
			const low = Math.max(...boxes.map((b) => b.y + b.h)) + BOX_PAD;
			const title = titleHeight(c.text, right - left);
			return {
				...c,
				x: Math.round(left),
				y: Math.round(top - title),
				w: Math.round(right - left),
				h: Math.round(low - top + title),
			};
		}),
	};

	// Where it all goes: kept where the pinned node, or the entry, was; a
	// selection over where it was.
	const now = new Map(laid.nodes.map((n) => [n.id, n]));
	const pinned = scope.nodes.filter((n) => n.pinned).sort((a, b) => a.y - b.y || a.x - b.x);
	let dx = 0;
	let dy = 0;
	const anchor = only
		? undefined
		: (pinned[0] ?? (entryNode && graph === null ? entryNode : byId.get(graph ?? "")));
	if (anchor && now.has(anchor.id)) {
		const at = now.get(anchor.id) as { x: number; y: number };
		dx = anchor.x - at.x;
		dy = anchor.y - at.y;
	} else {
		const before = boundsOf(scope.nodes, registry, wideNodes);
		const after = boundsOf(laid.nodes, registry, wideNodes);
		dx = before.x - after.x;
		dy = before.y - after.y;
	}
	const stays = new Set(pinned.map((n) => n.id));
	const nodes = view.nodes.map((n) => {
		if (!ids.has(n.id)) return n;
		// Every pinned node stays exactly where it was.
		if (stays.has(n.id)) return n;
		const at = now.get(n.id) ?? n;
		return { ...n, x: Math.round(at.x + dx), y: Math.round(at.y + dy) };
	});
	const placedComments = new Map(laid.comments.map((c) => [c.id, c]));
	const comments = view.comments.map((c) => {
		const at = placedComments.get(c.id);
		if (!at || !members.has(c.id)) return c;
		return { ...at, x: Math.round(at.x + dx), y: Math.round(at.y + dy) };
	});
	return { ...view, nodes, comments };
}

function boundsOf(nodes: NodeScript["nodes"], registry: Registry, wide = false): Rect {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		const box = nodeBounds(node, registry, wide);
		minX = Math.min(minX, box.x);
		minY = Math.min(minY, box.y);
		maxX = Math.max(maxX, box.x + box.w);
		maxY = Math.max(maxY, box.y + box.h);
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
