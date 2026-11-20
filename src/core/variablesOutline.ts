/**
 * What the Variables panel lists, in the order the file declares it.
 *
 * Luau reads a file top to bottom, and Roswaal writes it in that order:
 * services, then requires, then the script's own table, types, variables
 * and functions. The panel reads the same way, so this works out each part
 * from the graph, with how often each is used. Pure, so the panel and the
 * tests ask the same question.
 */

import { parseInstancePath } from "./modules.js";
import { resolvePins } from "./nodeBox.js";
import { typeDeclarationOf } from "./nodes/flow.js";
import type { Registry } from "./nodes/index.js";
import { isService } from "./roblox.js";
import type { GraphNode, NodeConfig, NodeScript, ScriptModule } from "./schema.js";
import { serviceOf } from "./serviceCalls.js";

/** Nodes that name a service: Get Service by its pin, the Service Function nodes by config. */
const SERVICE_FUNCTION_NODES = new Set(["roblox.serviceValue", "roblox.serviceCall"]);

/** The service a node reaches, if it reaches one. */
export function serviceOfNode(node: GraphNode): string | undefined {
	if (node.def === "roblox.getService") {
		const literal = node.literals?.service;
		return literal?.t === "string" ? literal.v.trim() || undefined : "Players";
	}
	if (SERVICE_FUNCTION_NODES.has(node.def)) return serviceOf(node.config) || undefined;
	return undefined;
}

/** One service row: declared up front, or only fetched where it is used; with the modules required through it. */
export interface ServiceGroup {
	name: string;
	declared: boolean;
	/** Nodes that read it: Get Service and the Service Function nodes. */
	uses: number;
	modules: ScriptModule[];
}

export interface ServicesAndModules {
	/** Declared services in their order, then the ones only used, then the ones only a require reaches. */
	services: ServiceGroup[];
	/** Modules required through `script`: `script.Parent.Config`. */
	throughScript: ScriptModule[];
	/** Every other module: by string, by alias, by `game`. */
	others: ScriptModule[];
}

/** The service a module is required through, `"script"`, or nothing. */
function moduleRoot(module: ScriptModule): string | undefined {
	const parsed = parseInstancePath(module.specifier);
	if (!parsed || !("path" in parsed)) return undefined;
	const root = parsed.path.root;
	if (root === "workspace") return "Workspace";
	return root === "script" || isService(root) ? root : undefined;
}

export function servicesAndModules(script: NodeScript): ServicesAndModules {
	const uses = new Map<string, number>();
	const usedOrder: string[] = [];
	for (const node of script.nodes) {
		const name = serviceOfNode(node);
		if (!name) continue;
		if (!uses.has(name)) usedOrder.push(name);
		uses.set(name, (uses.get(name) ?? 0) + 1);
	}
	const declared = script.services ?? [];
	const groups = new Map<string, ServiceGroup>();
	const add = (name: string, isDeclared: boolean) => {
		if (!groups.has(name))
			groups.set(name, { name, declared: isDeclared, uses: uses.get(name) ?? 0, modules: [] });
		return groups.get(name)!;
	};
	for (const name of declared) add(name, true);
	for (const name of usedOrder) add(name, false);
	const throughScript: ScriptModule[] = [];
	const others: ScriptModule[] = [];
	for (const module of script.modules ?? []) {
		const root = moduleRoot(module);
		if (root === "script") throughScript.push(module);
		else if (root) add(root, false).modules.push(module);
		else others.push(module);
	}
	return { services: [...groups.values()], throughScript, others };
}

/** The variable a ModuleScript returns as its own table: the one Module Exports is wired from. */
export function moduleTableVariable(script: NodeScript): string | undefined {
	const exports = script.nodes.filter((n) => n.def === "module.exports");
	for (const node of exports) {
		for (const link of script.links) {
			if (link.to.node !== node.id) continue;
			const from = script.nodes.find((n) => n.id === link.from.node);
			const variable = from?.def === "variable.get" ? from.config?.variable : undefined;
			if (typeof variable === "string") return variable;
		}
	}
	return undefined;
}

/**
 * The nodes holding Luau as written (Code Blocks, Expressions) that read
 * `name` as a whole word: what an
 * imported older file's code uses a service, a module or a variable by.
 */
