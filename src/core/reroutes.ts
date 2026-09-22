/**
 * A reroute knot's type, which is the type of what it is carrying.
 *
 * ## Why this is in core
 *
 * It was in `src/app/edits.ts`, where the canvas needed it, and the
 * documentation draws graphs too — so the knot in the picture under "Reroute
 * knots" was grey while the paragraph beside it said a knot takes the type of
 * whatever is wired into it. `src/core` cannot import from `src/app`, so the
 * rule moved down to where both can reach it, the same way `pinLayout` did.
 *
 * Nothing here touches the DOM or the editor's state. It is a graph in, a graph
 * out.
 */

import { ANY, type NodeScript } from "./schema.js";
import { resolveNodePins, type Registry } from "./nodes/index.js";

/**
 * Gives every reroute knot the type of whatever is wired into it, or `any`
 * when nothing is.
 *
 * A knot's type was decided once, when it was made, and then kept for good.
 * Disconnect the wire feeding a knot that carried a string and the knot went on
 * being a string knot — so it refused every output but a string, and the only
 * way to rewire it was to delete it and cut the wire again. A knot is a bend in
 * a wire: it has no type of its own, it has the type of what it is carrying.
 *
 * ## When to run it
 *
 * **After any edit at all**, which is what `Store.apply` does. The rule used to
 * be "after anything that adds or removes a link", on the theory that a knot's
 * type only changes when its source changes. It also changes when the source
 * stays where it is and says something different — a local given a type, a
 * loop's Value given one, a function's parameter retyped — and none of the
 * twenty-odd edits that can do that remembered to call this. So the knot went
 * on being the type it was when the wire was drawn.
 *
 * Repeated until it settles, because a knot feeding a knot only learns its type
 * once the one before it has. Bounded by the number of knots, which is how long
 * the longest possible chain of them is.
 *
 * Returns the script it was given, unchanged and identical, when there is
 * nothing to do — which is what makes running it on every edit free.
 */
export function retypeReroutes(script: NodeScript, registry: Registry): NodeScript {
	const knots = script.nodes.filter((n) => n.def === "flow.reroute");
	if (knots.length === 0) return script;

	let current = script;
	for (let pass = 0; pass <= knots.length; pass++) {
		let changed = false;

		const nodes = current.nodes.map((node) => {
			if (node.def !== "flow.reroute") return node;

			const link = current.links.find((l) => l.to.node === node.id && l.to.pin === "in");
			const source = link && current.nodes.find((n) => n.id === link.from.node);
			const def = source && registry.get(source.def);
			const pin = def && resolveNodePins(def, source.config, source.literals).outputs.find((x) => x.id === link.from.pin);
			const type = pin?.type ?? ANY;

			const config = (node.config ?? {}) as { type?: string };
			if ((config.type ?? ANY) === type) return node;
			changed = true;
			return { ...node, config: { ...config, type } };
		});

		if (!changed) return current;
		current = { ...current, nodes };
	}
	return current;
}
