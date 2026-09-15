/**
 * Structural checks that run before emission.
 *
 * These catch the problems that would otherwise produce confusing Luau or no
 * output at all. Anything that needs to know the shape of a block (scope
 * escapes, break outside a loop) is left to the emitter, which has that
 * context.
 */

import { PAIR, type GraphNode, type NodeScript, type PinDef, type Target } from "../schema.js";
import { checkLuauBalance } from "../luauCheck.js";
import { crossingLinks, graphExists } from "../functionGraph.js";
import { FUNCTION_NODES } from "../nodes/flow.js";
import { nodeTitle, REMOVED_NODES, type Registry } from "../nodes/index.js";
import { isSubclassOf } from "../roblox.js";
import { isConstLocal, localNameOf } from "../nodes/variables.js";
import { GraphIndex } from "./graph.js";
import type { Diagnostic } from "./emit.js";

/**
 * The nodes in a graph written only for targets other than `target`: what
 * would become errors if the graph compiled for it. The editor asks before a
 * switch that would make any.
 */
export function offTargetNodes(script: NodeScript, registry: Registry, target: Target): GraphNode[] {
	return script.nodes.filter((node) => {
		const def = registry.get(node.def);
		return def?.targets !== undefined && !def.targets.includes(target);
	});
}

/**
 * The same nodes as a reader wants them listed: by name, once each, with a
 * count where a graph has several — "Get Service ×3" rather than three lines
 * of it. The editor shows this before a switch that would break them.
 */
