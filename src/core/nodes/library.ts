/**
 * The templated standard library.
 *
 * Every node here compiles through the same declarative `expr` / `call` /
 * `statement` templates available to custom node packs -- there is nothing a
 * built-in can do that a `.nodedef.json` cannot. That is deliberate: it keeps
 * the template language honest.
 */

import type { NodeDef, PinDef } from "../schema.js";
import { PATH_ROOTS, ROBLOX_SERVICES } from "../roblox.js";

const exec = (id: string, name = ""): PinDef => ({ id, name, kind: "exec" });
const d = (id: string, name: string, type: string, def?: PinDef["default"]): PinDef => ({
	id, name, kind: "data", type, default: def,
});
const num = (id: string, name: string, v = 0) => d(id, name, "number", { t: "number", v });
const str = (id: string, name: string, v = "") => d(id, name, "string", { t: "string", v });
const bool = (id: string, name: string, v = false) => d(id, name, "boolean", { t: "boolean", v });

/** Shorthand for a pure node with a single `result` output. */
function pure(
	id: string, title: string, category: string, template: string,
	inputs: PinDef[], resultType: string, summary?: string,
): NodeDef {
	return {
		id, title, category, summary, pure: true, inputs,
		outputs: [d("result", "", resultType)],
		compilesTo: { kind: "expr", outputs: { result: template } },
	};
}

/** Shorthand for an impure node that produces one value. */
function call(
	id: string, title: string, category: string, template: string,
	inputs: PinDef[], resultName: string, resultType: string,
	opts: { latent?: boolean; targets?: NodeDef["targets"]; summary?: string } = {},
): NodeDef {
	return {
		id, title, category, summary: opts.summary, latent: opts.latent, targets: opts.targets,
		inputs: [exec("in"), ...inputs],
		outputs: [exec("then"), d("result", resultName, resultType)],
		compilesTo: { kind: "call", template, result: "result" },
	};
}

/** Shorthand for an impure node that produces nothing. */
function stmt(
	id: string, title: string, category: string, template: string,
	inputs: PinDef[],
	opts: { targets?: NodeDef["targets"]; summary?: string } = {},
): NodeDef {
	return {
		id, title, category, summary: opts.summary, targets: opts.targets,
		inputs: [exec("in"), ...inputs],
		outputs: [exec("then")],
		compilesTo: { kind: "statement", template },
	};
}

/**
 * Argument pins for the call nodes. One by default, because most calls take
 * one, and the count is stored per node rather than baked into the definition.
 */
function argPins(config: Record<string, unknown>): PinDef[] {
	const count = Math.max(0, Math.min(8, Number(config.args ?? 1)));
	return Array.from({ length: count }, (_, i) =>
		d(`a${i}`, count === 1 ? "Argument" : `Arg ${i + 1}`, "any", { t: "nil" }),
	);
}