export function codeMentions(script: NodeScript, name: string): string[] {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return [];
	const word = new RegExp(`(^|[^A-Za-z0-9_.:])${name}(?![A-Za-z0-9_])`);
	return script.nodes
		.filter((node) => {
			// Any node holding Luau as written: a Code Block, an Expression.
			const code = node.literals?.code;
			return code?.t === "raw" && word.test(code.v);
		})
		.map((node) => node.id);
}

/** The keys a node refers to something by: a variable, a module, a local, a function. */
const REFERENCE_KEYS = ["variable", "module", "local", "function"] as const;

/** How many nodes refer to each thing by id: variables, modules, locals and functions alike. */
export function useCounts(script: NodeScript): Map<string, number> {
	const out = new Map<string, number>();
	for (const node of script.nodes) {
		for (const key of REFERENCE_KEYS) {
			const id = node.config?.[key];
			if (typeof id === "string" && id !== node.id) out.set(id, (out.get(id) ?? 0) + 1);
		}
	}
	return out;
}

/** The nodes that refer to `id`, or that reach the service `id`: what Find uses selects. */
export function usesOf(script: NodeScript, id: string, service = false): string[] {
	return script.nodes
		.filter((node) =>
			service
				? serviceOfNode(node) === id
				: REFERENCE_KEYS.some((key) => node.config?.[key] === id && node.id !== id),
		)
		.map((node) => node.id);
}

/**
 * A Declare Local's type: the one it declares, or else what its value is --
 * the type of what is wired in, or of what is typed. `EXIT` holding
 * "TankExit" is a string, not any.
 */
export function localTypeOf(script: NodeScript, registry: Registry, node: GraphNode): string {
	const declared = (typeof node.config?.type === "string" ? node.config.type : "").trim();
	if (declared && declared !== "any") return declared;
	const link = script.links.find((l) => l.to.node === node.id && l.to.pin === "value");
	if (link) {
		const from = script.nodes.find((n) => n.id === link.from.node);
		const def = from ? registry.get(from.def) : undefined;
		if (from && def) {
			const pin = resolvePins(def, from.config, from.literals).outputs.find(
				(p) => p.id === link.from.pin,
			);
			if (pin?.type && pin.type !== "any") return pin.type;
		}
		return "any";
	}
	const value = node.literals?.value;
	if (value?.t === "string") return "string";
	if (value?.t === "number") return "number";
	if (value?.t === "boolean") return "boolean";
	return "any";
}

/** A function's signature as its row shows it: `(Model) → Instance`. */
/**
 * What a declaration in the flow is, in a few words, for the right of its
 * row: a function's signature, a local's type, a type's shape. A Code Block
 * says no more than its kind, since the graph does not know its parts.
 */
export function declarationDetail(
	script: NodeScript,
	registry: Registry,
	nodeId: string,
	kind: "type" | "local" | "function" | "require",
): string {
	if (kind === "require") return "require";
	const node = script.nodes.find((n) => n.id === nodeId);
	if (!node) return kind;
	if (node.def === "function.declareHere") return functionSignature(node.config);
	if (node.def === "type.declareHere" || node.def === "type.declareTop") {
		const t = typeDeclarationOf(node.def, node.config);
		if (t.shape === "fields") return `{ ${t.fields.map((f) => f.name).join(", ")} }`;
		return t.shape === "written" ? t.definition || "type" : "typeof";
	}
	if (node.def === "local.declare") return localTypeOf(script, registry, node);
	return kind;
}

export function functionSignature(config: NodeConfig | undefined): string {
	const list = (value: unknown, key: "type") =>
		Array.isArray(value)
			? value.map((entry) =>
					typeof entry === "object" &&
					entry &&
					typeof (entry as Record<string, unknown>)[key] === "string"
						? (entry as Record<string, string>)[key] || "any"
						: "any",
				)
			: [];
	const params = list(config?.params, "type");
	const returns = list(config?.returns, "type");
	const out =
		returns.length === 0 ? "()" : returns.length === 1 ? returns[0] : `(${returns.join(", ")})`;
	return `(${params.join(", ")}) → ${out}`;
}
