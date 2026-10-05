/**
 * A step's named result, as a local the rest of the graph can read by name.
 *
 * Naming a call's result declares its local — `local hullModel = need(...)` —
 * and a local is a thing a graph holds. So it is offered the way a Declare
 * Local is: in the Variables panel, in the node search as `Get hullModel`, and
 * read with Get Local wherever it is in scope, with no wire back to the call.
 *
 * Only a step's, never a pure node's. A step's local is written where the step
 * runs, which is a place in the flow a reader can be after; a pure node's is
 * written wherever it is first read, which is nowhere in particular.
 */

import { type Registry, resolveNodePins } from "./nodes/index.js";
import type { LocalRef } from "./nodes/variables.js";
import type { GraphNode, NodeConfig, NodeScript } from "./schema.js";

/** The name typed into Result name, trimmed, or undefined. */
function resultNameOf(config: NodeConfig | undefined): string | undefined {
	const named = config?.resultName;
	return typeof named === "string" && named.trim() !== "" ? named.trim() : undefined;
}

/**
 * The local a step's named result declares, or undefined: a node that is not a
 * step, has no Result name, or has no `result` to name.
 */
export function namedResultRef(
	node: Pick<GraphNode, "id" | "def" | "config" | "literals">,
	registry: Registry,
): Required<LocalRef> | undefined {
	const name = resultNameOf(node.config);
	if (!name) return undefined;
	const def = registry.get(node.def);
	if (!def || def.pure || !def.outputs.some((p) => p.kind === "exec")) return undefined;
	const result = resolveNodePins(def, node.config, node.literals).outputs.find(
		(p) => p.id === "result" && p.kind === "data",
	);
	if (!result) return undefined;
	return { local: node.id, name, type: result.type ?? "any" };
}

/**
 * Brings every Get Local reading a named result up to date with it.
 *
 * Beside `syncLocalRefs`, which does the same for Declare Local. A result's
 * name changes in the Inspector and its type when the call's signature does,
 * and the capsule shows both from its own config.
 */
export function syncNamedResultRefs(script: NodeScript, registry: Registry): NodeScript {
	if (!script.nodes.some((n) => n.def === "local.get")) return script;
	const byId = new Map(script.nodes.map((n) => [n.id, n] as const));
	let changed = false;
	const nodes = script.nodes.map((node) => {
		if (node.def !== "local.get") return node;
		const target = byId.get(String(node.config?.local ?? ""));
		if (!target || target.def === "local.declare") return node;
		const ref = namedResultRef(target, registry);
		if (!ref) return node;
		if (node.config?.name === ref.name && node.config?.type === ref.type) return node;
		changed = true;
		return { ...node, config: { ...node.config, name: ref.name, type: ref.type } };
	});
	return changed ? { ...script, nodes } : script;
}
