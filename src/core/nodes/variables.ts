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

import type { GraphNode, Literal, NodeConfig, NodeDef, PinDef } from "../schema.js";

/** Config shape for Get Local. */
export interface LocalRef {
	/** Node id of the Declare Local this reads. */
	local?: string;
	/** Cached for the capsule's label and its pin's type, as a variable's are. */
	name?: string;
	type?: string;
}

/**
 * Whether a Declare Local binds with `const` rather than `local`.
 *
 * Luau's `const` is the same binding with one guarantee added: the name cannot
 * be reassigned after it is initialised. It is the binding that is fixed and
 * not the value — `const t = {}` still lets you write to `t.count`, and
 * `table.freeze` is the tool for the other half.
 *
 * Off by default, and it stays a choice per node rather than a project setting:
 * a local you never reassign is not automatically one you want the language to
 * hold you to, and saying so is the point of saying it.
 *
 * `const` is newer than most of the runtimes people are on. A graph that uses it
 * needs a Luau that has it — see the note on the Variables and locals page.
 */
export function isConstLocal(config: NodeConfig | undefined): boolean {
	return (config as { const?: unknown } | undefined)?.const === true;
}

/**
 * What a Declare Local calls its local: the name typed into it, else its
 * label, else the emitter's own fallback. The same order the emitter uses.
 */
export function localNameOf(node: Pick<GraphNode, "literals" | "label">): string {
	return typedLocalName(node) || node.label?.trim() || "local";
}

/**
 * Just the name typed into the Name pin, or nothing.
 *
 * Separate from `localNameOf` because the header wants only this half: a node
 * nobody has named should read "Declare Local", not "Declare Local (local)"
 * announcing the fallback as though it were a choice.
 */
export function typedLocalName(node: Pick<GraphNode, "literals">): string {
	const typed = node.literals?.name;
	return typed && (typed.t === "string" || typed.t === "raw") ? typed.v.trim() : "";
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

/**
 * The starting literal for a pin of this type, or nothing when the type has
 * none to offer.
 *
 * Nothing is a real answer here rather than a gap. A pin with no wire and no
 * default is reported by the compiler as a value it needs, which is the right
 * outcome for one Roswaal cannot invent — an Instance, a function, an untyped
 * `any`. Handing those a `nil` instead would trade a clear error for a silent
 * `nil` in the generated file.
 *
 * Derived pins use it so that a Return or a Module Exports pin can be typed
 * into rather than only wired: without a default there is no literal to edit,
 * and the only way to give the node a value was to wire a node in for it.
 */
export function pinDefaultFor(pinType: string | undefined): Literal | undefined {
	switch (pinType) {
		case "boolean": return { t: "boolean", v: false };
		case "number": return { t: "number", v: 0 };
		case "string": return { t: "string", v: "" };
		case "table": return { t: "raw", v: "{}" };
		default: return undefined;
	}
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

/**
 * Config shape for Get Parameter.
 *
 * Keyed by the parameter's **name**, not its position: dragging a parameter up
 * the list in the Inspector would otherwise silently repoint every node reading
 * it, and the graph would go on compiling while meaning something else. The
 * emitter's key is still `p{i}`, so the index is resolved when it is needed.
 */
export interface ParamRef {
	/** Node id of the function or handler whose parameter this reads. */
	function?: string;
	/** The parameter's name, which is its identity. */
	param?: string;
	/** Cached for the capsule's pin colour, as a local's type is. */
	type?: string;
}

const exec = (id: string, name = ""): PinDef => ({ id, name, kind: "exec" });
const data = (id: string, name: string, type: string): PinDef => ({
	id, name, kind: "data", type,
});

export const VARIABLE_NODES: NodeDef[] = [
	/**
	 * A module this script declares, as a capsule with one output.
	 *
	 * The same shape Get Variable has, for the same reason: the name *is* the
	 * node, and a header saying "Get Module" above it would be saying the
	 * obvious twice. Four uses of `@lune/fs` are four of these and one require,
	 * because the declaration is on the script rather than on any of them.
	 *
	 * Filed under Variables because that is where it is declared -- one panel
	 * answers "what does this script have to hand", and the answer is these
	 * variables and these modules.
	 */
	{
		id: "module.get",
		title: "Get Module",
		category: "Variables",
		summary:
			"A module this script requires. Pure: it reads the local the require was bound to, so " +
			"using one module in four places still writes one require.",
		pure: true,
		inputs: [],
		outputs: [data("exports", "", "any")],
		compilesTo: { kind: "builtin", handler: "module.get" },
		display: "compact",
		defaultLabel: (config) => String((config as { name?: string }).name ?? ""),
	},
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
	{
		/**
		 * A parameter, read where it is used rather than wired from the
		 * declaration.
		 *
		 * The parameter pins on a Function node work and are not going away, but
		 * they mean a wire from the declaration to every node that reads one --
		 * and in a function of any size those wires cross the whole body. This
		 * is the same trade Get Local makes against wiring a Declare Local's
		 * output everywhere.
		 */
		id: "function.getParam",
		title: "Get Parameter",
		category: "Flow",
		summary:
			"A parameter of the function or handler this node sits inside, as a value. Pure, and read by name rather than by a wire back to the declaration.",
		pure: true,
		inputs: [],
		outputs: [data("value", "", "any")],
		compilesTo: { kind: "builtin", handler: "function.getParam" },
		display: "compact",
		derivePins(config: NodeConfig) {
			const ref = config as ParamRef;
			return { inputs: [], outputs: [data("value", "", pinTypeOf(ref.type))] };
		},
		defaultLabel: (config) => (config as ParamRef).param,
	},
];
