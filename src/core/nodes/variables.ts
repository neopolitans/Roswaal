/**
 * Variable and function reference nodes.
 *
 * These are getters and setters in the usual visual-scripting style: the
 * variable is declared once in the script's variable list, and Get/Set nodes
 * refer to it by id from anywhere in the graph. That is a different thing from
 * `local.declare`, which binds a value mid-flow and only exists inside the
 * block that declared it.
 *
 * Pin derivation cannot see the script, only the node's own config, so each
 * reference node caches the variable's name and type alongside its id. The
 * editor keeps that cache in step when a variable is renamed or retyped.
 */

import type { GraphNode, NodeConfig, NodeDef, PinDef } from "../schema.js";

/** Config shape for Get Local. */
export interface LocalRef {
	/** Node id of the Declare Local this reads. */
	local?: string;
	/** Cached for the capsule's label and its pin's type, as a variable's are. */
	name?: string;
	type?: string;
}

/**
 * What a Declare Local calls its local: the name typed into it, else its
 * label, else the emitter's own fallback. The same order the emitter uses.
 */
export function localNameOf(node: Pick<GraphNode, "literals" | "label">): string {
	const typed = node.literals?.name;
	const text = typed && (typed.t === "string" || typed.t === "raw") ? typed.v.trim() : "";
	return text || node.label?.trim() || "local";
}

/**
 * The pin type for a value declared with this Luau type.
 *
 * A pin type is a name the canvas can colour and compare, and a Luau type can
 * be anything at all. A plain name is itself, `Model?` is a `Model` pin, a
 * table type is a `table` pin, and anything else — a union, a function type —
 * is `any`, which fits everywhere and claims nothing.
 */
export function pinTypeOf(luauType: string | undefined): string {
	const t = (luauType ?? "").trim();
	if (t === "") return "any";
	const named = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\??$/.exec(t);
	if (named) return named[1];
	if (t.startsWith("{")) return "table";
	return "any";
}

/** Config shape shared by the variable Get and Set nodes. */
export interface VariableRef {
	/** Id of the entry in NodeScript.variables. */
	variable?: string;
	/** Cached for pin derivation and the node header. */
	name?: string;
	type?: string;
}

/** Config shape for Get Function. */
export interface FunctionRef {
	/** Node id of the function.entry this refers to. */
	function?: string;
	name?: string;
}

const exec = (id: string, name = ""): PinDef => ({ id, name, kind: "exec" });
const data = (id: string, name: string, type: string): PinDef => ({
	id, name, kind: "data", type,
});

export const VARIABLE_NODES: NodeDef[] = [
	{
		id: "variable.get",
		title: "Get Variable",
		category: "Variables",
		summary: "Reads a script variable. Pure, so it can be wired anywhere without an execution line.",
		pure: true,
		inputs: [],
		outputs: [data("value", "", "any")],
		compilesTo: { kind: "builtin", handler: "variable.get" },
		display: "compact",
		derivePins(config: NodeConfig) {
			const ref = config as VariableRef;
			return { inputs: [], outputs: [data("value", "", pinTypeOf(ref.type))] };
		},
		// A capsule has no second line to put a name on, and does not need one:
		// the variable's name *is* the node.
		defaultLabel: (config) => (config as VariableRef).name,
	},
	{
		id: "variable.set",
		title: "Set Variable",
		category: "Variables",
		summary: "Assigns a script variable. The output passes the value through, so a Set can sit mid-chain.",
		inputs: [exec("in"), data("value", "Value", "any")],
		outputs: [exec("then"), data("value", "", "any")],
		compilesTo: { kind: "builtin", handler: "variable.set" },
		derivePins(config: NodeConfig) {
			const ref = config as VariableRef;
			const type = pinTypeOf(ref.type);
			return {
				inputs: [exec("in"), data("value", "Value", type)],
				outputs: [exec("then"), data("value", "", type)],
			};
		},
		subtitle: (config) => (config as VariableRef).name,
	},
	{
		id: "variable.init",
		title: "Initialize Variable",
		category: "Variables",
		summary:
			"Gives a script variable its first value, and *is* its declaration — the variable is not declared separately above. Use it when the starting value has to be built from nodes rather than typed into the variables panel. Must sit in the main flow, before anything reads the variable.",
		inputs: [exec("in"), data("value", "Value", "any")],
		outputs: [exec("then"), data("value", "", "any")],
		compilesTo: { kind: "builtin", handler: "variable.init" },
		derivePins(config: NodeConfig) {
			const ref = config as VariableRef;
			const type = pinTypeOf(ref.type);
			return {
				inputs: [exec("in"), data("value", "Value", type)],
				outputs: [exec("then"), data("value", "", type)],
			};
		},
		subtitle: (config) => (config as VariableRef).name,
	},
	{
		/**
		 * A local, read by name rather than by a wire back to where it was made.
		 *
		 * Declare Local's output already reaches anywhere the local is in scope,
		 * and inside a function declared further down that is a wire across half
		 * the graph. This is the same read as a capsule you can drop beside the
		 * node that wants it. Whether the local is in scope is still the
		 * emitter's call, made where the capsule is read.
		 */
		id: "local.get",
		title: "Get Local",
		category: "Variables",
		summary:
			"Reads a Declare Local's value wherever it is in scope, without a wire back to it. Pure, like Get Variable.",
		pure: true,
		inputs: [],
		outputs: [data("value", "", "any")],
		compilesTo: { kind: "builtin", handler: "local.get" },
		display: "compact",
		derivePins(config: NodeConfig) {
			const ref = config as LocalRef;
			return { inputs: [], outputs: [data("value", "", ref.type ?? "any")] };
		},
		defaultLabel: (config) => (config as LocalRef).name,
	},
	{
		id: "function.get",
		title: "Get Function",
		category: "Flow",
		summary:
			"A reference to a function declared elsewhere in this graph, as a value. Pure, so it needs no execution wire.",
		pure: true,
		inputs: [],
		outputs: [data("fn", "", "function")],
		compilesTo: { kind: "builtin", handler: "function.get" },
		display: "compact",
		defaultLabel: (config) => (config as FunctionRef).name,
	},
];