export function offTargetNames(script: NodeScript, registry: Registry, target: Target): string[] {
	const counts = new Map<string, number>();
	for (const node of offTargetNodes(script, registry, target)) {
		const name = nodeTitle(registry.get(node.def), node);
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
}

/** How a target is named in a message. */
const TARGET_NAMES: Record<Target, string> = { roblox: "Roblox", lune: "Lune" };

/** Data types that flow into anything, in either direction. */
const UNIVERSAL = new Set(["any", "wildcard"]);

/**
 * Whether a value of one type may be wired into a pin of another.
 *
 * The one rule, used by the canvas when a wire is dropped and by the compile
 * when it checks the wires already there. They were two copies until 0.30.0,
 * and the canvas's had learned that a `Model` fits an `Instance` pin while this
 * one had not — so a wire the editor accepted was warned about at compile.
 */
export function typesCompatible(from: string | undefined, to: string | undefined): boolean {
	const a = from ?? "any";
	const b = to ?? "any";
	if (a === b) return true;
	if (UNIVERSAL.has(a) || UNIVERSAL.has(b)) return true;
	// Numbers stringify implicitly in Luau, and it is more annoying than useful
	// to flag it.
	if ((a === "number" && b === "string") || (a === "string" && b === "number")) return true;
	/**
	 * A class goes wherever one it derives from is wanted: a `Model` into an
	 * `Instance`, a `Part` into a `BasePart`, a `TextButton` into a `GuiObject`.
	 * Luau's `IsA`, answered from the engine's own hierarchy.
	 *
	 * Only `Instance` was known before the hierarchy was, so every narrower
	 * version of the same fact wanted a Cast asserting something already true.
	 *
	 * The other way round stays refused. `Instance` into `Part` is a claim about
	 * what the value *is* rather than a fact about its type, and Cast is the node
	 * that makes that claim out loud.
	 */
	if (isSubclassOf(a, b)) return true;
	return false;
}

/**
 * Whether a wire from an output may land on an input: the type rule, and the
 * one exception that belongs to the pin rather than the type.
 *
 * A Key Value Pair is an entry rather than a value, so it goes only where an
 * entry is taken — a pair pin, or one marked `pairs` — and `any` is not one of
 * those. Everything else is `typesCompatible`.
 */
export function pinsCompatible(
	from: Pick<PinDef, "type">, to: Pick<PinDef, "type" | "pairs">,
): boolean {
	if (from.type === PAIR) return to.type === PAIR || to.pairs === true;
	if (to.type === PAIR) return false;
	return typesCompatible(from.type, to.type);
}

export function validate(script: NodeScript, registry: Registry): Diagnostic[] {
	const out: Diagnostic[] = [];
	const index = new GraphIndex(script, registry);

	// -- graphs ------------------------------------------------------------
	//
	// Only a hand-edited file or a bad merge gets here: one graph is on screen at
	// a time, so a wire between two cannot be drawn.
	for (const link of crossingLinks(script)) {
		out.push({
			severity: "error",
			message:
				"This wire runs between two graphs. A value reaches a function through a " +
				"parameter, a local or a variable.",
			node: link.to.node,
		});
	}
	for (const node of script.nodes) {
		if (node.graph !== undefined && !graphExists(script, node.graph)) {
			out.push({
				severity: "error",
				message: "This node is in the graph of a function that is no longer there.",
				node: node.id,
			});
		}
	}

	// -- constants ---------------------------------------------------------
	//
	// `const x = 1; x = 2` is an error Luau raises, and one Roswaal can see
	// before the file is written: the wire from a Declare Local marked const
	// into a Set Local is the whole of it. Said here rather than left to the
	// runtime, because the graph knows which node made the promise and the
	// runtime only knows the line that broke it.
	for (const node of script.nodes) {
		if (node.def !== "local.set") continue;
		const link = script.links.find(
			(l) => l.to.node === node.id && l.to.pin === "variable",
		);
		const source = link && script.nodes.find((n) => n.id === link.from.node);
		if (!source || source.def !== "local.declare" || !isConstLocal(source.config)) continue;
		out.push({
			severity: "error",
			message:
				`"${localNameOf(source)}" is a constant, so it cannot be assigned again. Make the ` +
				"Declare Local an ordinary local, or bind the new value to one of its own.",
			node: node.id,
			pin: "variable",
		});
	}

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
				message:
					REMOVED_NODES[node.def] ??
					`Unknown node type "${node.def}". Is a node pack missing from roswaal.json?`,
				node: node.id,
			});
		}

		// A node written for the other target compiles to calls that do not
		// exist there, so the file would fail the moment it ran. An error, on
		// the node, rather than the warning it was: a warning let the file be
		// written anyway. Checked here because every node passes through —
		// the emitter only sees the execution chain, and a pure Get Service
		// never walked it.
		const def = registry.get(node.def);
		if (def?.targets && !def.targets.includes(script.target)) {
			out.push({
				severity: "error",
				message:
					`"${def.title}" only works in ${def.targets.map((t) => TARGET_NAMES[t]).join(" and ")}, ` +
					`and this graph compiles for ${TARGET_NAMES[script.target]}.`,
				node: node.id,
			});
		}

		// A Luau Expression is spliced where a value goes, so a statement typed
		// into one produces `print(local x = 1)` — emitted without complaint,
		// because the text is raw and nothing checks it. This is the difference
		// between the two escape hatches, and the one people get wrong.
		if (node.def === "value.expression") {
			const code = node.literals?.code;
			const text = code?.t === "raw" || code?.t === "string" ? code.v.trimStart() : "";
			const opener = /^(local|if|for|while|repeat|return|do|end|else|elseif)\b/.exec(text);
			if (opener) {
				out.push({
					severity: "warning",
					message:
						`"${opener[1]}" starts a statement, and Luau Expression is substituted where a ` +
						"value goes — this would emit something like `print(local x = 1)`. Use Custom " +
						"Code for statements; it sits in the execution chain instead.",
					node: node.id,
					pin: "code",
				});
			}
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
		} else if (!pinsCompatible(fromPin, toPin) && fromPin.type !== PAIR) {
			// A misplaced pair is the emitter's to report, as an error on the
			// pair, where the reason can be said properly.
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

	// -- variables ---------------------------------------------------------
	const variables = script.variables ?? [];
	const variableIds = new Set(variables.map((v) => v.id));
	const seenNames = new Set<string>();
	for (const variable of variables) {
		if (variable.name.trim() === "") {
			out.push({ severity: "error", message: "A variable has no name." });
		} else if (seenNames.has(variable.name)) {
			out.push({
				severity: "warning",
				message: `Two variables are both called "${variable.name}". The generated locals will be given distinct names.`,
			});
		}
		seenNames.add(variable.name);
	}

	// Both nodes that declare a function, not just the hoisted one. A Get
	// Function pointing at a Declare Function was reported as pointing at a
	// function that is no longer in the graph -- about a node plainly on the
	// canvas, which sends you looking for the wrong thing entirely.
	const functionIds = new Set(
		script.nodes.filter((n) => FUNCTION_NODES.has(n.def)).map((n) => n.id),
	);

	/**
	 * Everything that binds parameters, which is a wider set than the two that
	 * declare a function: Connect and Once bind their handler's parameters the
	 * same way, into the same `p{i}` keys. Get Parameter works inside a handler
	 * for that reason, so checking it against `functionIds` would report a
	 * working graph as pointing at something that is not there.
	 */
	const paramOwnerIds = new Set(
		script.nodes
			.filter((n) => FUNCTION_NODES.has(n.def) || n.def === "event.connect" || n.def === "event.once")
			.map((n) => n.id),
	);

	for (const node of script.nodes) {
		if (node.def === "variable.get" || node.def === "variable.set") {
			const ref = (node.config ?? {}) as { variable?: string };
			if (!ref.variable) {
				out.push({
					severity: "error",
					message: `${node.def === "variable.get" ? "Get" : "Set"} Variable has no variable chosen.`,
					node: node.id,
				});
			} else if (!variableIds.has(ref.variable)) {
				out.push({
					severity: "error",
					message: "This node points at a variable that has been deleted.",
					node: node.id,
				});
			}
		}
		if (node.def === "function.get") {
			const ref = (node.config ?? {}) as { function?: string };
			if (!ref.function) {
				out.push({ severity: "error", message: "Get Function has no function chosen.", node: node.id });
			} else if (!functionIds.has(ref.function)) {
				out.push({
					severity: "error",
					message: "This node points at a function that is no longer in the graph.",
					node: node.id,
				});
			}
		}
		/**
		 * Get Parameter, which can point at a *handler* as well as a function:
		 * Connect binds its parameters exactly as the two declarations do, so
		 * `FUNCTION_NODES` is the wrong set here and would report a working
		 * graph as broken.
		 *
		 * The second check is the one the others do not need. A function that
		 * still exists can stop having a parameter by that name, and the node
		 * left behind is pointing at something real that no longer has what it
		 * asked for — which deserves to say so rather than fail at compile.
		 */
		if (node.def === "function.getParam") {
			const ref = (node.config ?? {}) as { function?: string; param?: string };
			const owner = ref.function
				? script.nodes.find((n) => n.id === ref.function && paramOwnerIds.has(n.id))
				: undefined;
			if (!ref.function) {
				out.push({ severity: "error", message: "Get Parameter has no function chosen.", node: node.id });
			} else if (!owner) {
				out.push({
					severity: "error",
					message: "This node points at a function that is no longer in the graph.",
					node: node.id,
				});
			} else {
				const signature = (owner.config ?? {}) as {
					name?: string; params?: { name?: string }[];
				};
				const named = (signature.params ?? []).some((p) => p.name === ref.param);
				if (!named) {
					out.push({
						severity: "error",
						message:
							`"${ref.param ?? "That parameter"}" is not a parameter of ` +
							`"${signature.name ?? "that function"}" any more.`,
						node: node.id,
					});
				}
			}
		}
	}

	// -- hand-written Luau -------------------------------------------------
	//
	// Raw literals land in the output verbatim, so an unclosed string here
	// breaks the generated file somewhere the developer never wrote. Catching
	// it against the node that holds it is the difference between a useful
	// error and a baffling one.
	for (const node of script.nodes) {
		for (const [pinId, literal] of Object.entries(node.literals ?? {})) {
			if (literal.t !== "raw" || literal.v.trim() === "") continue;
			for (const problem of checkLuauBalance(literal.v)) {
				out.push({
					severity: "error",
					message: `${problem.message} (line ${problem.line} of this node's code)`,
					node: node.id,
					pin: pinId,
				});
			}
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
	// Terminal nodes are roots too: Module Exports is not wired into exec, and a
	// Declare Type at Top has no pins at all -- it declares, it does not run.
	// The in-flow Declare Type is not a root: it is reached by its exec wire, and
	// one left dangling should be reported like any other stranded node.
	for (const r of index.all()) {
		if (r.def.id === "module.exports" || r.def.id === "type.declareTop") queue.push(r.node.id);
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
				message: `"${nodeTitle(r.def, r.node)}" is not connected to anything that runs.`,
				node: r.node.id,
			});
		}
	}

	return out;
}
