/**
 * Flow-control node definitions.
 *
 * Every node here compiles via `builtin`, because each one either starts a
 * flow, ends one, or opens a block — none of which a declarative template can
 * express. Custom node packs deliberately cannot reach this category.
 */

import type { NodeConfig, NodeDef, PinDef } from "../schema.js";

/** Config shape for function entry/return and connect bodies. */
export interface Signature {
	name?: string;
	params?: { name: string; type?: string }[];
	returns?: { name: string; type?: string }[];
	exported?: boolean;
}

const exec = (id: string, name: string): PinDef => ({ id, name, kind: "exec" });
const data = (id: string, name: string, type: string, def?: PinDef["default"]): PinDef => ({
	id, name, kind: "data", type, default: def,
});

/** Renders a signature the way it will read in the generated Luau. */
export function signatureText(sig: Signature): string {
	const params = (sig.params ?? [])
		.map((p, i) => `${p.name || `arg${i + 1}`}: ${p.type ?? "any"}`)
		.join(", ");
	const returns = sig.returns ?? [];
	const result =
		returns.length === 0
			? "()"
			: returns.length === 1
				? returns[0].type ?? "any"
				: `(${returns.map((r) => r.type ?? "any").join(", ")})`;
	return `(${params}) → ${result}`;
}

/**
 * Whether an execution output carries on in the *same* Luau block as the
 * node's input, rather than opening a nested one.
 *
 * This is the emitter's block structure stated as data. Anything that opens a
 * block — a loop body, a branch arm, a connect handler — holds locals that do
 * not survive its `end`, so nothing outside may assume they exist. Sequence is
 * the odd one out: all of its outputs run into the one block, which is why a
 * local under Then 0 really is in scope under Then 1.
 */
export function continuesEnclosingBlock(defId: string, pinId: string): boolean {
	switch (defId) {
		// Both arms open a block, and nothing follows the if-statement itself.
		case "flow.branch":
			return false;
		case "flow.forRange":
		case "flow.forEach":
		case "flow.forIndex":
		case "flow.while":
			return pinId === "completed";
		case "event.connect":
		// Declare Function is the same shape: "then" carries on in the block the
		// node sits in, and "body" opens the function's own.
		case "function.declareHere":
			return pinId === "then";
		// A function body is its own scope and has no enclosing block here.
		case "function.entry":
			return false;
		default:
			// A plain statement's "then", and every output of a Sequence.
			return true;
	}
}

/**
 * The nodes that declare a function.
 *
 * Two of them: one hoisted to the top, one where it sits. Everything that
 * treats a function as a function -- the signature editor, Get Function's list,
 * keeping Return nodes in step, finding which function a node is inside -- has
 * to mean both, and each of those was written against the string
 * `"function.entry"` before there was a second one.
 */
export const FUNCTION_NODES: ReadonlySet<string> = new Set([
	"function.entry",
	"function.declareHere",
]);

