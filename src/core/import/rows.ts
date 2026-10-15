/**
 * An imported block's rows, cut by width.
 *
 * Tidy, Modern and Node-Prioritized hang a long block's statements off a
 * Sequence, a row on each output. The importer cuts those rows where an if
 * ends one and where the file has a blank line; this pass then fills each row
 * with statements until the next would run past `width`, measured as the
 * canvas draws them, so a row of narrow statements is not cut short and a row
 * of wide ones does not run off the screen.
 *
 * - A row is cut at a blank line in the file when one falls in its second half.
 * - A step and the statement reading its result (`local x = require(...)`)
 *   stay on one row: the compiler writes them as one line.
 * - A loop or a handler counts the width of its body, which is laid out beside it.
 * - A row ending in a Branch ends there: what follows an if is the next row.
 *
 * Only the Sequence's outputs change, so the Luau is the same. A Sequence left
 * with one row is taken out, and the statements hang off whatever it hung from.
 */

import { nodeBounds, resolvePins } from "../nodeBox.js";
import type { Registry } from "../nodes/index.js";
import type { GraphNode, Link, NodeScript } from "../schema.js";

/** How wide a row may run, in canvas pixels: about one screen and a half at 100%. */
export const ROW_WIDTH = 2400;
/** The space between two statements on a row, as the layout leaves it. */
const GAP_X = 56;

export function rowsByWidth(
	script: NodeScript,
	registry: Registry,
	sequences: ReadonlySet<string>,
	width = ROW_WIDTH,
): NodeScript {
	// Indexed once for all of them, and the changes made at the end. Each
	// Sequence holds a file's or a function's body, so none stands in another's
	// row: each changes only its own wires, which no other one reads, and a
	// file of many functions is not indexed again for each.
	const graph = indexed(script, registry);
	const edits: Edits = { removed: new Set(), added: [], counts: new Map(), dropped: new Map() };
	for (const id of sequences) regroup(graph, id, width, edits);
	if (edits.removed.size === 0 && edits.added.length === 0) return script;
	const nodes = script.nodes
		.filter((n) => !edits.dropped.has(n.id))
		.map((n) => {
			const count = edits.counts.get(n.id);
			return count === undefined ? n : { ...n, config: { ...n.config, count } };
		});
	const links = script.links
		.filter((l) => !edits.removed.has(l))
		.map((l) => {
			const first = edits.dropped.get(l.to.node);
			return first === undefined ? l : { ...l, to: { node: first, pin: "in" } };
		});
	return { ...script, nodes, links: [...links, ...edits.added] };
}

/** What cutting the rows changes, gathered from every Sequence. */
interface Edits {
	removed: Set<Link>;
	added: Link[];
	/** A Sequence's new number of rows. */
	counts: Map<string, number>;
	/** A Sequence left with one row, taken out: the row's first statement, which takes its place. */
	dropped: Map<string, string>;
}

/** The script's nodes and wires, looked up by node, and what is asked of each node. */
function indexed(script: NodeScript, registry: Registry) {
	const byId = new Map(script.nodes.map((n) => [n.id, n]));
	// Asked of a Sequence for every row it starts, and it has an output a
	// row: worked out once a node, not once a question.
	const outsOf = new Map<string, string[]>();
	const execOuts = (n: GraphNode): string[] => {
		const known = outsOf.get(n.id);
		if (known) return known;
		const def = registry.get(n.def);
		const outs = def
			? resolvePins(def, n.config, n.literals)
					.outputs.filter((p) => p.kind === "exec")
					.map((p) => p.id)
			: [];
		outsOf.set(n.id, outs);
		return outs;
	};
	const from = new Map<string, Link>();
	const into = new Map<string, Link[]>();
	const outOf = new Map<string, Link[]>();
	for (const l of script.links) {
		from.set(`${l.from.node}/${l.from.pin}`, l);
		const ins = into.get(l.to.node);
		if (ins) ins.push(l);
		else into.set(l.to.node, [l]);
		const outs = outOf.get(l.from.node);
		if (outs) outs.push(l);
		else outOf.set(l.from.node, [l]);
	}
	const widths = new Map<string, number>();
	const w = (id: string) => {
		let known = widths.get(id);
		if (known === undefined) {
			known = nodeBounds(byId.get(id) as GraphNode, registry, true).w + GAP_X;
			widths.set(id, known);
		}
		return known;
	};
	return { byId, execOuts, from, into, outOf, w };
}

