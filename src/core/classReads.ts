/**
 * What a wired Class Name is known to say.
 *
 * A class-typed node — New Instance, the Find First nodes — types its output
 * from its Class Name. Typed in, that is the literal. Wired, the literal is
 * whatever was last typed before the wire arrived, and the output went on
 * claiming that class whatever the wire carried.
 *
 * So a wired Class Name is followed to where it comes from. A **String** node,
 * reached directly or through reroute knots, is a class the graph can name;
 * anything else is a value nobody knows until it runs, and the output falls
 * back to `Instance`. The answer is written into the node's config as
 * `wiredClass`, the way `reroutes.ts` writes a knot's type: pin derivation sees
 * a node's config and nothing else.
 *
 * Run after any edit, beside `retypeReroutes`, and again before compiling, so
 * a file edited by hand cannot carry a stale answer into the build. Returns the
 * script unchanged and identical when there is nothing to do.
 */

import type { NodeScript } from "./schema.js";
import { CLASS_TYPED } from "./nodes/library.js";

const PIN = "className";

/** The String literal a wire into this pin carries, or "" when it is not one. */
function knownString(script: NodeScript, nodeId: string, pinId: string): string {
	const seen = new Set<string>();
	let at = { node: nodeId, pin: pinId };
	for (;;) {
		const link = script.links.find((l) => l.to.node === at.node && l.to.pin === at.pin);
		if (!link) return "";
		const source = script.nodes.find((n) => n.id === link.from.node);
		if (!source || seen.has(source.id)) return "";
		seen.add(source.id);
		if (source.def === "flow.reroute") {
			at = { node: source.id, pin: "in" };
			continue;
		}
		if (source.def !== "value.string") return "";
		const literal = source.literals?.value;
		return literal && literal.t === "string" ? literal.v.trim() : "";
	}
}

export function retypeClassReads(script: NodeScript): NodeScript {
	let changed = false;
	const nodes = script.nodes.map((node) => {
		if (!CLASS_TYPED.has(node.def)) return node;
		const config = (node.config ?? {}) as { wiredClass?: string };
		const wired = script.links.some((l) => l.to.node === node.id && l.to.pin === PIN);
		if (!wired) {
			if (config.wiredClass === undefined) return node;
			changed = true;
			const { wiredClass: _, ...rest } = config;
			return { ...node, config: rest };
		}
		const known = knownString(script, node.id, PIN);
		if (config.wiredClass === known) return node;
		changed = true;
		return { ...node, config: { ...config, wiredClass: known } };
	});
	return changed ? { ...script, nodes } : script;
}
