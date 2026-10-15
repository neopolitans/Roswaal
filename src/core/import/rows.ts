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
	let out = script;
	for (const id of sequences) out = regroup(out, registry, id, width);
	return out;
}

function regroup(script: NodeScript, registry: Registry, seqId: string, width: number): NodeScript {
	const byId = new Map(script.nodes.map((n) => [n.id, n]));
	const seq = byId.get(seqId);
	if (!seq || seq.def !== "flow.sequence") return script;
	const execOuts = (n: GraphNode): string[] => {
		const def = registry.get(n.def);
		if (!def) return [];
		return resolvePins(def, n.config, n.literals)
			.outputs.filter((p) => p.kind === "exec")
			.map((p) => p.id);
	};
	/** The exec output a statement carries the flow on from, if it has one. */
	const carryPin = (n: GraphNode): string | undefined => {
		const outs = execOuts(n);
		if (outs.length === 1) return outs[0];
		if (n.def === "flow.branch" || n.def === "flow.sequence") return undefined;
		return outs.includes("completed") ? "completed" : outs.includes("then") ? "then" : undefined;
	};
	const from = new Map<string, Link>();
	for (const l of script.links) from.set(`${l.from.node}/${l.from.pin}`, l);
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
	if (units.length === 0) return script;

	const w = (id: string) => nodeBounds(byId.get(id) as GraphNode, registry, true).w + GAP_X;
	const into = new Map<string, Link[]>();
	for (const l of script.links) into.set(l.to.node, [...(into.get(l.to.node) ?? []), l]);
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
		return script.links.some(
			(l) => l.from.node === a && l.to.node === b && !outs.includes(l.from.pin),
		);
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

	const links = script.links.filter((l) => !removed.has(l));
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
			if (pin) links.push(wire({ node: r[j].id, pin }, { node: r[j + 1].id, pin: "in" }));
		}
	};
	rows.forEach(chainRow);
	if (rows.length === 1) {
		// One row: no Sequence. What fed it feeds the row.
		return {
			...script,
			nodes: script.nodes.filter((n) => n.id !== seq.id),
			links: links.map((l) =>
				l.to.node === seq.id ? { ...l, to: { node: rows[0][0].id, pin: "in" } } : l,
			),
		};
	}
	rows.forEach((r, i) => {
		links.push(wire({ node: seq.id, pin: `s${i}` }, { node: r[0].id, pin: "in" }));
	});
	const nodes = script.nodes.map((n) =>
		n.id === seq.id ? { ...n, config: { ...n.config, count: rows.length } } : n,
	);
	return { ...script, nodes, links };
}
