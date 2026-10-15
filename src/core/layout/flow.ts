/**
 * The flow layout: where a graph's nodes go, read from how it runs.
 *
 * Import lays out what it built with it, and Realign lays out what you drew
 * with it (0.182.0), so a graph comes out the same shape either way.
 *
 * - A chain of statements runs left to right on one row: a **lane**, the
 *   statements one gap apart.
 * - The values a statement reads sit below the lane, under the step before it,
 *   so the execution wire passes above them and their wires run up and to the
 *   right into their reader (0.180.0). The first statement on a lane, and a
 *   step a comment's box holds, keep theirs in columns to their left.
 * - A node with several exec outputs (Branch, a loop, Sequence) starts a lane
 *   for each to its right, one under another in pin order: True then False,
 *   Body then Completed, Then 1, Then 2, ...
 * - A comment box kept as drawn moves as one block, with what it holds where
 *   it was put, as one step of its lane.
 * - What the entry does not reach is set out below: chains from their first
 *   step, and values with no step from the value nothing else reads.
 *
 * Every box is measured with `nodeBounds`, the size the canvas draws, so
 * nothing is placed over anything else.
 */

import type { GraphId } from "../functionGraph.js";
import { nodeBounds, resolvePins } from "../nodeBox.js";
import type { Registry } from "../nodes/index.js";
import type { Comment, GraphNode, Link, NodeScript } from "../schema.js";

/** Space between a node and the next one along a lane. */
const GAP_X = 56;
/** Space between two values stacked in a column, and between two lanes. */
const GAP_Y = 20;
const LANE_GAP = 44;
/** How far below a lane's top its values start, clear of the exec wire. */
const DROP = 64;
/** Where a graph's first node goes. */
export const ORIGIN = { x: 80, y: 160 };
/** How far left of its reader a tucked value's right edge sits. */
const TUCK = 20;
/** The room a comment's box leaves round what it holds. */
export const BOX_PAD = 18;

interface Box {
	w: number;
	h: number;
}

export interface Rect extends Box {
	x: number;
	y: number;
}

const overlaps = (a: Rect, b: Rect, margin = 0) =>
	a.x < b.x + b.w + margin &&
	b.x < a.x + a.w + margin &&
	a.y < b.y + b.h + margin &&
	b.y < a.y + a.h + margin;

/**
 * How tall a comment's title draws at a box's width: the editor's header
 * wraps it at 16px a line inside 5px of padding. Characters are taken a
 * little wide, so a title is given a line too many rather than one too few.
 */
export function titleHeight(text: string, width: number): number {
	const perLine = Math.max(8, Math.floor((width - 16) / 7.4));
	const lines = text
		.split("\n")
		.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
	return 10 + 16 * lines + BOX_PAD;
}

/** A comment box kept as drawn: it, and what it holds, move as one block. */
export interface KeptBox {
	id: string;
	/** The nodes it holds. */
	nodes: ReadonlySet<string>;
	/** Where it is, as drawn. */
	rect: Rect;
}

export interface FlowOptions {
	/**
	 * Statements a comment box will head, and the room its title takes: their
	 * row is lowered by it, so the title sits in a gap of its own.
	 */
	headed?: ReadonlyMap<string, number>;
	/** A value a comment around values only is drawn over, and the room its title takes. */
	valueRooms?: ReadonlyMap<string, number>;
	/**
	 * The steps each comment box goes round, by the box. No value is tucked
	 * into a box, and a step in one keeps its values to its left.
	 */
	boxed?: ReadonlyMap<string, string>;
	/** Comment boxes kept as drawn. */
	kept?: readonly KeptBox[];
	/** Measure nodes as drawn wide enough for their headers. On unless asked. */
	wide?: boolean;
}

export interface FlowResult {
	/** Where each node laid out goes. */
	placed: Map<string, { x: number; y: number }>;
	/** How far each kept box moved. */
	moved: Map<string, { dx: number; dy: number }>;
}

