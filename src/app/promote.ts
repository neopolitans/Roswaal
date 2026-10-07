/**
 * Promoting a node to something the Variables panel declares.
 *
 * Each of these is a thing the canvas can hold and the panel can hold too: a
 * service fetched by a Get Service, a module required by a node, a local, a
 * step's named result. Promoting moves it to where the rest of the script can
 * see it by name, and rewires the graph so what it compiles to means the same
 * -- the right-click equivalent of retyping it in the panel and repointing
 * every node by hand.
 *
 * Offered from a node's right-click menu (`NodeActionMenu`), only where the
 * result would compile to the same thing. A Declare Local inside a loop is a
 * fresh value each time round, and a script variable is not, so that one is
 * not offered.
 */

import { instanceSpecifier, parseInstancePath } from "../core/modules.js";
import { namedResultRef } from "../core/namedResults.js";
import type { Registry } from "../core/nodes/index.js";
import { localNameOf, localTypeOf } from "../core/nodes/variables.js";
import { lastSegment } from "../core/roblox.js";
import type { GraphNode, Link, Literal, NodeScript } from "../core/schema.js";
import { SCRIPT_CALLS } from "../core/scriptCalls.js";
import { addService, addVariable, declareModule } from "./edits.js";
import { configText } from "./nodeConfig.js";
import { newId } from "./store.js";

/** One way a node can be promoted: what the menu calls it, and the edit. */
export interface Promotion {
	label: string;
	/** Its tooltip: what it will do. */
	title: string;
	run: (script: NodeScript) => NodeScript;
}

const text = (node: GraphNode, pin: string): string => {
	const literal = node.literals?.[pin];
	return literal && (literal.t === "string" || literal.t === "raw") ? literal.v.trim() : "";
};

/** Every promotion this node offers, in the order the menu lists them. */
export function promotionsFor(script: NodeScript, registry: Registry, nodeId: string): Promotion[] {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return [];
	const out: Promotion[] = [];

	const service = serviceToDeclare(script, node);
	if (service) {
		out.push({
			label: "Promote to Services",
			title: `Declare ${service} in the Variables panel, fetched at the top in the order listed.`,
			run: (s) => addService(s, service),
		});
	}

	const module = moduleToDeclare(node);
	if (module) {
		out.push({
			label: "Promote to Modules",
			title: `Declare ${module.specifier} in the Variables panel; this becomes a Get Module.`,
			run: (s) => promoteModule(s, nodeId, module),
		});
	}

	if (canPromoteLocal(script, node)) {
		out.push({
			label: "Promote to Variable",
			title: "Make this local a script variable, declared at the top with its value.",
			run: (s) => promoteLocal(s, nodeId),
		});
	}

	const named = namedResultRef(node, registry);
	if (named) {
		out.push({
			label: "Promote to Declare Local",
			title: `Declare ${named.name} with its own Declare Local after this step, so it can be set later.`,
			run: (s) => promoteNamedResult(s, registry, nodeId),
		});
	}
	return out;
}

/** The service a Get Service fetches, when declaring it would add something. */
function serviceToDeclare(script: NodeScript, node: GraphNode): string | undefined {
	if (node.def !== "roblox.getService" || script.target !== "roblox") return undefined;
	const name = text(node, "service");
	if (name === "" || (script.services ?? []).includes(name)) return undefined;
	return name;
}

/** What a Require Module or Require at Top would be declared as. */
function moduleToDeclare(node: GraphNode): { name: string; specifier: string } | undefined {
	if (node.def === "module.requirePath") {
		const root = text(node, "root");
		const path = text(node, "path");
		if (root === "" || path === "") return undefined;
		const specifier = instanceSpecifier([root, ...path.split(".").map((s) => s.trim())]);
		// A root the Modules list does not read as a path -- `shared` -- stays a node.
		const parsed = parseInstancePath(specifier);
		if (!parsed || !("path" in parsed)) return undefined;
		return { name: text(node, "as") || lastSegment(path), specifier };
	}
	if (node.def === "module.requireTop") {
		const specifier = text(node, "specifier");
		if (specifier === "") return undefined;
		const named = text(node, "as");
		const derived =
			specifier
				.split(/[\\/]+/)
				.pop()
				?.replace(/\.(luau|lua)$/, "") ?? "";
		return { name: named || derived || "module", specifier };
	}
	return undefined;
}

/**
 * The require node becomes a Get Module for the new declaration, in the same
 * place and with the same wires, and any module function called through it is
 * called through the declaration instead.
 */
function promoteModule(
	script: NodeScript,
	nodeId: string,
	module: { name: string; specifier: string },
): NodeScript {
	// One already declared for the same module is used, not doubled.
	const added = declareModule(script, module.name, module.specifier);
	const name = added.name;
	return {
		...added.script,
		nodes: added.script.nodes.map((node) => {
			if (node.id === nodeId) {
				// Both output `exports`, so every wire stays where it is.
				return {
					id: node.id,
					def: "module.get",
					x: node.x,
					y: node.y,
					...(node.graph ? { graph: node.graph } : {}),
					config: { module: added.id, name },
				};
			}
			if (SCRIPT_CALLS.has(node.def) && node.config?.module === nodeId) {
				return { ...node, config: { ...node.config, module: added.id, moduleName: name } };
			}
			return node;
		}),
	};
}

/** Exec pins that carry on at the same level: `then`, and a Sequence's steps. */
const SAME_LEVEL = /^(then|s\d+)$/;

