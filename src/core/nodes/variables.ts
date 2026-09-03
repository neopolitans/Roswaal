/**
 * Variable and function reference nodes.
 *
 * These are Blueprint-style getters and setters: the variable is declared once
 * in the script's variable list, and Get/Set nodes refer to it by id from
 * anywhere in the graph. That is a different thing from `local.declare`, which
 * binds a value mid-flow and only exists inside the block that declared it.
 *
 * Pin derivation cannot see the script, only the node's own config, so each
 * reference node caches the variable's name and type alongside its id. The
 * editor keeps that cache in step when a variable is renamed or retyped.
 */

import type { NodeConfig, NodeDef, PinDef } from "../schema.js";

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
		derivePins(config: NodeConfig) {
			const ref = config as VariableRef;
			return { inputs: [], outputs: [data("value", "", ref.type ?? "any")] };
		},
		subtitle: (config) => (config as VariableRef).name,
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
			const type = ref.type ?? "any";
			return {
				inputs: [exec("in"), data("value", "Value", type)],
				outputs: [exec("then"), data("value", "", type)],
			};
		},
		subtitle: (config) => (config as VariableRef).name,
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
		subtitle: (config) => (config as FunctionRef).name,
	},
];
