/**
 * What a function's body is: where it starts, which nodes bind parameters
 * into one, and which nodes it holds.
 *
 * A function in Roswaal has no container. `function.entry` and
 * `function.declareHere` carry a signature in their config, and the body is
 * whatever the execution wires reach from them. This is the one place that
 * knowledge lives: the emitter walks a body from `bodyPinOf`, the validator
 * checks Get Parameter against `bindsParameters`, and `assignMembership` moves
 * an older file's nodes into function graphs by `functionBody`. Which nodes
 * declare a function at all is `FUNCTION_NODES`, beside their definitions.
 *
 * Not the editor's question of which function a selected node is in, which
 * walks backwards from the node (`findOwningFunction` in the app).
 *
 * ## Where a body starts, and where it stops
 *
 * The two declarations differ, and the difference is easy to get backwards.
 * A hoisted **Function** runs its body from `then` — it is not in the flow, so
 * it has no "next statement". **Declare Function** sits *in* the flow: `body`
 * opens the function and `then` is the statement after it, in the enclosing
 * block. `continuesEnclosingBlock` says the same from the other side.
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

import { FUNCTION_NODES } from "./nodes/flow.js";
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
 * Whether a node binds parameters for a body of its own to read.
 *
 * Wider than the two that declare a function: Connect and Once bind their
 * handler's parameters the same way, into the same `<id>/p<i>` keys, which is
 * why Get Parameter works inside a handler. Checking against `FUNCTION_NODES`
 * alone would report a working graph as pointing at something that is not
 * there.
 */
export function bindsParameters(defId: string): boolean {
	return FUNCTION_NODES.has(defId) || defId === "event.connect" || defId === "event.once";
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
			resolveNodePins(def, node.config, node.literals).outputs
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