/** Lays out one graph's view. `graph` names its entry: Script Start for the file's own. */
export function layoutFlow(
	view: NodeScript,
	registry: Registry,
	graph: GraphId,
	options: FlowOptions = {},
): FlowResult {
	const headed = options.headed ?? new Map<string, number>();
	const valueRooms = options.valueRooms ?? new Map<string, number>();
	const boxed = options.boxed ?? new Map<string, string>();
	const wide = options.wide ?? true;
	const byId = new Map(view.nodes.map((n) => [n.id, n]));
	const size = new Map<string, Box>();
	const box = (id: string): Box => {
		let b = size.get(id);
		if (!b) {
			const r = nodeBounds(byId.get(id) as GraphNode, registry, wide);
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
	const moved = new Map<string, { dx: number; dy: number }>();
	const keptOf = new Map<string, KeptBox>();
	for (const k of options.kept ?? []) for (const id of k.nodes) keptOf.set(id, k);

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
			if (!source || isExec(source) || placed.has(source.id) || keptOf.has(source.id)) continue;
			if (out.includes(source.id)) continue;
			out.push(source.id);
		}
		return out;
	};

	/** Places `id`'s tree with its right edge at `right` and its top at `top`. */
	const placeTree = (id: string, right: number, top: number): void => {
		const own = box(id);
		const at = top + (valueRooms.get(id) ?? 0);
		placed.set(id, { x: right - own.w, y: at });
		let y = at;
		const column = right - own.w - GAP_X;
		for (const k of feeders(id)) {
			const kid = treeSize(k);
			placeTree(k, column, y);
			y += kid.h + GAP_Y;
		}
	};
	/** The size of `id` with the tree of values feeding it. */
	const sized = new Map<string, Box>();
	const treeSize = (id: string, depth = 0): Box => {
		const known = sized.get(id);
		if (known) return known;
		const own = box(id);
		const room = valueRooms.get(id) ?? 0;
		// A value feeding itself round a loop of values is a graph to fix, not
		// one to lay out forever.
		const kids = depth > 64 ? [] : feeders(id);
		let result = { w: own.w, h: own.h + room };
		if (kids.length > 0) {
			const sizes = kids.map((k) => treeSize(k, depth + 1));
			const w = Math.max(...sizes.map((s) => s.w));
			const h = sizes.reduce((t, s) => t + s.h, 0) + GAP_Y * (sizes.length - 1);
			result = { w: own.w + GAP_X + w, h: Math.max(own.h, h) + room };
		}
		sized.set(id, result);
		return result;
	};

	/** The values a statement reads, as one block: their total size. */
	const inputsOf = (id: string): { ids: string[]; w: number; h: number } => {
		const ids = feeders(id);
		if (ids.length === 0) return { ids, w: 0, h: 0 };
		const sizes = ids.map((k) => treeSize(k));
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
		// before. A box kept as drawn takes the room its own title had.
		let room = 0;
		const seen = new Set<string>();
		for (let at: string | undefined = start; at && !placed.has(at) && !seen.has(at); ) {
			seen.add(at);
			const kept = keptOf.get(at);
			const node = byId.get(at) as GraphNode;
			room = Math.max(room, headed.get(at) ?? 0, kept ? node.y - kept.rect.y + LANE_GAP / 2 : 0);
			const next = execTargets(at);
			at = next.length === 1 ? next[0] : undefined;
		}
		const y = top + room;
		let at: string | undefined = start;
		let cursor = x;
		let right = x;
		let bottom = y;
		// What is on this lane so far, which a tucked value keeps clear of; a
		// comment's box among it, grown as each of its steps is placed.
		const taken: Rect[] = [];
		const boxes = new Map<string, Rect>();
		const tuckUnder = (ids: string[], readerX: number) => {
			for (const k of ids) {
				const kid = treeSize(k);
				const spot: Rect = { x: Math.max(readerX - TUCK - kid.w, x), y: y + DROP, ...kid };
				// Below whatever it would land on.
				for (let again = true; again; ) {
					again = false;
					for (const other of taken) {
						if (!overlaps(spot, other, GAP_Y / 2)) continue;
						spot.y = other.y + other.h + GAP_Y;
						again = true;
					}
				}
				placeTree(k, spot.x + kid.w, spot.y);
				taken.push(spot);
				bottom = Math.max(bottom, spot.y + spot.h);
			}
		};
		while (at && !placed.has(at)) {
			const id: string = at;
			const kept = keptOf.get(id);
			if (kept && !moved.has(kept.id)) {
				// The box and everything in it, as drawn, as one step of the lane.
				const entry = byId.get(id) as GraphNode;
				const dx = cursor - kept.rect.x;
				const dy = y - entry.y;
				for (const m of kept.nodes) {
					const node = byId.get(m);
					if (node) placed.set(m, { x: node.x + dx, y: node.y + dy });
				}
				moved.set(kept.id, { dx, dy });
				const block: Rect = { ...kept.rect, x: kept.rect.x + dx, y: kept.rect.y + dy };
				taken.push(block);
				right = Math.max(right, block.x + block.w);
				bottom = Math.max(bottom, block.y + block.h);
				// Values from outside it go under it.
				for (const m of kept.nodes) tuckUnder(feeders(m), block.x);
				cursor = block.x + block.w + GAP_X;
				// On from the step that leaves it; any other way out is a lane below.
				const exits: string[] = [];
				for (const m of kept.nodes) {
					if (!byId.has(m)) continue;
					for (const t of execTargets(m)) if (!kept.nodes.has(t)) exits.push(t);
				}
				let laneY = bottom + LANE_GAP;
				for (const t of exits.slice(1)) {
					const sub = lane(t, cursor, laneY);
					right = Math.max(right, sub.right);
					bottom = Math.max(bottom, sub.bottom);
					laneY = sub.bottom + LANE_GAP;
				}
				at = exits[0];
				continue;
			}
			const inputs = inputsOf(id);
			const own = box(id);
			// A statement's values go under the step before it, and the steps
			// close up to one gap apart. The first on a lane has no step before
			// it, and a step in a comment's box keeps its values to its left, so
			// the box does not reach back under the step before.
			const inBox = boxed.get(id);
			const tuck = taken.length > 0 && inputs.ids.length > 0 && inBox === undefined;
			const nodeX = tuck ? cursor : cursor + (inputs.w > 0 ? inputs.w + GAP_X : 0);
			placed.set(id, { x: nodeX, y });
			taken.push({ x: nodeX, y, w: own.w, h: own.h });
			if (tuck) {
				tuckUnder(inputs.ids, nodeX);
			} else {
				let top = y + DROP;
				for (const k of inputs.ids) {
					placeTree(k, nodeX - GAP_X, top);
					top += treeSize(k).h + GAP_Y;
				}
				if (inputs.h > 0)
					taken.push({ x: nodeX - GAP_X - inputs.w, y: y + DROP, w: inputs.w, h: inputs.h });
				// A comment's box goes round its statement's steps and their
				// values: the next statement's values keep out of it.
				if (inBox !== undefined) {
					const left = nodeX - (inputs.w > 0 ? inputs.w + GAP_X : 0) - BOX_PAD;
					const low = Math.max(y + own.h, inputs.h > 0 ? y + DROP + inputs.h : y) + BOX_PAD;
					const extent = { x: left, y, w: nodeX + own.w + BOX_PAD - left, h: low - y };
					const grown = boxes.get(inBox);
					if (grown) {
						const far = Math.max(grown.x + grown.w, extent.x + extent.w);
						const lowest = Math.max(grown.y + grown.h, extent.y + extent.h);
						grown.x = Math.min(grown.x, extent.x);
						grown.w = far - grown.x;
						grown.h = lowest - grown.y;
					} else {
						boxes.set(inBox, extent);
						taken.push(extent);
					}
				}
			}
			right = Math.max(right, nodeX + own.w);
			bottom = Math.max(bottom, y + own.h, inputs.h > 0 && !tuck ? y + DROP + inputs.h : y);
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

	// Chains the entry does not reach, each from its first step, top to bottom
	// as they were; then any step left over, from a loop of steps.
	const byPlace = (a: GraphNode, b: GraphNode) => a.y - b.y || a.x - b.x;
	const execIn = (id: string) =>
		view.links.some((l) => {
			if (l.to.node !== id || placed.has(l.from.node)) return false;
			const from = byId.get(l.from.node);
			return (
				from !== undefined &&
				pins(from).outputs.some((p) => p.id === l.from.pin && p.kind === "exec")
			);
		});
	const steps = view.nodes.filter((n) => !placed.has(n.id) && (isExec(n) || keptOf.has(n.id)));
	for (const node of [
		...steps.filter((n) => !execIn(n.id)).sort(byPlace),
		...steps.sort(byPlace),
	]) {
		if (placed.has(node.id)) continue;
		bottom = lane(node.id, ORIGIN.x, bottom).bottom + LANE_GAP;
	}

	// Values left: beside the step a lane ends on when that step reads them
	// (`return table.freeze(M)`), else a tree from the value nothing reads.
	let x = ORIGIN.x;
	const readers = (id: string) =>
		view.links.filter((l) => l.from.node === id && byId.has(l.to.node)).map((l) => l.to.node);
	const values = view.nodes.filter((n) => !placed.has(n.id));
	// A value another value still to be placed reads goes in that one's tree.
	const roots = values.filter(
		(n) => !readers(n.id).some((r) => !placed.has(r) && !isExec(byId.get(r) as GraphNode)),
	);
	for (const node of [...roots.sort(byPlace), ...values.sort(byPlace)]) {
		if (placed.has(node.id)) continue;
		const tree = treeSize(node.id);
		const step = view.links
			.filter((l) => l.to.node === node.id)
			.map((l) => byId.get(l.from.node))
			.find((n) => n && isExec(n) && placed.has(n.id) && execTargets(n.id).length === 0);
		const stepAt = step && placed.get(step.id);
		if (step && stepAt) {
			placeTree(node.id, stepAt.x + box(step.id).w + GAP_X + tree.w, stepAt.y);
			continue;
		}
		const readBy = readers(node.id)
			.map((r) => byId.get(r))
			.find((r) => r && placed.has(r.id) && isExec(r));
		const readAt = readBy && placed.get(readBy.id);
		if (readBy && readAt) {
			// Read by a step already placed: in the lane of values below it.
			placeTree(node.id, readAt.x - TUCK, bottom + (headed.get(node.id) ?? 0));
			bottom += tree.h + GAP_Y;
			continue;
		}
		placeTree(node.id, x + tree.w, bottom + (headed.get(node.id) ?? 0));
		x += tree.w + GAP_X;
	}

	return { placed, moved };
}

/** A view with the result's positions, and its kept boxes moved with what they hold. */
export function applyFlow(
	view: NodeScript,
	result: FlowResult,
	keptComments: ReadonlyMap<string, readonly string[]> = new Map(),
): NodeScript {
	const nodes = view.nodes.map((n) => {
		const at = result.placed.get(n.id);
		return at ? { ...n, x: Math.round(at.x), y: Math.round(at.y) } : n;
	});
	const shift = new Map<string, { dx: number; dy: number }>();
	for (const [box, by] of result.moved)
		for (const c of keptComments.get(box) ?? [box]) shift.set(c, by);
	const comments: Comment[] = view.comments.map((c) => {
		const by = shift.get(c.id);
		return by ? { ...c, x: Math.round(c.x + by.dx), y: Math.round(c.y + by.dy) } : c;
	});
	return { ...view, nodes, comments };
}