export const FLOW_NODES: NodeDef[] = [
	{
		id: "script.begin",
		title: "Script Start",
		category: "Flow",
		summary: "Top-level entry point. Statements run when the script loads.",
		role: "entry",
		inputs: [],
		outputs: [exec("then", "")],
		compilesTo: { kind: "builtin", handler: "script.begin" },
	},
	{
		id: "script.end",
		title: "Script End",
		category: "Flow",
		summary: "Ends the top-level flow. Optional; falling off the end is the same thing.",
		role: "terminal",
		inputs: [exec("in", "")],
		outputs: [],
		compilesTo: { kind: "builtin", handler: "script.end" },
	},
	{
		id: "function.entry",
		title: "Function",
		category: "Flow",
		summary: "Declares a function. Parameters become data outputs.",
		role: "entry",
		inputs: [],
		// "self" is the function as a value, so it can be exported from a module
		// or handed to Connect without a wrapper node.
		outputs: [exec("then", ""), data("self", "Function", "function")],
		compilesTo: { kind: "builtin", handler: "function.entry" },
		derivePins(config: NodeConfig) {
			const sig = config as Signature;
			return {
				inputs: [],
				outputs: [
					exec("then", ""),
					data("self", "Function", "function"),
					...(sig.params ?? []).map((p, i) =>
						data(`p${i}`, p.name || `arg${i + 1}`, p.type ?? "any"),
					),
				],
			};
		},
		// The name goes on the title line and the signature underneath it, so a
		// graph full of functions can be read without opening any of them.
		defaultLabel: (config) => (config as Signature).name,
		subtitle: (config) => signatureText(config as Signature),
	},
	{
		/**
		 * A function declared where the node sits, rather than hoisted.
		 *
		 * The other half of Function, the way Declare Type is the other half of
		 * Declare Type at Top. Hoisting is right when a function is a thing the
		 * script *has*; it is wrong when the function has to come after
		 * something. `Config.luau` ends on both cases at once:
		 *
		 * ```lua
		 * function TankConfig.read(tank: Model): Config
		 * ```
		 *
		 * — which has to be below `TankConfig`, and is not a local at all.
		 * Wiring a table into **On Table** attaches it there; leaving it unwired
		 * gives `local function name(...)` at that point in the flow.
		 */
		id: "function.declareHere",
		title: "Declare Function",
		category: "Flow",
		summary:
			"Declares a function where the node sits, instead of at the top. Wire a table into " +
			"On Table for `function Table.name(...)`.",
		role: "flow",
		inputs: [exec("in", ""), data("owner", "On Table", "table", undefined)],
		outputs: [
			exec("then", ""),
			exec("body", "Body"),
			data("self", "Function", "function"),
		],
		compilesTo: { kind: "builtin", handler: "function.declareHere" },
		derivePins(config: NodeConfig) {
			const sig = config as Signature;
			return {
				inputs: [exec("in", ""), data("owner", "On Table", "table", undefined)],
				outputs: [
					exec("then", ""),
					exec("body", "Body"),
					data("self", "Function", "function"),
					...(sig.params ?? []).map((p, i) =>
						data(`p${i}`, p.name || `arg${i + 1}`, p.type ?? "any"),
					),
				],
			};
		},
		/**
		 * The name goes *beside* the node's own, not instead of it.
		 *
		 * Function can give its name away to the header, because a node whose
		 * header reads `readNumber` is obviously a function. This one is one of
		 * two kinds of function declaration, and which kind it is -- hoisted, or
		 * here -- is the thing you are looking at it to find out.
		 */
		defaultLabel: (config) => {
			const name = (config as Signature).name;
			return name ? `Declare Function (${name})` : undefined;
		},
		subtitle: (config) => signatureText(config as Signature),
	},
	{
		id: "function.return",
		title: "Return",
		category: "Flow",
		summary: "Returns from the enclosing function.",
		role: "terminal",
		inputs: [exec("in", "")],
		outputs: [],
		compilesTo: { kind: "builtin", handler: "function.return" },
		derivePins(config: NodeConfig) {
			const sig = config as Signature;
			return {
				inputs: [
					exec("in", ""),
					...(sig.returns ?? []).map((r, i) =>
						data(`r${i}`, r.name || `value${i + 1}`, r.type ?? "any"),
					),
				],
				outputs: [],
			};
		},
	},
	{
		id: "type.declareTop",
		title: "Declare Type at Top",
		category: "Flow",
		summary:
			"Declares a Luau type above everything else in the generated file. Export it and other " +
			"modules can use it with `require`. The definition is written as Luau, the way Custom " +
			"Code is, because a type is not built from values and there are no nodes to build one " +
			"from — `{ speed: number }`, or `\"a\" | \"b\"`. For a type that has to come *after* " +
			"something, use Declare Type.",
		role: "terminal",
		inputs: [],
		outputs: [],
		compilesTo: { kind: "builtin", handler: "type.declareTop" },
		subtitle: (config) => (config.name as string) || undefined,
	},
	{
		id: "type.declareHere",
		title: "Declare Type",
		category: "Flow",
		summary:
			"Names the type of a value, where the node sits: `export type Tuning = typeof(Tuning)`. " +
			"In the flow rather than hoisted, because that is the whole point — a type built from " +
			"`typeof` has to come after the thing it is the type of, and Luau reads a file in order. " +
			"Wire the value in and the identifier is filled in for you, so renaming it later cannot " +
			"leave the type pointing at a name that is gone.",
		inputs: [exec("in", ""), data("value", "Value", "any")],
		outputs: [exec("then", "")],
		compilesTo: { kind: "builtin", handler: "type.declareHere" },
		subtitle: (config) => (config.name as string) || undefined,
	},
	{
		id: "module.exports",
		title: "Module Exports",
		category: "Flow",
		summary:
			"Terminal node for ModuleScripts. Each input pin becomes a key on the returned table; a single unnamed input returns that value directly.",
		role: "terminal",
		inputs: [data("e0", "value", "any")],
		outputs: [],
		compilesTo: { kind: "builtin", handler: "module.exports" },
		derivePins(config: NodeConfig) {
			const exports = (config.exports as { name: string; type?: string }[]) ?? [
				{ name: "value" },
			];
			return {
				inputs: exports.map((e, i) => data(`e${i}`, e.name || `export${i + 1}`, e.type ?? "any")),
				outputs: [],
			};
		},
	},
	{
		id: "flow.branch",
		title: "Branch",
		category: "Flow",
		role: "flow",
		summary:
			"if / else. Any value can be the condition — only `nil` and `false` take the " +
			"False branch, so an `Instance?` can be tested directly.",
		inputs: [exec("in", ""), data("condition", "Condition", "any", { t: "boolean", v: true })],
		outputs: [exec("true", "True"), exec("false", "False")],
		compilesTo: { kind: "builtin", handler: "flow.branch" },
	},
	{
		id: "flow.sequence",
		title: "Sequence",
		category: "Flow",
		role: "flow",
		summary:
			'One thing after another: each output runs to completion before the next starts. Add or remove outputs with the + and - in the header. Unreal calls this Sequence.',
		inputs: [exec("in", "")],
		outputs: [exec("s0", "Then 0"), exec("s1", "Then 1")],
		compilesTo: { kind: "builtin", handler: "flow.sequence" },
		derivePins(config: NodeConfig) {
			const count = Math.max(2, Number(config.count ?? 2));
			return {
				inputs: [exec("in", "")],
				outputs: Array.from({ length: count }, (_, i) => exec(`s${i}`, `Then ${i}`)),
			};
		},
	},
	{
		id: "flow.forRange",
		title: "For Loop",
		category: "Flow",
		role: "flow",
		summary: "Numeric for loop.",
		inputs: [
			exec("in", ""),
			data("first", "First", "number", { t: "number", v: 1 }),
			data("last", "Last", "number", { t: "number", v: 10 }),
			data("step", "Step", "number", { t: "number", v: 1 }),
		],
		outputs: [exec("body", "Body"), exec("completed", "Completed"), data("index", "Index", "number")],
		compilesTo: { kind: "builtin", handler: "flow.forRange" },
	},
	{
		id: "flow.forEach",
		title: "For Each",
		category: "Flow",
		role: "flow",
		summary: "Generic for over a table (pairs).",
		inputs: [exec("in", ""), data("table", "Table", "table")],
		outputs: [
			exec("body", "Body"),
			exec("completed", "Completed"),
			data("key", "Key", "any"),
			data("value", "Value", "any"),
		],
		compilesTo: { kind: "builtin", handler: "flow.forEach" },
	},
	{
		id: "flow.forIndex",
		title: "For Each (Array)",
		category: "Flow",
		role: "flow",
		summary: "Generic for over an array (ipairs).",
		inputs: [exec("in", ""), data("table", "Array", "table")],
		outputs: [
			exec("body", "Body"),
			exec("completed", "Completed"),
			data("index", "Index", "number"),
			data("value", "Value", "any"),
		],
		compilesTo: { kind: "builtin", handler: "flow.forIndex" },
	},
	{
		id: "flow.while",
		title: "While Loop",
		category: "Flow",
		role: "flow",
		summary:
			"Repeats the body while the condition holds. Any value can be the condition; only " +
			"`nil` and `false` stop it.",
		inputs: [exec("in", ""), data("condition", "Condition", "any", { t: "boolean", v: true })],
		outputs: [exec("body", "Body"), exec("completed", "Completed")],
		compilesTo: { kind: "builtin", handler: "flow.while" },
	},
	{
		id: "flow.break",
		title: "Break",
		category: "Flow",
		role: "terminal",
		summary: "Exits the innermost loop. Only valid inside a loop body.",
		inputs: [exec("in", "")],
		outputs: [],
		compilesTo: { kind: "builtin", handler: "flow.break" },
	},
	{
		id: "flow.continue",
		title: "Continue",
		category: "Flow",
		role: "terminal",
		summary: "Skips to the next iteration. Only valid inside a loop body.",
		inputs: [exec("in", "")],
		outputs: [],
		compilesTo: { kind: "builtin", handler: "flow.continue" },
	},
	{
		// A knot in a wire. Carries no meaning at all — it exists so a long wire
		// can be routed around a node instead of through it, and it compiles to
		// nothing whatsoever.
		id: "flow.reroute",
		title: "Reroute",
		category: "Flow",
		summary:
			"A bend in a data wire. Purely visual: it passes its input straight through and emits no code. Double-click a wire to add one.",
		pure: true,
		display: "reroute",
		inputs: [data("in", "", "any")],
		outputs: [data("out", "", "any")],
		compilesTo: { kind: "builtin", handler: "flow.reroute" },
		derivePins(config: NodeConfig) {
			const type = typeof config.type === "string" ? config.type : "any";
			return { inputs: [data("in", "", type)], outputs: [data("out", "", type)] };
		},
	},
	{
		id: "flow.rerouteExec",
		title: "Reroute (Execution)",
		category: "Flow",
		summary:
			"A bend in an execution wire. Purely visual: it emits no code. Double-click a wire to add one.",
		role: "flow",
		display: "reroute",
		inputs: [exec("in", "")],
		outputs: [exec("then", "")],
		compilesTo: { kind: "builtin", handler: "flow.rerouteExec" },
	},
	{
		id: "event.connect",
		title: "Connect Event",
		category: "Events",
		role: "flow",
		summary: "Connects a handler to a signal. The Body pins run inside the handler.",
		targets: ["roblox"],
		inputs: [exec("in", ""), data("signal", "Signal", "RBXScriptSignal")],
		outputs: [
			exec("then", ""),
			exec("body", "Body"),
			data("connection", "Connection", "RBXScriptConnection"),
		],
		compilesTo: { kind: "builtin", handler: "event.connect" },
		derivePins(config: NodeConfig) {
			const sig = config as Signature;
			return {
				inputs: [exec("in", ""), data("signal", "Signal", "RBXScriptSignal")],
				outputs: [
					exec("then", ""),
					exec("body", "Body"),
					data("connection", "Connection", "RBXScriptConnection"),
					...(sig.params ?? []).map((p, i) => data(`p${i}`, p.name || `arg${i + 1}`, p.type ?? "any")),
				],
			};
		},
	},
];