export const LIBRARY_NODES: NodeDef[] = [
	// -- Values ------------------------------------------------------------
	pure("value.number", "Number", "Values", "$in.value", [num("value", "")], "number"),
	pure("value.string", "String", "Values", "$in.value", [str("value", "")], "string"),
	pure("value.boolean", "Boolean", "Values", "$in.value", [bool("value", "")], "boolean"),
	pure("value.nil", "Nil", "Values", "nil", [], "any"),
	{
		id: "value.expression",
		title: "Luau Expression",
		category: "Values",
		summary: "Escape hatch. The text is inserted verbatim as an expression.",
		pure: true,
		inputs: [d("code", "Code", "string", { t: "raw", v: "0" })],
		outputs: [d("result", "", "any")],
		compilesTo: { kind: "expr", outputs: { result: "$in.code!raw" } },
	},

	// -- Locals ------------------------------------------------------------
	//
	// Distinct from script variables: a local exists only inside the block that
	// declared it, and is reached by wiring its output rather than by name.
	{
		id: "local.declare",
		title: "Declare Local",
		category: "Variables",
		summary:
			"Binds a local in the current block. Wire the Local output wherever the value is needed. For a value the whole script can reach, add a variable instead.",
		inputs: [exec("in"), d("value", "Value", "any", { t: "nil" })],
		outputs: [exec("then"), d("ref", "Local", "any")],
		compilesTo: { kind: "call", template: "$in.value", result: "ref" },
	},
	stmt("local.set", "Set Local", "Variables", "$in.variable = $in.value", [
		d("variable", "Local", "any", undefined),
		d("value", "Value", "any", { t: "nil" }),
	], { summary: "Reassigns a local declared upstream." }),

	// -- Math --------------------------------------------------------------
	pure("math.add", "Add", "Math", "$in.a + $in.b", [num("a", "A"), num("b", "B")], "number"),
	pure("math.sub", "Subtract", "Math", "$in.a - $in.b", [num("a", "A"), num("b", "B")], "number"),
	pure("math.mul", "Multiply", "Math", "$in.a * $in.b", [num("a", "A", 1), num("b", "B", 1)], "number"),
	pure("math.div", "Divide", "Math", "$in.a / $in.b", [num("a", "A"), num("b", "B", 1)], "number"),
	pure("math.mod", "Modulo", "Math", "$in.a % $in.b", [num("a", "A"), num("b", "B", 1)], "number"),
	pure("math.pow", "Power", "Math", "$in.a ^ $in.b", [num("a", "A"), num("b", "B", 2)], "number"),
	pure("math.neg", "Negate", "Math", "-$in.a", [num("a", "A")], "number"),
	pure("math.abs", "Absolute", "Math", "math.abs($in.a)", [num("a", "A")], "number"),
	pure("math.floor", "Floor", "Math", "math.floor($in.a)", [num("a", "A")], "number"),
	pure("math.ceil", "Ceiling", "Math", "math.ceil($in.a)", [num("a", "A")], "number"),
	pure("math.round", "Round", "Math", "math.round($in.a)", [num("a", "A")], "number"),
	pure("math.min", "Min", "Math", "math.min($in.a, $in.b)", [num("a", "A"), num("b", "B")], "number"),
	pure("math.max", "Max", "Math", "math.max($in.a, $in.b)", [num("a", "A"), num("b", "B")], "number"),
	pure("math.clamp", "Clamp", "Math", "math.clamp($in.value, $in.min, $in.max)",
		[num("value", "Value"), num("min", "Min"), num("max", "Max", 1)], "number"),
	pure("math.random", "Random", "Math", "math.random($in.min, $in.max)",
		[num("min", "Min", 1), num("max", "Max", 100)], "number",
		"Not referentially transparent, but safe to inline: it has no observable ordering."),

	// -- Comparison and logic ----------------------------------------------
	pure("compare.eq", "Equal", "Logic", "$in.a == $in.b", [d("a", "A", "any"), d("b", "B", "any")], "boolean"),
	pure("compare.neq", "Not Equal", "Logic", "$in.a ~= $in.b", [d("a", "A", "any"), d("b", "B", "any")], "boolean"),
	pure("compare.lt", "Less Than", "Logic", "$in.a < $in.b", [num("a", "A"), num("b", "B")], "boolean"),
	pure("compare.lte", "Less Or Equal", "Logic", "$in.a <= $in.b", [num("a", "A"), num("b", "B")], "boolean"),
	pure("compare.gt", "Greater Than", "Logic", "$in.a > $in.b", [num("a", "A"), num("b", "B")], "boolean"),
	pure("compare.gte", "Greater Or Equal", "Logic", "$in.a >= $in.b", [num("a", "A"), num("b", "B")], "boolean"),
	pure("logic.and", "And", "Logic", "$in.a and $in.b", [bool("a", "A"), bool("b", "B")], "boolean"),
	pure("logic.or", "Or", "Logic", "$in.a or $in.b", [bool("a", "A"), bool("b", "B")], "boolean"),
	pure("logic.not", "Not", "Logic", "not $in.a", [bool("a", "A")], "boolean"),

	// -- Strings -----------------------------------------------------------
	pure("string.concat", "Concatenate", "Strings", "$in.a .. $in.b", [str("a", "A"), str("b", "B")], "string"),
	pure("string.format", "Format", "Strings", "string.format($in.format, $in.a)",
		[str("format", "Format", "%s"), d("a", "Value", "any")], "string"),
	pure("string.len", "Length", "Strings", "#$in.value", [str("value", "Value")], "number"),
	pure("string.upper", "Upper Case", "Strings", "string.upper($in.value)", [str("value", "Value")], "string"),
	pure("string.lower", "Lower Case", "Strings", "string.lower($in.value)", [str("value", "Value")], "string"),
	pure("convert.tostring", "To String", "Strings", "tostring($in.value)", [d("value", "Value", "any")], "string"),
	pure("convert.tonumber", "To Number", "Strings", "tonumber($in.value)", [d("value", "Value", "any")], "number"),

	// -- Tables ------------------------------------------------------------
	{
		id: "table.new",
		title: "New Table",
		category: "Tables",
		summary: "Constructs an empty table.",
		inputs: [exec("in")],
		outputs: [exec("then"), d("result", "Table", "table")],
		compilesTo: { kind: "call", template: "{}", result: "result" },
	},
	pure("table.get", "Get Index", "Tables", "$in.table[$in.key]",
		[d("table", "Table", "table"), d("key", "Key", "any", { t: "number", v: 1 })], "any"),
	pure("table.length", "Table Length", "Tables", "#$in.table", [d("table", "Table", "table")], "number"),
	stmt("table.set", "Set Index", "Tables", "$in.table[$in.key] = $in.value", [
		d("table", "Table", "table"), d("key", "Key", "any", { t: "number", v: 1 }), d("value", "Value", "any", { t: "nil" }),
	]),
	stmt("table.insert", "Insert", "Tables", "table.insert($in.table, $in.value)", [
		d("table", "Table", "table"), d("value", "Value", "any", { t: "nil" }),
	]),
	stmt("table.remove", "Remove", "Tables", "table.remove($in.table, $in.index)", [
		d("table", "Table", "table"), num("index", "Index", 1),
	]),

	// -- Roblox ------------------------------------------------------------
	{
		// Pure, and hoisted. GetService is idempotent and cached by Roblox, so
		// calling it mid-flow buys nothing; every Roblox codebase pulls services
		// into locals at the top of the file, and the generated output should
		// read like one that was written by hand.
		id: "roblox.getService",
		title: "Get Service",
		category: "Roblox",
		summary:
			"A Roblox service, as a top-level local. Pure: it needs no execution wire, and asking for the same service twice reuses one local.",
		pure: true,
		targets: ["roblox"],
		inputs: [
			{
				...str("service", "Service", "Players"),
				options: [...ROBLOX_SERVICES],
				description: "Pick a service, or type one the list has not caught up with.",
			},
		],
		outputs: [d("service", "", "Instance")],
		compilesTo: { kind: "builtin", handler: "service.get" },
	},
	call("roblox.instanceNew", "New Instance", "Roblox", "Instance.new($in.className)",
		[str("className", "Class Name", "Part")], "Instance", "Instance", { targets: ["roblox"] }),
	call("roblox.findFirstChild", "Find First Child", "Roblox",
		"$in.parent:FindFirstChild($in.name)",
		[d("parent", "Parent", "Instance"), str("name", "Name")], "Child", "Instance", { targets: ["roblox"] }),
	call("roblox.waitForChild", "Wait For Child", "Roblox",
		"$in.parent:WaitForChild($in.name)",
		[d("parent", "Parent", "Instance"), str("name", "Name")], "Child", "Instance",
		{ latent: true, targets: ["roblox"], summary: "Yields until the child exists." }),
	pure("roblox.getProperty", "Get Property", "Roblox", "$in.instance.$in.property!ident",
		[d("instance", "Instance", "Instance"), str("property", "Property", "Name")], "any"),
	pure("roblox.getEvent", "Get Event", "Roblox", "$in.instance.$in.event!ident",
		[d("instance", "Instance", "Instance"), str("event", "Event", "Touched")], "RBXScriptSignal",
		"Reads a signal off an instance. Same access as Get Property, but typed as a signal so it wires straight into Connect Event."),
	stmt("roblox.setProperty", "Set Property", "Roblox", "$in.instance.$in.property!ident = $in.value",
		[d("instance", "Instance", "Instance"), str("property", "Property", "Name"), d("value", "Value", "any", { t: "nil" })],
		{ targets: ["roblox"] }),
	stmt("roblox.setParent", "Set Parent", "Roblox", "$in.instance.Parent = $in.parent",
		[d("instance", "Instance", "Instance"), d("parent", "Parent", "Instance")], { targets: ["roblox"] }),
	stmt("roblox.destroy", "Destroy", "Roblox", "$in.instance:Destroy()",
		[d("instance", "Instance", "Instance")], { targets: ["roblox"] }),
	pure("roblox.vector3", "Vector3", "Roblox", "Vector3.new($in.x, $in.y, $in.z)",
		[num("x", "X"), num("y", "Y"), num("z", "Z")], "Vector3"),
	pure("roblox.color3", "Color3", "Roblox", "Color3.fromRGB($in.r, $in.g, $in.b)",
		[num("r", "R", 255), num("g", "G", 255), num("b", "B", 255)], "Color3"),

	// -- Instances and modules ---------------------------------------------
	{
		// Reaching a child by path rather than by a chain of FindFirstChild
		// nodes. Pure, because indexing an instance is just an expression, and
		// wiring three nodes to say `ReplicatedStorage.Modules.Combat` was the
		// single most tedious thing about the earlier node set.
		id: "roblox.instancePath",
		title: "Instance",
		category: "Roblox",
		summary:
			"An instance reached by path, e.g. Modules.Combat under ReplicatedStorage. Errors at runtime if it is not there yet — use Wait For Child when it might not be.",
		pure: true,
		targets: ["roblox"],
		inputs: [
			{
				...str("root", "In", "ReplicatedStorage"),
				options: PATH_ROOTS,
				description: "Where the path starts: a service, or game / script / workspace.",
			},
			{
				...str("path", "Path", "Modules.Combat"),
				description: "Dotted path from the root. Names that are not identifiers are bracketed for you.",
			},
		],
		outputs: [d("instance", "", "Instance")],
		compilesTo: { kind: "builtin", handler: "instance.path" },
	},
	{
		// Hoisted for the same reason services are: require is idempotent and
		// cached by Roblox, so every Roblox codebase pulls modules into locals
		// at the top of the file.
		id: "module.requirePath",
		title: "Require Module",
		category: "Modules",
		summary:
			"Requires a module by path, as a top-level local. Pure: no execution wire, and requiring the same module twice reuses one local.",
		pure: true,
		targets: ["roblox"],
		inputs: [
			{
				...str("root", "In", "ReplicatedStorage"),
				options: PATH_ROOTS,
				description: "Where the path starts: a service, or game / script / workspace.",
			},
			{
				...str("path", "Path", "Modules.Combat"),
				description: "Dotted path to the ModuleScript.",
			},
			{
				...str("as", "As", ""),
				description: "Name for the generated local. Defaults to the last path segment.",
			},
		],
		outputs: [d("exports", "", "any")],
		compilesTo: { kind: "builtin", handler: "module.requirePath" },
	},
	call("module.require", "Require (Dynamic)", "Modules", "require($in.module)",
		[d("module", "Module", "any")], "Exports", "any",
		{ summary: "Requires a module reached by a wire, for cases a fixed path cannot express." }),
	pure("value.field", "Get Field", "Modules", "$in.object.$in.field!ident",
		[d("object", "Object", "any"), str("field", "Field", "name")], "any",
		"Reads a field off any value: a module's export, a table key, an instance property."),
	{
		// Argument count is per-instance rather than fixed, because a template
		// is a static string and one-argument calls were the sharpest edge in
		// the earlier node set.
		id: "call.function",
		title: "Call Function",
		category: "Modules",
		summary: "Calls a function value. Set the argument count in the inspector.",
		inputs: [exec("in"), d("fn", "Function", "function"), d("a0", "Argument", "any", { t: "nil" })],
		outputs: [exec("then"), d("result", "Result", "any")],
		compilesTo: { kind: "builtin", handler: "call.invoke" },
		derivePins: (config) => ({
			inputs: [
				exec("in"),
				d("fn", "Function", "function"),
				...argPins(config),
			],
			outputs: [exec("then"), d("result", "Result", "any")],
		}),
	},
	{
		id: "call.method",
		title: "Call Method",
		category: "Modules",
		summary: "Calls a method on a value, colon-style. Set the argument count in the inspector.",
		inputs: [
			exec("in"),
			d("object", "Object", "any"),
			str("method", "Method", "Method"),
			d("a0", "Argument", "any", { t: "nil" }),
		],
		outputs: [exec("then"), d("result", "Result", "any")],
		compilesTo: { kind: "builtin", handler: "call.invoke" },
		derivePins: (config) => ({
			inputs: [
				exec("in"),
				d("object", "Object", "any"),
				str("method", "Method", "Method"),
				...argPins(config),
			],
			outputs: [exec("then"), d("result", "Result", "any")],
		}),
	},

	// -- Time --------------------------------------------------------------
	call("task.wait", "Wait", "Time", "task.wait($in.seconds)",
		[num("seconds", "Seconds", 1)], "Elapsed", "number", { latent: true }),

	// -- Debug -------------------------------------------------------------
	stmt("debug.print", "Print", "Debug", "print($in.value)", [d("value", "Value", "any", { t: "string", v: "Hello" })]),
	stmt("debug.warn", "Warn", "Debug", "warn($in.value)", [d("value", "Value", "any", { t: "string", v: "Warning" })]),
	{
		id: "code.custom",
		title: "Custom Code",
		category: "Debug",
		summary:
			"Escape hatch. The text is emitted verbatim as statements, so existing Luau can be wrapped rather than rebuilt.",
		inputs: [exec("in"), d("code", "Code", "string", { t: "raw", v: "-- your Luau here" })],
		outputs: [exec("then")],
		compilesTo: { kind: "statement", template: "$in.code!raw" },
	},
];
