/**
 * Which nodes make up a function's body.
 *
 * A function in Roswaal has no container. `function.entry` and
 * `function.declareHere` carry a signature in their config, and the body is
 * simply whatever the execution wires reach from them — which is why
 * `findOwningFunction` has to walk *backwards* to answer "which function is
 * this Return in". Nothing stores the answer, so anything that wants to draw,
 * fold or reason about a function as a unit has to derive it.
 *
 * This is that derivation, in `src/core` and shared, so the canvas and the
 * compiler cannot come to different conclusions about what is inside a
 * function. A view that hid a node the emitter still compiles would look like a
 * bug in the compiler rather than in the view.
 *
 * ## Where a body starts, and where it stops
 *
 * The two declarations differ, and the difference is easy to get backwards.
 * A hoisted **Function** runs its body from `then` — it is not in the flow, so
 * it has no "next statement". **Declare Function** sits *in* the flow: `body`
 * opens the function and `then` is the statement after it, in the enclosing
 * block. `continuesEnclosingBlock` says exactly this, and the emitter walks
 * `execTarget(id, "body")` for one and `execTarget(id, "then")` for the other.
 *
 * Everything reachable along execution wires from that start is inside,
 * branches and loop bodies included: a branch arm nested in a function is still
 * in the function. The one boundary is a **nested declaration**. The node
 * itself is a statement in the outer body and belongs to it, but the body it
 * opens belongs to the function it declares — so `body` is not followed and
 * `then` is.
 *
 * An event handler is deliberately *not* a boundary. `Connect`'s body is a
 * closure written inside the function and compiled inside it, so it travels
 * with it.
 */

import { resolveNodePins, type Registry } from "./nodes/index.js";
import type { Link, NodeScript } from "./schema.js";

/** Every node's outgoing links, so the walk does not rescan the list. */
function outgoingLinks(script: NodeScript): Map<string, Link[]> {
	const out = new Map<string, Link[]>();
	for (const link of script.links) {
		const list = out.get(link.from.node);
		if (list) list.push(link);
		else out.set(link.from.node, [link]);
	}
	return out;
}

/**
 * The execution pin a function's body hangs from.
 *
 * `undefined` for a node that does not declare one, so a caller can tell "not a
 * function" from "a function with an empty body".
 */
export function bodyPinOf(defId: string): string | undefined {
	if (defId === "function.declareHere") return "body";
	if (defId === "function.entry") return "then";
	return undefined;
}

/**
 * The nodes on the execution chain inside this function.
 *
 * The declaration itself is **not** included: it is the thing being described,
 * and a caller folding a function wants what to hide, not what to hide it
 * behind. Empty for a function with nothing wired into its body, and for a node
 * that is not a function at all.
 */
export function functionBody(
	script: NodeScript, registry: Registry, functionId: string,
): Set<string> {
	const fn = script.nodes.find((n) => n.id === functionId);
	const startPin = fn && bodyPinOf(fn.def);
	if (!fn || startPin === undefined) return new Set();

	const outgoing = outgoingLinks(script);
	const byId = new Map(script.nodes.map((n) => [n.id, n]));

	const body = new Set<string>();
	const queue: string[] = [];
	for (const link of outgoing.get(functionId) ?? []) {
		if (link.from.pin === startPin) queue.push(link.to.node);
	}

	while (queue.length > 0) {
		const id = queue.pop()!;
		// Also the loop guard: an execution wire back into an earlier node is a
		// graph error the compiler reports, and must not hang the editor.
		if (body.has(id)) continue;
		const node = byId.get(id);
		if (!node) continue;
		body.add(id);

		const def = registry.get(node.def);
		if (!def) continue;
		const execOut = new Set(
			resolveNodePins(def, node.config).outputs
				.filter((pin) => pin.kind === "exec")
				.map((pin) => pin.id),
		);

		const nested = bodyPinOf(node.def);
		for (const link of outgoing.get(id) ?? []) {
			if (!execOut.has(link.from.pin)) continue;
			// A nested declaration belongs to this body; the body it opens does not.
			if (nested !== undefined && link.from.pin === nested) continue;
			queue.push(link.to.node);
		}
	}

	return body;
}

