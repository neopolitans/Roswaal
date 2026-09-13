/**
 * Function graphs: every function opens in a graph of its own.
 *
 * A nodescript is one file with several graphs in it — its own, and one per
 * function. Which graph a node is drawn in is **stored**, as `GraphNode.graph`,
 * and that reverses the 0.32.0 decision to derive membership from the wires.
 * The reason is the one case derivation cannot answer: a node dropped into a
 * function's graph and not wired yet is in that graph because you put it
 * there, and no walk of the wires can know that.
 *
 * What compiles is still decided by the wires alone. The two agree because a
 * wire can only be drawn between two nodes in the same graph, and `validate`
 * reports one that is not.
 *
 * ## A declaration is in two graphs
 *
 * **Declare Function** sits in a flow — its `in`, `then`, On Table and the
 * function value belong there — and it is also the entry node of the graph it
 * opens, where its Body and parameters are. So it is drawn in both, with the
 * pins of each, at a second position (`inner`) for the second one.
 *
 * A hoisted **Function** is not in any flow. It is drawn only in its own graph,
 * the way a Blueprint function is.
 */

import { bodyPinOf, functionBody } from "./functionBody.js";
import { FUNCTION_NODES } from "./nodes/flow.js";
import type { Registry } from "./nodes/index.js";
import type { Comment, GraphNode, Link, NodeScript } from "./schema.js";

/** A graph: a declaration's id, or `null` for the nodescript's own. */
export type GraphId = string | null;

/** Where an entry node goes in a graph nobody has arranged yet. */
export const ENTRY_HOME = { x: 80, y: 160 } as const;

/**
 * The config key a projected declaration carries, so its pins can be filtered
 * to the ones this graph shows. Only ever set on a copy made by `viewOf`, and
 * never written to a file.
 */
export const PRESENCE = "presence";

/** How a node appears in one graph. */
export type Presence = "whole" | "entry" | "outer";

export function graphOf(item: { graph?: string }): GraphId {
	return item.graph ?? null;
}

/** Whether this pin belongs to the graph a declaration opens. */
export function isEntryPin(defId: string, pinId: string): boolean {
	if (defId === "function.entry") return true;
	if (defId === "function.declareHere") return pinId === "body" || /^p\d+(\.|$)/.test(pinId);
	return false;
}

/** The graph one end of a wire is in. */
export function sideGraph(node: GraphNode, pinId: string, side: "in" | "out"): GraphId {
	if (node.def === "function.entry") return node.id;
	if (side === "out" && isEntryPin(node.def, pinId)) return node.id;
	return graphOf(node);
}

/** How a node is drawn in `graph`, or null when it is not drawn there. */
export function presenceIn(node: GraphNode, graph: GraphId): Presence | null {
	if (node.def === "function.entry") return graph === node.id ? "whole" : null;
	if (node.def === "function.declareHere") {
		if (graph === node.id) return "entry";
		return graphOf(node) === graph ? "outer" : null;
	}
	return graphOf(node) === graph ? "whole" : null;
}

export function positionIn(node: GraphNode, graph: GraphId): { x: number; y: number } {
	if (node.def === "function.declareHere" && graph === node.id) return node.inner ?? ENTRY_HOME;
	return { x: node.x, y: node.y };
}

/** Moves a node within one graph, which for an entry node is its `inner`. */
export function placeIn(node: GraphNode, graph: GraphId, at: { x: number; y: number }): GraphNode {
	if (node.def === "function.declareHere" && graph === node.id) return { ...node, inner: at };
	return { ...node, x: at.x, y: at.y };
}

/** Whether a graph still exists: the nodescript's own always does. */
export function graphExists(script: NodeScript, graph: GraphId): boolean {
	return graph === null || script.nodes.some((n) => n.id === graph && FUNCTION_NODES.has(n.def));
}

/**
 * One graph of the script, as a script of its own.
 *
 * Node ids are shared with the whole, so an edit made against the whole script
 * with an id taken from here lands on the right node. Positions are the ones
 * this graph draws, and a declaration carries `PRESENCE` so its pins are this
 * graph's half.
 */
export function viewOf(script: NodeScript, graph: GraphId): NodeScript {
	const nodes: GraphNode[] = [];
	const byId = new Map<string, GraphNode>();
	for (const node of script.nodes) {
		byId.set(node.id, node);
		const presence = presenceIn(node, graph);
		if (!presence) continue;
		if (presence === "whole") {
			nodes.push(node);
			continue;
		}
		nodes.push({ ...node, ...positionIn(node, graph), config: { ...node.config, [PRESENCE]: presence } });
	}
	const links = script.links.filter((link) => {
		const from = byId.get(link.from.node);
		const to = byId.get(link.to.node);
		return !!from && !!to
			&& sideGraph(from, link.from.pin, "out") === graph
			&& sideGraph(to, link.to.pin, "in") === graph;
	});
	const comments = script.comments.filter((c) => graphOf(c) === graph);
	return { ...script, nodes, links, comments };
}

