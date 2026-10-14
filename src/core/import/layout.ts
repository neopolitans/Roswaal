/**
 * Where an imported graph's nodes go.
 *
 * The importer knows the shape of what it built -- a chain of statements, each
 * with a tree of values feeding it, and blocks hanging off Branch, the loops
 * and Sequence -- so it lays that shape out directly rather than handing the
 * graph to the editor's general tidy-up, which has to guess.
 *
 * - A chain of statements runs left to right on one row: a **lane**.
 * - The values a statement reads sit in columns to its left, *below* the lane,
 *   so the execution wire into the statement passes above them, never through.
 * - A node with several exec outputs (Branch, a loop, Sequence) starts a lane
 *   for each to its right, one under another in pin order: True then False,
 *   Body then Completed, Then 1, Then 2, ...
 *
 * Every box is measured with `nodeBounds`, the size the canvas draws, so
 * nothing is placed over anything else. Each graph of the file -- its own and
 * one per function -- is laid out on its own, from its entry.
 */

import { type GraphId, mergeLayout, viewOf } from "../functionGraph.js";
import { nodeBounds, resolvePins } from "../nodeBox.js";
import { FUNCTION_NODES } from "../nodes/flow.js";
import type { Registry } from "../nodes/index.js";
import type { GraphNode, Link, NodeScript } from "../schema.js";

/** Space between a node and the next one along a lane. */
const GAP_X = 56;
/** Space between two values stacked in a column, and between two lanes. */
const GAP_Y = 20;
const LANE_GAP = 44;
/** How far below a lane's top its values start, clear of the exec wire. */
const DROP = 64;
/** Where a graph's first node goes. */
const ORIGIN = { x: 80, y: 160 };

interface Box {
	w: number;
	h: number;
}

/** Lays out every graph of an imported script. */
export function layoutImport(
	script: NodeScript,
	registry: Registry,
	/**
	 * Statements a comment box will head, and the room its title takes: their
	 * row is lowered by it, so the title sits in a gap of its own.
	 */
	headed: ReadonlyMap<string, number> = new Map(),
): NodeScript {
	let out = script;
	const graphs: GraphId[] = [
		null,
		...script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).map((n) => n.id),
	];
	for (const graph of graphs) {
		const view = viewOf(out, graph);
		out = mergeLayout(out, graph, layoutView(view, registry, graph, headed));
	}
	return out;
}

