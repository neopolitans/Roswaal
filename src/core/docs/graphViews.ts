/**
 * A drawn graph split the way the editor opens it: the script's own graph,
 * then each function's, a tab each.
 *
 * A function's body is a graph of its own in the editor, so a picture that
 * drew it beside the main flow would show a layout nobody can make. Both
 * renderers ask this before drawing a `graph` block, so every page — a node's
 * example and a guide's scene alike — draws a function where the editor does.
 */

import { FUNCTION_NODES } from "../nodes/flow.js";
import { viewOf } from "../functionGraph.js";
import type { NodeScript } from "../schema.js";

export interface GraphView {
	/** Unique on the page: part of the tabs' radio names in the static build. */
	id: string;
	title: string;
	script: NodeScript;
}

/** FNV-1a, so the same script gets the same ids on every build. */
function hashOf(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

/**
 * The graphs to draw, or nothing when the script has no function — one graph,
 * drawn as it always was. The main graph is left out when nothing is in it:
 * a hoisted Function on its own is only ever drawn in its own graph.
 */
export function graphViews(script: NodeScript): GraphView[] {
	const functions = script.nodes.filter((node) => FUNCTION_NODES.has(node.def));
	if (functions.length === 0) return [];
	const key = hashOf(JSON.stringify(script.nodes.map((n) => [n.id, n.def, n.graph])));
	const views: GraphView[] = [];
	const main = viewOf(script, null);
	if (main.nodes.length > 0) views.push({ id: `${key}-main`, title: script.name, script: main });
	for (const fn of functions) {
		const name = String((fn.config as { name?: unknown } | undefined)?.name ?? "function");
		views.push({ id: `${key}-${fn.id}`, title: `ƒ ${name}`, script: viewOf(script, fn.id) });
	}
	return views;
}
