/**
 * The Refactor panel's changes to a graph (0.183.0).
 *
 * Each changes how a graph is wired or arranged, never what it compiles to:
 * the tests compile every one before and after.
 *
 * - **A Get per reader**: a variable, local, parameter, function or service
 *   read by several nodes gets a Get beside each, so no read is wired across
 *   the graph. Import draws reads this way already.
 * - **Share Gets**: the other way. Gets of the same thing become one.
 * - **Split into rows**: a Sequence after the graph's start, and its chain cut
 *   into rows by width, as import cuts a file's. It adds the one node.
 *
 * Each takes the graph on screen, and the nodes it may touch: a selection, or
 * the whole graph.
 */

import { type GraphId, viewOf } from "./functionGraph.js";
import { rowsByWidth } from "./import/rows.js";
import { resolvePins } from "./nodeBox.js";
import type { Registry } from "./nodes/index.js";
import type { GraphNode, Link, NodeScript } from "./schema.js";

/** The nodes that read one thing and do nothing else: a Get each reader may have its own of. */
const GETTERS: ReadonlySet<string> = new Set([
	"variable.get",
	"local.get",
	"function.getParam",
	"function.get",
	"roblox.getService",
]);

/** An id no node in the script has, from `base`. */
function freshId(taken: Set<string>, base: string): string {
	let n = 1;
	while (taken.has(`${base}-${n}`)) n++;
	const id = `${base}-${n}`;
	taken.add(id);
	return id;
}

/** The Gets in the graph on screen that may be changed. */
function gettersIn(script: NodeScript, graph: GraphId, only?: ReadonlySet<string>): GraphNode[] {
	const here = new Set(viewOf(script, graph).nodes.map((n) => n.id));
	return script.nodes.filter(
		(n) => GETTERS.has(n.def) && here.has(n.id) && (!only || only.has(n.id)),
	);
}

/** A Get beside each reader: one per node that reads it, the first keeping the original. */
export function getterPerReader(
	script: NodeScript,
	graph: GraphId,
	only?: ReadonlySet<string>,
): NodeScript {
	const taken = new Set([...script.nodes.map((n) => n.id), ...script.links.map((l) => l.id)]);
	const nodes = [...script.nodes];
	const links = script.links.map((l) => ({ ...l, from: { ...l.from } }));
	for (const get of gettersIn(script, graph, only)) {
		const readers = [...new Set(links.filter((l) => l.from.node === get.id).map((l) => l.to.node))];
		for (const reader of readers.slice(1)) {
			const copy: GraphNode = { ...get, id: freshId(taken, get.id) };
			nodes.push(copy);
			for (const link of links) {
				if (link.from.node === get.id && link.to.node === reader) link.from.node = copy.id;
			}
		}
	}
	return { ...script, nodes, links };
}

/** What makes two Gets the same read: what they are, and what they read. */
function readKey(node: GraphNode): string {
	return JSON.stringify([node.def, node.config ?? {}, node.literals ?? {}, node.label ?? ""]);
}

/** Gets of the same thing become one, which every reader reads. */
export function shareGets(
	script: NodeScript,
	graph: GraphId,
	only?: ReadonlySet<string>,
): NodeScript {
	const kept = new Map<string, string>();
	const gone = new Map<string, string>();
	for (const get of gettersIn(script, graph, only)) {
		const key = readKey(get);
		const first = kept.get(key);
		if (first === undefined) kept.set(key, get.id);
		else gone.set(get.id, first);
	}
	if (gone.size === 0) return script;
	const links: Link[] = script.links.map((l) =>
		gone.has(l.from.node)
			? { ...l, from: { ...l.from, node: gone.get(l.from.node) as string } }
			: l,
	);
	return { ...script, nodes: script.nodes.filter((n) => !gone.has(n.id)), links };
}

/**
 * What the Get changes would do, for the panel to say: the Gets read by
 * several nodes, and the Gets that read what another does. `selection` counts
 * only when it is more than one node in the graph on screen, as the panel's
 * changes take it.
 */
export function refactorCounts(
	script: NodeScript,
	graph: GraphId,
	selection: ReadonlySet<string>,
): { selected: number; perReader: number; shared: number } {
	const here = new Set(viewOf(script, graph).nodes.map((n) => n.id));
	const picked = [...selection].filter((id) => here.has(id));
	const only = picked.length > 1 ? new Set(picked) : undefined;
	const getters = gettersIn(script, graph, only);
	const readers = new Map<string, Set<string>>();
	for (const link of script.links) {
		const set = readers.get(link.from.node) ?? new Set();
		set.add(link.to.node);
		readers.set(link.from.node, set);
	}
	const keys = new Set<string>();
	let shared = 0;
	for (const get of getters) {
		const key = readKey(get);
		if (keys.has(key)) shared++;
		else keys.add(key);
	}
	return {
		selected: only?.size ?? 0,
		perReader: getters.filter((g) => (readers.get(g.id)?.size ?? 0) > 1).length,
		shared,
	};
}

/**
 * A Sequence after the graph's start, unless one is there, and the chain on
 * it cut into rows by width. A chain that fits one row is left as it was.
 */
export function splitIntoRows(script: NodeScript, registry: Registry, graph: GraphId): NodeScript {
	const view = viewOf(script, graph);
	const entry =
		graph === null
			? view.nodes.find((n) => n.def === "script.begin")
			: view.nodes.find((n) => n.id === graph);
	if (!entry) return script;
	const def = registry.get(entry.def);
	const execOut = def
		? resolvePins(def, entry.config, entry.literals).outputs.filter((p) => p.kind === "exec")
		: [];
	// A function's start is its body; the file's, Script Start's one way on.
	const out = execOut.find((p) => p.id === "body") ?? execOut[0];
	const first = out && script.links.find((l) => l.from.node === entry.id && l.from.pin === out.id);
	if (!first) return script;
	const start = script.nodes.find((n) => n.id === first.to.node);
	if (!start) return script;
	if (start.def === "flow.sequence") return rowsByWidth(script, registry, new Set([start.id]));

	const taken = new Set([...script.nodes.map((n) => n.id), ...script.links.map((l) => l.id)]);
	const sequence: GraphNode = {
		id: freshId(taken, `${entry.id}-rows`),
		def: "flow.sequence",
		x: start.x,
		y: start.y,
		config: { count: 1 },
		...(start.graph ? { graph: start.graph } : {}),
	};
	const withSequence: NodeScript = {
		...script,
		nodes: [...script.nodes, sequence],
		links: [
			...script.links.filter((l) => l !== first),
			{
				id: freshId(taken, `${sequence.id}-in`),
				from: first.from,
				to: { node: sequence.id, pin: "in" },
			},
			{
				id: freshId(taken, `${sequence.id}-s0`),
				from: { node: sequence.id, pin: "s0" },
				to: first.to,
			},
		],
	};
	const split = rowsByWidth(withSequence, registry, new Set([sequence.id]));
	// One row after all: nothing to split, and the graph as it was.
	return split.nodes.some((n) => n.id === sequence.id) ? split : script;
}
