/**
 * The box around a set of nodes and comments, in world coordinates.
 */

import type { Registry } from "../core/nodes/index.js";

/** The box around `ids`, or null when none of them is in the script. */
export function boundsOf(
	script: { nodes: { id: string; x: number; y: number }[]; comments: { id: string; x: number; y: number; w: number; h: number }[] },
	ids: ReadonlySet<string>,
	registry: Registry,
) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	let found = false;

	for (const node of script.nodes) {
		if (!ids.has(node.id)) continue;
		const def = registry.get((node as { def?: string }).def ?? "");
		const rows = def ? Math.max(def.inputs.length, def.outputs.length, 1) : 1;
		found = true;
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + 216);
		maxY = Math.max(maxY, node.y + 30 + rows * 24 + 10);
	}
	for (const c of script.comments) {
		if (!ids.has(c.id)) continue;
		found = true;
		minX = Math.min(minX, c.x);
		minY = Math.min(minY, c.y);
		maxX = Math.max(maxX, c.x + c.w);
		maxY = Math.max(maxY, c.y + c.h);
	}
	return found ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}