/**
 * Writes positions and comment boxes from an edited view back into the script.
 *
 * For tools that rearrange what is on screen — Realign, align — and are written
 * against a plain script. Anything else they changed is not taken.
 */
export function mergeLayout(script: NodeScript, graph: GraphId, view: NodeScript): NodeScript {
	const placed = new Map(view.nodes.map((n) => [n.id, n]));
	const boxes = new Map(view.comments.map((c) => [c.id, c]));
	let changed = false;
	const nodes = script.nodes.map((node) => {
		const moved = placed.get(node.id);
		if (!moved) return node;
		const was = positionIn(node, graph);
		if (was.x === moved.x && was.y === moved.y) return node;
		changed = true;
		return placeIn(node, graph, { x: moved.x, y: moved.y });
	});
	const comments = script.comments.map((c) => {
		const box = boxes.get(c.id);
		if (!box || (box.x === c.x && box.y === c.y && box.w === c.w && box.h === c.h)) return c;
		changed = true;
		return { ...c, x: box.x, y: box.y, w: box.w, h: box.h };
	});
	return changed ? { ...script, nodes, links: script.links, comments } : script;
}

/**
 * Everything inside a function's graph, nested functions' graphs included.
 *
 * The declaration itself is not included. A hoisted Function drawn in another
 * function's graph is not inside it — it is not in any flow — and is left out.
 */
export function graphMembers(script: NodeScript, functionId: string): Set<string> {
	const out = new Set<string>();
	const queue = [functionId];
	while (queue.length > 0) {
		const graph = queue.pop()!;
		for (const node of script.nodes) {
			if (graphOf(node) !== graph || node.def === "function.entry" || out.has(node.id)) continue;
			out.add(node.id);
			if (node.def === "function.declareHere") queue.push(node.id);
		}
		for (const c of script.comments) if (graphOf(c) === graph) out.add(c.id);
	}
	return out;
}

/** A selection, with the graph of every function in it. */
export function withFunctionGraphs(script: NodeScript, ids: ReadonlySet<string>): Set<string> {
	const out = new Set(ids);
	for (const node of script.nodes) {
		if (ids.has(node.id) && FUNCTION_NODES.has(node.def)) {
			for (const id of graphMembers(script, node.id)) out.add(id);
		}
	}
	return out;
}

/** One function, for a list of them. */
export interface FunctionInfo {
	id: string;
	name: string;
	/** Nested functions are one deeper than the function they are declared in. */
	depth: number;
}

/**
 * A script's functions, each followed by the ones declared inside it.
 *
 * Reads nothing but ids, names and `graph`, so the daemon can list a file's
 * functions for the project tree without a registry.
 */
export function functionOutline(script: Pick<NodeScript, "nodes">): FunctionInfo[] {
	const functions = script.nodes.filter((n) => FUNCTION_NODES.has(n.def));
	const ids = new Set(functions.map((n) => n.id));
	const out: FunctionInfo[] = [];
	const visit = (node: GraphNode, depth: number) => {
		if (out.some((f) => f.id === node.id)) return;
		const name = (node.config as { name?: string } | undefined)?.name?.trim();
		out.push({ id: node.id, name: name || "function", depth });
		for (const child of functions) {
			if (child.def === "function.declareHere" && child.graph === node.id) visit(child, depth + 1);
		}
	};
	for (const node of functions) {
		const parent = node.def === "function.declareHere" ? node.graph : undefined;
		if (parent === undefined || !ids.has(parent)) visit(node, 0);
	}
	return out;
}

/** Whether any node or comment says which graph it is in. */
export function hasMembership(script: NodeScript): boolean {
	return script.nodes.some((n) => n.graph !== undefined) || script.comments.some((c) => c.graph !== undefined);
}

/**
 * Wires with their two ends in different graphs.
 *
 * None can be drawn — only one graph is ever on screen — so one of these came
 * from a hand-edited file or a bad merge. A script with no membership at all is
 * one canvas, as every graph was before 0.33.0, and has none.
 */
export function crossingLinks(script: NodeScript): Link[] {
	if (!hasMembership(script)) return [];
	const byId = new Map(script.nodes.map((n) => [n.id, n]));
	return script.links.filter((link) => {
		const from = byId.get(link.from.node);
		const to = byId.get(link.to.node);
		return !!from && !!to && sideGraph(from, link.from.pin, "out") !== sideGraph(to, link.to.pin, "in");
	});
}

/**
 * Gives a graph written before 0.33.0 its function graphs.
 *
 * Membership is taken from the wires, the way the emitter walks them: a
 * function's execution chain is its graph, and a pure node joins the graph
 * every reader of it is in. A pure node read from two graphs stays in the
 * nodescript's own, and its wires are reported. A function's `self` wired out
 * of its own graph becomes a Get Function where the wire went.
 *
 * Does nothing to a script that already records membership, so it is safe on
 * every read.
 */
