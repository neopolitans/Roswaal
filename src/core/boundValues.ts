/**
 * A bound value's type, which is the type of what its condition is wired to.
 *
 * A Branch or While Loop with Bind on hands its condition on as a pin: `admin`
 * on the True side of `if local admin = admins[id]`. That pin carries what the
 * condition does, with `nil` and `false` already ruled out -- which pin types
 * never spell, so it is the source pin's type as it stands. Kept in
 * `boundType` on the node, the way `reroutes.ts` keeps a knot's, so pin
 * derivation, which sees a node's config and nothing else, can type the pin.
 *
 * In core because the editor, the compiler and the docs' drawn graphs all need
 * it; run after every edit, like `retypeReroutes`, so the pin follows the wire
 * however the wire changed.
 */

import { boundValueOf } from "./nodes/flow.js";
import { type Registry, resolveNodePins } from "./nodes/index.js";
import { ANY, type NodeScript } from "./schema.js";

/** The nodes that can bind their condition. */
const BINDS = new Set(["flow.branch", "flow.while"]);

/**
 * Gives every bound Branch and While Loop the type of what feeds its
 * condition, or none when nothing does. Returns the script it was given,
 * identical, when there is nothing to change.
 */
export function retypeBoundValues(script: NodeScript, registry: Registry): NodeScript {
	let changed = false;
	const nodes = script.nodes.map((node) => {
		if (!BINDS.has(node.def) || !boundValueOf(node.config)) return node;
		const link = script.links.find((l) => l.to.node === node.id && l.to.pin === "condition");
		const source = link && script.nodes.find((n) => n.id === link.from.node);
		const def = source && registry.get(source.def);
		const pin =
			def &&
			resolveNodePins(def, source.config, source.literals).outputs.find(
				(x) => x.id === link.from.pin,
			);
		const type = pin?.type && pin.type !== ANY ? pin.type : undefined;
		const config = node.config ?? {};
		if (config.boundType === type) return node;
		changed = true;
		if (type === undefined) {
			const { boundType: _, ...rest } = config;
			return { ...node, config: rest };
		}
		return { ...node, config: { ...config, boundType: type } };
	});
	return changed ? { ...script, nodes } : script;
}