function layoutView(
	view: NodeScript,
	registry: Registry,
	graph: GraphId,
	headed: ReadonlyMap<string, number>,
): NodeScript {
	const byId = new Map(view.nodes.map((n) => [n.id, n]));
	const size = new Map<string, Box>();
	const box = (id: string): Box => {
		let b = size.get(id);
		if (!b) {
			const r = nodeBounds(byId.get(id) as GraphNode, registry, true);
			b = { w: r.w, h: r.h };
			size.set(id, b);
		}
		return b;
	};
	const pins = (node: GraphNode) => {
		const def = registry.get(node.def);
		return def ? resolvePins(def, node.config, node.literals) : { inputs: [], outputs: [] };
	};
	const isExec = (node: GraphNode) => {
		const p = pins(node);
		return [...p.inputs, ...p.outputs].some((pin) => pin.kind === "exec");
	};

	const into = new Map<string, Link>();
	const outOf = new Map<string, Link>();
	for (const link of view.links) {
		into.set(`${link.to.node}/${link.to.pin}`, link);
		outOf.set(`${link.from.node}/${link.from.pin}`, link);
	}

	const placed = new Map<string, { x: number; y: number }>();

	// -- values: a tree to the left of whatever reads them ------------------

	/** The values feeding `id` that it lays out: pure, and not already taken. */
	const feeders = (id: string): string[] => {
		const node = byId.get(id) as GraphNode;
		const out: string[] = [];
		for (const pin of pins(node).inputs) {
			if (pin.kind === "exec") continue;
			const link = into.get(`${id}/${pin.id}`);
			if (!link) continue;
			const source = byId.get(link.from.node);
			if (!source || isExec(source) || placed.has(source.id) || out.includes(source.id)) continue;
			out.push(source.id);
		}
		return out;
	};

	/** Places `id`'s tree with its right edge at `right` and its top at `top`. */
	const placeTree = (id: string, right: number, top: number): void => {
		const own = box(id);
		placed.set(id, { x: right - own.w, y: top });
		let y = top;
		const column = right - own.w - GAP_X;
		for (const k of feeders(id)) {
			const size = treeSize(k);
			placeTree(k, column, y);
			y += size.h + GAP_Y;
		}
	};
	/** The size of `id` with the tree of values feeding it. */
	const sized = new Map<string, Box>();
	const treeSize = (id: string): Box => {
		const known = sized.get(id);
		if (known) return known;
		const own = box(id);
		const kids = feeders(id);
		let result = own;
		if (kids.length > 0) {
			const sizes = kids.map(treeSize);
			const w = Math.max(...sizes.map((s) => s.w));
			const h = sizes.reduce((t, s) => t + s.h, 0) + GAP_Y * (sizes.length - 1);
			result = { w: own.w + GAP_X + w, h: Math.max(own.h, h) };
		}
		sized.set(id, result);
		return result;
	};

	/** The values a statement reads, as one block: their total size. */
	const inputsOf = (id: string): { ids: string[]; w: number; h: number } => {
		const ids = feeders(id);
		if (ids.length === 0) return { ids, w: 0, h: 0 };
		const sizes = ids.map(treeSize);
		return {
			ids,
			w: Math.max(...sizes.map((s) => s.w)),
			h: sizes.reduce((t, s) => t + s.h, 0) + GAP_Y * (sizes.length - 1),
		};
	};

	// -- statements: lanes ---------------------------------------------------

	/** Exec outputs of a node that lead somewhere, in pin order. */
	const execTargets = (id: string): string[] => {
		const node = byId.get(id) as GraphNode;
		const targets: string[] = [];
		for (const pin of pins(node).outputs) {
			if (pin.kind !== "exec") continue;
			const link = outOf.get(`${id}/${pin.id}`);
			if (link && byId.has(link.to.node) && !placed.has(link.to.node)) targets.push(link.to.node);
		}
		return targets;
	};

	/** Lays a lane out from `start`, its top-left at (x, y). Returns its right and bottom. */
	const lane = (start: string, x: number, top: number): { right: number; bottom: number } => {
		// A row with commented statements on it is lowered by the tallest of
		// their titles, so each sits in the gap above rather than over the row
		// before.
		let room = 0;
		for (let at: string | undefined = start; at && !placed.has(at); ) {
			room = Math.max(room, headed.get(at) ?? 0);
			const next = execTargets(at);
			at = next.length === 1 ? next[0] : undefined;
		}
		const y = top + room;
		let at: string | undefined = start;
		let cursor = x;
		let right = x;
		let bottom = y;
		while (at && !placed.has(at)) {
			const id: string = at;
			const inputs = inputsOf(id);
			const nodeX = cursor + (inputs.w > 0 ? inputs.w + GAP_X : 0);
			placed.set(id, { x: nodeX, y });
			const own = box(id);
			let top = y + DROP;
			for (const k of inputs.ids) {
				placeTree(k, nodeX - GAP_X, top);
				top += treeSize(k).h + GAP_Y;
			}
			right = Math.max(right, nodeX + own.w);
			bottom = Math.max(bottom, y + own.h, inputs.h > 0 ? y + DROP + inputs.h : y);
			const next = execTargets(id);
			if (next.length === 1) {
				cursor = nodeX + own.w + GAP_X;
				at = next[0];
				continue;
			}
			// Several ways on: a lane for each, to the right, one under another.
			let laneY = y;
			for (const target of next) {
				const sub = lane(target, nodeX + own.w + GAP_X, laneY);
				right = Math.max(right, sub.right);
				bottom = Math.max(bottom, sub.bottom);
				laneY = sub.bottom + LANE_GAP;
			}
			at = undefined;
		}
		return { right, bottom };
	};

	// The entry: Script Start in the file's own graph, the declaration in a
	// function's. Anything not reached from it is set out below.
	const entry =
		graph === null
			? view.nodes.find((n) => n.def === "script.begin")
			: view.nodes.find((n) => n.id === graph);
	let bottom = ORIGIN.y;
	if (entry) bottom = lane(entry.id, ORIGIN.x, ORIGIN.y).bottom + LANE_GAP;
	let x = ORIGIN.x;
	for (const node of view.nodes) {
		if (placed.has(node.id)) continue;
		if (isExec(node)) {
			const sub = lane(node.id, ORIGIN.x, bottom);
			bottom = sub.bottom + LANE_GAP;
			continue;
		}
		const size = treeSize(node.id);
		// Fed by the step a lane ends on (`return table.freeze(M)`): beside
		// that step, rather than below everything with a wire back across.
		const step = view.links
			.filter((l) => l.to.node === node.id)
			.map((l) => byId.get(l.from.node))
			.find((n) => n && isExec(n) && placed.has(n.id) && execTargets(n.id).length === 0);
		const at = step && placed.get(step.id);
		if (step && at) {
			placeTree(node.id, at.x + box(step.id).w + GAP_X + size.w, at.y);
			continue;
		}
		placeTree(node.id, x + size.w, bottom + (headed.get(node.id) ?? 0));
		x += size.w + GAP_X;
	}

	return {
		...view,
		nodes: view.nodes.map((n) => {
			const at = placed.get(n.id);
			return at ? { ...n, x: Math.round(at.x), y: Math.round(at.y) } : n;
		}),
	};
}
