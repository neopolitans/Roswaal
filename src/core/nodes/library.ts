/**
 * The templated standard library.
 *
 * Every node here compiles through the same declarative `expr` / `call` /
 * `statement` templates available to custom node packs -- there is nothing a
 * built-in can do that a `.nodedef.json` cannot. That is deliberate: it keeps
 * the template language honest.
 */

import type { NodeDef, PinDef } from "../schema.js";

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

	// -- Variables ---------------------------------------------------------
	{
		id: "var.declare",
		title: "Declare Variable",
		category: "Variables",
		summary: "Binds a local. Wire the Variable output anywhere the value is needed.",
		inputs: [exec("in"), d("value", "Value", "any", { t: "nil" })],
		outputs: [exec("then"), d("ref", "Variable", "any")],
		compilesTo: { kind: "call", template: "$in.value", result: "ref" },
	},
	stmt("var.set", "Set Variable", "Variables", "$in.variable = $in.value", [
		d("variable", "Variable", "any", undefined),
		d("value", "Value", "any", { t: "nil" }),
	], { summary: "Assigns to a variable declared upstream." }),

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
	call("roblox.getService", "Get Service", "Roblox", "game:GetService($in.service)",
		[str("service", "Service", "Players")], "Service", "Instance", { targets: ["roblox"] }),
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

	// -- Modules -----------------------------------------------------------
	call("module.require", "Require", "Modules", "require($in.module)",
		[d("module", "Module", "any")], "Exports", "any"),
	{
		id: "call.method",
		title: "Call Method",
		category: "Modules",
		summary: "Calls a method on a value, with a single argument.",
		inputs: [exec("in"), d("object", "Object", "any"), str("method", "Method", "Method"), d("arg", "Argument", "any", { t: "nil" })],
		outputs: [exec("then"), d("result", "Result", "any")],
		compilesTo: { kind: "call", template: "$in.object:$in.method!ident($in.arg)", result: "result" },
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