/**
 * Whether a Declare Local runs once, at the top level of the script's own flow,
 * with a value typed in -- so declaring it at the top instead changes nothing.
 * Inside a function, a loop or a handler it is a fresh local each time, and a
 * wired value is computed where it stands, so neither is offered.
 */
function canPromoteLocal(script: NodeScript, node: GraphNode): boolean {
	if (node.def !== "local.declare" || node.graph) return false;
	if (script.links.some((l) => l.to.node === node.id && l.to.pin === "value")) return false;
	const byId = new Map(script.nodes.map((n) => [n.id, n] as const));
	const seen = new Set<string>();
	let at = node.id;
	for (;;) {
		if (seen.has(at)) return false;
		seen.add(at);
		const into = script.links.filter((l) => l.to.node === at && l.to.pin === "in");
		const [link, ...more] = into;
		if (!link || more.length > 0) return false;
		const from = byId.get(link.from.node);
		if (!from) return false;
		if (from.def === "script.begin") return true;
		if (!SAME_LEVEL.test(link.from.pin)) return false;
		at = from.id;
	}
}

/**
 * The local becomes a script variable with its name, type and value. The node
 * goes and the flow closes over the gap; a Get Local becomes a Get Variable, a
 * Set Local wired from it a Set Variable, and anything else reading it reads a
 * Get Variable put where the declaration was.
 */
function promoteLocal(script: NodeScript, nodeId: string): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return script;
	const name = localNameOf(node);
	const declared = localTypeOf(node.config);
	const value: Literal = node.literals?.value ?? { t: "nil" };
	const type = declared || typeOfLiteral(value);
	const added = addVariable(script, name, type, value);
	const variable = added.script.variables.find((v) => v.id === added.id);
	if (!variable) return script;
	const ref = { variable: variable.id, name: variable.name, type: variable.type };

	const links = added.script.links;
	const into = links.filter((l) => l.to.node === nodeId && l.to.pin === "in");
	const onward = links.filter((l) => l.from.node === nodeId && l.from.pin === "then");
	const reads = links.filter((l) => l.from.node === nodeId && l.from.pin === "ref");
	const setters = new Set(
		reads
			.filter(
				(l) =>
					l.to.pin === "variable" &&
					added.script.nodes.find((n) => n.id === l.to.node)?.def === "local.set",
			)
			.map((l) => l.to.node),
	);
	const others = reads.filter((l) => !setters.has(l.to.node));
	const getter = others.length > 0 ? newId() : undefined;

	const kept: Link[] = links.filter(
		(l) =>
			l.to.node !== nodeId &&
			l.from.node !== nodeId &&
			!(setters.has(l.to.node) && l.to.pin === "variable"),
	);
	// Close the flow over where the declaration was.
	for (const before of into) {
		for (const after of onward) kept.push({ id: newId(), from: before.from, to: after.to });
	}
	if (getter) {
		for (const read of others) {
			kept.push({ id: newId(), from: { node: getter, pin: "value" }, to: read.to });
		}
	}

	const nodes: GraphNode[] = added.script.nodes.flatMap((n) => {
		if (n.id === nodeId) {
			return getter
				? [{ id: getter, def: "variable.get", x: n.x, y: n.y + 40, config: { ...ref } }]
				: [];
		}
		if (n.def === "local.get" && configText(n, "local") === nodeId) {
			return [{ id: n.id, def: "variable.get", x: n.x, y: n.y, config: { ...ref } }];
		}
		if (setters.has(n.id)) {
			return [
				{
					id: n.id,
					def: "variable.set",
					x: n.x,
					y: n.y,
					...(n.literals?.value ? { literals: { value: n.literals.value } } : {}),
					config: { ...ref },
				},
			];
		}
		return [n];
	});
	return { ...added.script, nodes, links: kept };
}

/** The type a typed-in value has, for a local declared without one. */
function typeOfLiteral(value: Literal): string {
	switch (value.t) {
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "string":
			return "string";
		default:
			return "any";
	}
}

/**
 * The step keeps running where it is; its result is no longer named on it, and
 * a Declare Local after it takes the result under that name. Every Get Local
 * that read the result reads the declaration.
 */
function promoteNamedResult(script: NodeScript, registry: Registry, nodeId: string): NodeScript {
	const node = script.nodes.find((n) => n.id === nodeId);
	const named = node && namedResultRef(node, registry);
	if (!node || !named) return script;
	const id = newId();
	const { resultName: _gone, ...config } = node.config ?? {};
	const declare: GraphNode = {
		id,
		def: "local.declare",
		x: node.x + 300,
		y: node.y + 120,
		...(node.graph ? { graph: node.graph } : {}),
		literals: { name: { t: "string", v: named.name } },
		...(named.type && named.type !== "any" ? { config: { type: named.type } } : {}),
	};
	const links: Link[] = [];
	for (const link of script.links) {
		// What ran after the step now runs after the declaration.
		if (link.from.node === nodeId && link.from.pin === "then") {
			links.push({ ...link, from: { node: id, pin: "then" } });
		} else links.push(link);
	}
	links.push(
		{ id: newId(), from: { node: nodeId, pin: "then" }, to: { node: id, pin: "in" } },
		{ id: newId(), from: { node: nodeId, pin: "result" }, to: { node: id, pin: "value" } },
	);
	return {
		...script,
		links,
		nodes: [
			...script.nodes.map((n) => {
				if (n.id === nodeId) return { ...n, config };
				if (n.def === "local.get" && configText(n, "local") === nodeId) {
					return { ...n, config: { ...n.config, local: id, name: named.name } };
				}
				return n;
			}),
			declare,
		],
	};
}