export function assignMembership(
	script: NodeScript, registry: Registry,
): { script: NodeScript; moved: number; crossings: number } {
	const unchanged = { script, moved: 0, crossings: 0 };
	if (hasMembership(script)) return unchanged;
	const declarations = script.nodes.filter((n) => FUNCTION_NODES.has(n.def));
	if (declarations.length === 0) return unchanged;

	const owner = new Map<string, string>();
	for (const fn of declarations) {
		for (const id of functionBody(script, registry, fn.id)) owner.set(id, fn.id);
	}
	if (owner.size === 0) return unchanged;

	const byId = new Map(script.nodes.map((n) => [n.id, n]));
	const graphFor = (id: string): GraphId => owner.get(id) ?? null;
	const assigned = (node: GraphNode): GraphNode => {
		const g = graphFor(node.id);
		return g === null ? node : { ...node, graph: g };
	};

	// Pure nodes, readers first: a value is decided once everything reading it is.
	const decided = new Set(
		script.nodes.filter((n) => !registry.get(n.def)?.pure).map((n) => n.id),
	);
	const readers = new Map<string, Link[]>();
	const sources = new Map<string, Link[]>();
	for (const link of script.links) {
		(readers.get(link.from.node) ?? readers.set(link.from.node, []).get(link.from.node)!).push(link);
		(sources.get(link.to.node) ?? sources.set(link.to.node, []).get(link.to.node)!).push(link);
	}
	const sideOf = (id: string, pin: string, side: "in" | "out"): GraphId => {
		const node = byId.get(id)!;
		return sideGraph({ ...node, graph: graphFor(id) ?? undefined }, pin, side);
	};
	const agree = (graphs: GraphId[]): GraphId | undefined =>
		graphs.length > 0 && graphs.every((g) => g === graphs[0]) ? graphs[0] : undefined;

	for (let pass = 0; pass <= script.nodes.length; pass++) {
		let progress = false;
		for (const node of script.nodes) {
			if (decided.has(node.id)) continue;
			const reads = (readers.get(node.id) ?? []).filter((l) => byId.has(l.to.node));
			if (reads.some((l) => !decided.has(l.to.node))) continue;
			let g = agree(reads.map((l) => sideOf(l.to.node, l.to.pin, "in")));
			if (reads.length === 0) {
				const feeds = (sources.get(node.id) ?? []).filter((l) => decided.has(l.from.node));
				g = agree(feeds.map((l) => sideOf(l.from.node, l.from.pin, "out")));
			}
			if (g !== undefined && g !== null) owner.set(node.id, g);
			decided.add(node.id);
			progress = true;
		}
		if (!progress) break;
	}

	let nodes = script.nodes.map(assigned);

	// An entry node goes just left of the body it opens.
	nodes = nodes.map((node) => {
		if (node.def !== "function.declareHere") return node;
		const members = nodes.filter((n) => n.graph === node.id);
		if (members.length === 0) return node;
		const x = Math.min(...members.map((n) => n.x));
		const y = Math.min(...members.map((n) => n.y));
		return { ...node, inner: { x: Math.round(x - 300), y: Math.round(y) } };
	});

	// A comment joins a graph when everything it encloses is in that graph.
	const comments: Comment[] = script.comments.map((c) => {
		const inside = nodes.filter((n) => {
			const at = presenceIn(n, n.graph ?? null) === "entry" ? n.inner! : n;
			return at.x >= c.x && at.y >= c.y && at.x <= c.x + c.w && at.y <= c.y + c.h;
		});
		const g = agree(inside.map((n) => graphOf(n)));
		return g ? { ...c, graph: g } : c;
	});

	let links = script.links;
	let result: NodeScript = { ...script, nodes, comments, links };

	// A hoisted function handed over by its own pin, from a graph it is not in.
	const nodeById = new Map(nodes.map((n) => [n.id, n]));
	for (const link of crossingLinks(result)) {
		const from = nodeById.get(link.from.node)!;
		const to = nodeById.get(link.to.node)!;
		if (from.def !== "function.entry" || link.from.pin !== "self") continue;
		const id = `${link.id}-get`;
		const name = (from.config as { name?: string } | undefined)?.name ?? "function";
		nodes = [...nodes, {
			id, def: "function.get", x: to.x - 180, y: to.y,
			config: { function: from.id, name },
			...(to.graph ? { graph: to.graph } : {}),
		}];
		links = links.map((l) => (l === link ? { ...l, from: { node: id, pin: "fn" } } : l));
		result = { ...result, nodes, links };
	}

	const moved = new Set(declarations.filter((fn) => nodes.some((n) => n.graph === fn.id)).map((n) => n.id)).size;
	return { script: result, moved, crossings: crossingLinks(result).length };
}

export { bodyPinOf };
