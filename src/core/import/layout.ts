/**
 * Where an imported graph's nodes go: the flow layout (`../layout/flow.ts`),
 * which Realign uses too, run on each graph of the file -- its own and one
 * per function -- from its entry.
 *
 * The importer knows what each comment box will go round, so it passes the
 * room each title needs and the steps each box holds; the boxes themselves are
 * drawn afterwards, round where those steps went.
 */

import { type GraphId, mergeLayout, viewOf } from "../functionGraph.js";
import { applyFlow, layoutFlow } from "../layout/flow.js";
import { FUNCTION_NODES } from "../nodes/flow.js";
import type { Registry } from "../nodes/index.js";
import type { NodeScript } from "../schema.js";

/** Lays out every graph of an imported script. */
export function layoutImport(
	script: NodeScript,
	registry: Registry,
	/**
	 * Statements a comment box will head, and the room its title takes: their
	 * row is lowered by it, so the title sits in a gap of its own.
	 */
	headed: ReadonlyMap<string, number> = new Map(),
	/**
	 * The nodes each comment box goes round, by the statement it heads. No
	 * value is tucked into a box, and a step in one keeps its values to its left.
	 */
	boxed: ReadonlyMap<string, string> = new Map(),
): NodeScript {
	let out = script;
	const graphs: GraphId[] = [
		null,
		...script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).map((n) => n.id),
	];
	for (const graph of graphs) {
		const view = viewOf(out, graph);
		const result = layoutFlow(view, registry, graph, { headed, boxed });
		out = mergeLayout(out, graph, applyFlow(view, result));
	}
	return out;
}
