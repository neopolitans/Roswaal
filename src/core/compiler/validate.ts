/**
 * Structural checks that run before emission.
 *
 * These catch the problems that would otherwise produce confusing Luau or no
 * output at all. Anything that needs to know the shape of a block (scope
 * escapes, break outside a loop) is left to the emitter, which has that
 * context.
 */

import type { NodeScript } from "../schema.js";
import type { Registry } from "../nodes/index.js";
import { GraphIndex } from "./graph.js";
import type { Diagnostic } from "./emit.js";

/** Data types that flow into anything, in either direction. */
const UNIVERSAL = new Set(["any", "wildcard"]);

function compatible(from: string | undefined, to: string | undefined): boolean {
	const a = from ?? "any";
	const b = to ?? "any";
	if (a === b) return true;
	if (UNIVERSAL.has(a) || UNIVERSAL.has(b)) return true;
	// Numbers stringify implicitly in Luau, and it is more annoying than useful
	// to flag it.
	if ((a === "number" && b === "string") || (a === "string" && b === "number")) return true;
	return false;
}

export function validate(script: NodeScript, registry: Registry): Diagnostic[] {
	const out: Diagnostic[] = [];
	const index = new GraphIndex(script, registry);

	// -- nodes -------------------------------------------------------------
	const seenIds = new Set<string>();
	for (const node of script.nodes) {
		if (seenIds.has(node.id)) {
			out.push({ severity: "error", message: `Duplicate node id "${node.id}".`, node: node.id });
		}
		seenIds.add(node.id);
		if (!registry.has(node.def)) {
			out.push({
				severity: "error",
				message: `Unknown node type "${node.def}". Is a node pack missing from roswaal.json?`,
				node: node.id,
			});
		}
	}

	// -- links -------------------------------------------------------------
	const inputsUsed = new Map<string, number>();
	const execOutUsed = new Map<string, number>();

	for (const link of script.links) {
		const fromNode = index.get(link.from.node);
		const toNode = index.get(link.to.node);
		if (!fromNode || !toNode) {
			out.push({ severity: "error", message: "A wire points at a node that no longer exists." });
			continue;
		}
		const fromPin = index.pin(link.from.node, link.from.pin, "out");
		const toPin = index.pin(link.to.node, link.to.pin, "in");
		if (!fromPin || !toPin) {
			out.push({
				severity: "error",
				message: `A wire between "${fromNode.def.title}" and "${toNode.def.title}" points at a pin that no longer exists.`,
				node: link.to.node,
			});
			continue;
		}
		if (fromPin.kind !== toPin.kind) {
			out.push({
				severity: "error",
				message: "Execution wires and data wires cannot be connected to each other.",
				node: link.to.node,
				pin: link.to.pin,
			});
			continue;
		}
		if (link.from.node === link.to.node) {
			out.push({
				severity: "error",
				message: `"${fromNode.def.title}" is wired to itself.`,
				node: link.from.node,
			});
			continue;
		}

		const inKey = `${link.to.node}/${link.to.pin}`;
		inputsUsed.set(inKey, (inputsUsed.get(inKey) ?? 0) + 1);

		if (fromPin.kind === "exec") {
			const outKey = `${link.from.node}/${link.from.pin}`;
			execOutUsed.set(outKey, (execOutUsed.get(outKey) ?? 0) + 1);
		} else if (!compatible(fromPin.type, toPin.type)) {
			out.push({
				severity: "warning",
				message: `"${fromPin.name || fromPin.id}" is a ${fromPin.type}, but "${toPin.name || toPin.id}" expects a ${toPin.type}.`,
				node: link.to.node,
				pin: link.to.pin,
			});
		}
	}

	for (const [key, count] of inputsUsed) {
		if (count > 1) {
			const [nodeId, pinId] = key.split("/");
			out.push({
				severity: "error",
				message: "An input pin can only accept one wire.",
				node: nodeId,
				pin: pinId,
			});
		}
	}
	for (const [key, count] of execOutUsed) {
		if (count > 1) {
			const [nodeId, pinId] = key.split("/");
			out.push({
				severity: "error",
				message: "An execution output can only lead to one node. Use a Sequence node to fan out.",
				node: nodeId,
				pin: pinId,
			});
		}
	}

	// -- entry points ------------------------------------------------------
	const entries = index.entryNodes();
	if (entries.length === 0 && script.nodes.length > 0) {
		out.push({
			severity: "warning",
			message:
				"This graph has no entry point, so nothing will run. Add a Script Start or a Function node.",
		});
	}

	// -- reachability ------------------------------------------------------
	const reachable = new Set<string>();
	const queue = entries.map((e) => e.node.id);
	// Terminal nodes are roots too: Module Exports is not wired into exec.
	for (const r of index.all()) {
		if (r.def.id === "module.exports") queue.push(r.node.id);
	}
	while (queue.length) {
		const id = queue.pop()!;
		if (reachable.has(id)) continue;
		reachable.add(id);
		const r = index.get(id);
		if (!r) continue;
		for (const pin of r.outputs) {
			for (const link of index.targetsOf(id, pin.id)) queue.push(link.to.node);
		}
		for (const pin of r.inputs) {
			const link = index.sourceOf(id, pin.id);
			if (link) queue.push(link.from.node);
		}
	}
	for (const r of index.all()) {
		if (!reachable.has(r.node.id)) {
			out.push({
				severity: "warning",
				message: `"${r.node.label || r.def.title}" is not connected to anything that runs.`,
				node: r.node.id,
			});
		}
	}

	return out;
}