/**
 * Whether this node is a function that has been folded shut.
 *
 * Exported so the header's toggle and the canvas's filter cannot come to
 * different views about what the flag means — the failure there is a node that
 * draws as open while its body is hidden, or the reverse.
 *
 * The flag is stored in the node's own config, so a graph opens the way it was
 * left and a teammate pulling it sees the same tidy canvas. An older Roswaal
 * ignores the field, which is why it is a config key rather than a schema
 * change.
 */
export function isCollapsed(node: { def: string; config?: Record<string, unknown> }): boolean {
	return bodyPinOf(node.def) !== undefined && node.config?.collapsed === true;
}

/**
 * Every node hidden by a folded function, across the whole graph.
 *
 * The union of each collapsed function's body, so nested folds and two folds
 * side by side both come out right without the caller reasoning about either.
 *
 * **The declarations themselves are never hidden.** A folded function still has
 * to be on the canvas — it is what you open to get back in, and hiding it would
 * make the fold unreachable and the graph look as though the function had been
 * deleted.
 */
export function hiddenByCollapse(script: NodeScript, registry: Registry): Set<string> {
	const hidden = new Set<string>();
	for (const node of script.nodes) {
		if (!isCollapsed(node)) continue;
		for (const id of functionBodyWithValues(script, registry, node.id)) hidden.add(id);
	}
	// A declaration inside another function's folded body is hidden by *that*
	// fold and stays hidden; one that is merely folded itself is not.
	for (const node of script.nodes) {
		if (isCollapsed(node) && !insideAnother(script, registry, node.id)) hidden.delete(node.id);
	}
	return hidden;
}

/** Whether this function's declaration sits inside some other function's body. */
function insideAnother(script: NodeScript, registry: Registry, functionId: string): boolean {
	for (const node of script.nodes) {
		if (node.id === functionId || bodyPinOf(node.def) === undefined) continue;
		if (!isCollapsed(node)) continue;
		if (functionBody(script, registry, node.id).has(functionId)) return true;
	}
	return false;
}

/**
 * The body, plus the pure nodes that exist only to feed it.
 *
 * Execution wires alone are not enough to fold a function. A pure node — a
 * comparison, a Get Children, a Find First Child — sits off the chain entirely
 * and can be placed anywhere on the canvas, so a fold that hid only the chain
 * would leave a scatter of orphaned values behind, still wired to nodes that
 * are no longer drawn.
 *
 * A pure node travels with the body when **everything that reads it is inside**
 * — that is what makes it part of this function rather than shared with the
 * graph around it. One read from outside and it stays put, because it is
 * genuinely in both places and hiding it would strand the outside reader.
 *
 * Repeated to a fixed point, since pure nodes feed pure nodes: the `not` behind
 * a branch condition is only known to be interior once the comparison it reads
 * has been.
 */
export function functionBodyWithValues(
	script: NodeScript, registry: Registry, functionId: string,
): Set<string> {
	const inside = functionBody(script, registry, functionId);
	if (inside.size === 0) return inside;

	const byId = new Map(script.nodes.map((n) => [n.id, n]));
	const readers = new Map<string, Set<string>>();
	for (const link of script.links) {
		const list = readers.get(link.from.node);
		if (list) list.add(link.to.node);
		else readers.set(link.from.node, new Set([link.to.node]));
	}

	// Bounded by the number of nodes: each pass adds at least one or stops.
	for (let pass = 0; pass < script.nodes.length; pass++) {
		let added = false;
		for (const node of script.nodes) {
			if (inside.has(node.id) || node.id === functionId) continue;
			const def = registry.get(node.def);
			if (!def?.pure) continue;

			const consumers = readers.get(node.id);
			if (!consumers || consumers.size === 0) continue;
			let allInside = true;
			for (const consumer of consumers) {
				if (!inside.has(consumer) && consumer !== functionId) {
					allInside = false;
					break;
				}
			}
			if (!allInside) continue;
			inside.add(node.id);
			added = true;
		}
		if (!added) break;
	}

	// A node that no longer exists cannot be folded away with anything.
	for (const id of [...inside]) if (!byId.has(id)) inside.delete(id);
	return inside;
}