function regroup(
	graph: ReturnType<typeof indexed>,
	seqId: string,
	width: number,
	edits: Edits,
): void {
	const { byId, execOuts, from, into, outOf, w } = graph;
	const seq = byId.get(seqId);
	if (!seq || seq.def !== "flow.sequence") return;
	/** The exec output a statement carries the flow on from, if it has one. */
	const carryPin = (n: GraphNode): string | undefined => {
		const outs = execOuts(n);
		if (outs.length === 1) return outs[0];
		if (n.def === "flow.branch" || n.def === "flow.sequence") return undefined;
		return outs.includes("completed") ? "completed" : outs.includes("then") ? "then" : undefined;
	};
	const linkFrom = (id: string, pin: string) => from.get(`${id}/${pin}`);

	// Every statement on every row, in order; a Branch ends a row.
	const units: { id: string; hard: boolean }[] = [];
	const removed = new Set<Link>();
	for (const pin of execOuts(seq)) {
		const l = linkFrom(seq.id, pin);
		if (!l) continue;
		removed.add(l);
		let at: string | undefined = l.to.node;
		for (let guard = 0; at && guard < 10_000; guard++) {
			const node = byId.get(at);
			if (!node) break;
			const c = carryPin(node);
			const next: Link | undefined = c ? linkFrom(at, c) : undefined;
			units.push({ id: at, hard: c === undefined });
			if (next) removed.add(next);
			at = next?.to.node;
		}
	}
	if (units.length === 0) return;

	const isValue = (n: GraphNode | undefined) =>
		n !== undefined && execOuts(n).length === 0 && n.def !== "script.begin";
	/** How wide a value and the values feeding it lay out, in columns to its left. */
	const tree = (id: string, depth = 0): number => {
		if (depth > 32) return 0;
		const kids = (into.get(id) ?? []).map((l) => byId.get(l.from.node)).filter(isValue);
		return w(id) + Math.max(0, ...kids.map((k) => tree((k as GraphNode).id, depth + 1)));
	};
	/** The values to the left of a row's first statement: the room it starts with. */
	const lead = (id: string): number => {
		const kids = (into.get(id) ?? []).map((l) => byId.get(l.from.node)).filter(isValue);
		return Math.max(0, ...kids.map((k) => tree((k as GraphNode).id)));
	};
	const feeds = (a: string, b: string) => {
		const outs = execOuts(byId.get(a) as GraphNode);
		return (outOf.get(a) ?? []).some((l) => l.to.node === b && !outs.includes(l.from.pin));
	};
	/** How far a loop's body or a handler runs on beside it: its statements end to end. */
	const reach = (id: string): number => {
		const n = byId.get(id) as GraphNode;
		const c = carryPin(n);
		let widest = 0;
		for (const arm of execOuts(n).filter((p) => p !== c)) {
			let at = linkFrom(id, arm)?.to.node;
			let total = at ? lead(at) : 0;
			for (let guard = 0; at && guard < 256; guard++) {
				total += w(at);
				const node = byId.get(at);
				const p = node ? carryPin(node) : undefined;
				at = p ? linkFrom(at, p)?.to.node : undefined;
			}
			widest = Math.max(widest, total);
		}
		return widest;
	};

	const rows: { id: string; hard: boolean }[][] = [];
	let row: { id: string; hard: boolean }[] = [];
	let used = 0;
	const usedBy = (r: { id: string }[]) =>
		r.reduce((t, u, i) => t + w(u.id) + (i === 0 ? lead(u.id) : 0), 0);
	for (const u of units) {
		const own = w(u.id) + (row.length === 0 ? lead(u.id) : 0);
		if (row.length > 0 && used + own + reach(u.id) > width) {
			let cut = row.length;
			for (let j = row.length - 1; j >= Math.ceil(row.length / 2); j--) {
				if (byId.get(row[j].id)?.config?.blankBefore) {
					cut = j;
					break;
				}
			}
			// Never between a step and the statement reading its result.
			while (cut > 1 && feeds(row[cut - 1].id, cut < row.length ? row[cut].id : u.id)) cut--;
			rows.push(row.slice(0, cut));
			row = row.slice(cut);
			used = usedBy(row);
		}
		row.push(u);
		used += own;
		if (u.hard) {
			rows.push(row);
			row = [];
			used = 0;
		}
	}
	if (row.length > 0) rows.push(row);

	for (const l of removed) edits.removed.add(l);
	// New wires take ids of the Sequence's own, which no other wire has.
	let made = 0;
	const wire = (from: Link["from"], to: Link["to"]): Link => ({
		id: `${seq.id}-row${made++}`,
		from,
		to,
	});
	const chainRow = (r: { id: string }[]) => {
		for (let j = 0; j + 1 < r.length; j++) {
			const pin = carryPin(byId.get(r[j].id) as GraphNode);
			if (pin) edits.added.push(wire({ node: r[j].id, pin }, { node: r[j + 1].id, pin: "in" }));
		}
	};
	rows.forEach(chainRow);
	if (rows.length === 1) {
		// One row: no Sequence. What fed it feeds the row.
		edits.dropped.set(seq.id, rows[0][0].id);
		return;
	}
	rows.forEach((r, i) => {
		edits.added.push(wire({ node: seq.id, pin: `s${i}` }, { node: r[0].id, pin: "in" }));
	});
	edits.counts.set(seq.id, rows.length);
}
