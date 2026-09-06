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
/**
 * A Vector3 or CFrame pin. Both default to a raw constant rather than nil, so
 * an unwired one compiles to something valid — and, since these are the types
 * that split, so each component has a sane starting value to fall back on.
 */
const vec = (id: string, name: string) => d(id, name, "Vector3", { t: "raw", v: "Vector3.zero" });
const cf = (id: string, name: string) => d(id, name, "CFrame", { t: "raw", v: "CFrame.identity" });

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
 * A pure node whose arity is chosen per instance: Add with three operands, a
 * Concatenate with five. Unreal spells this "Add pin +"; the idea is the same,
 * and it is the difference between one node and a chain of them.
 */
function variadic(
	id: string, title: string, category: string, template: string,
	type: string, value: PinDef["default"], resultType: string, summary?: string,
	limits: { min?: number; max?: number } = {},
): NodeDef {
	const min = limits.min ?? 2;
	const max = limits.max ?? 8;
	const pins = (count: number): PinDef[] =>
		Array.from({ length: count }, (_, i) => d(`a${i}`, LETTERS[i] ?? `A${i}`, type, value));

	return {
		id, title, category, summary,
		pure: true,
		variadic: { min, max, type, default: value },
		inputs: pins(min),
		outputs: [d("result", "", resultType)],
		compilesTo: { kind: "expr", outputs: { result: template } },
		derivePins: (config) => ({
			inputs: pins(Math.max(min, Math.min(max, Number(config.args ?? min)))),
			outputs: [d("result", "", resultType)],
		}),
	};
}

const LETTERS = "ABCDEFGH".split("");

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
		inputs: [{ ...d("code", "Code", "string", { t: "raw", v: "0" }), code: true }],
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
	variadic("math.add", "Add", "Math", "$args( + )", "number", { t: "number", v: 0 }, "number"),
	variadic("math.sub", "Subtract", "Math", "$args( - )", "number", { t: "number", v: 0 }, "number"),
	variadic("math.mul", "Multiply", "Math", "$args( * )", "number", { t: "number", v: 1 }, "number"),
	variadic("math.div", "Divide", "Math", "$args( / )", "number", { t: "number", v: 1 }, "number"),
	pure("math.mod", "Modulo", "Math", "$in.a % $in.b", [num("a", "A"), num("b", "B", 1)], "number"),
	pure("math.pow", "Power", "Math", "$in.a ^ $in.b", [num("a", "A"), num("b", "B", 2)], "number"),
	pure("math.neg", "Negate", "Math", "-$in.a", [num("a", "A")], "number"),
	pure("math.abs", "Absolute", "Math", "math.abs($in.a)", [num("a", "A")], "number"),
	pure("math.floor", "Floor", "Math", "math.floor($in.a)", [num("a", "A")], "number"),
	pure("math.ceil", "Ceiling", "Math", "math.ceil($in.a)", [num("a", "A")], "number"),
	pure("math.round", "Round", "Math", "math.round($in.a)", [num("a", "A")], "number"),
	variadic("math.min", "Min", "Math", "math.min($args(, ))", "number", { t: "number", v: 0 }, "number"),
	variadic("math.max", "Max", "Math", "math.max($args(, ))", "number", { t: "number", v: 0 }, "number"),
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
	variadic("logic.and", "And", "Logic", "$args( and )", "boolean", { t: "boolean", v: true }, "boolean"),
	variadic("logic.or", "Or", "Logic", "$args( or )", "boolean", { t: "boolean", v: false }, "boolean"),
	pure("logic.not", "Not", "Logic", "not $in.a", [bool("a", "A")], "boolean"),

	// -- Strings -----------------------------------------------------------
	variadic("string.concat", "Concatenate", "Strings", "$args( .. )", "string", { t: "string", v: "" }, "string"),
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

	// -- Vectors -----------------------------------------------------------
	//
	// Every one of these is pure, so they compose into an expression without an
	// execution wire threading through the arithmetic -- which is the difference
	// between a readable maths graph and a staircase.
	pure("vector3.zero", "Vector3 Zero", "Vectors", "Vector3.zero", [], "Vector3"),
	pure("vector3.one", "Vector3 One", "Vectors", "Vector3.one", [], "Vector3"),
	pure("vector3.axis", "Vector3 Axis", "Vectors", "Vector3.$in.axis!ident",
		[{ ...str("axis", "Axis", "yAxis"), options: ["xAxis", "yAxis", "zAxis"] }], "Vector3",
		"A unit vector along one axis."),
	pure("vector3.add", "Vector3 +", "Vectors", "$in.a + $in.b", [vec("a", "A"), vec("b", "B")], "Vector3"),
	pure("vector3.sub", "Vector3 −", "Vectors", "$in.a - $in.b", [vec("a", "A"), vec("b", "B")], "Vector3"),
	pure("vector3.scale", "Vector3 × Scalar", "Vectors", "$in.v * $in.scalar",
		[vec("v", "Vector"), num("scalar", "Scalar", 1)], "Vector3"),
	pure("vector3.dot", "Dot", "Vectors", "$in.a:Dot($in.b)", [vec("a", "A"), vec("b", "B")], "number"),
	pure("vector3.cross", "Cross", "Vectors", "$in.a:Cross($in.b)", [vec("a", "A"), vec("b", "B")], "Vector3"),
	pure("vector3.magnitude", "Magnitude", "Vectors", "$in.v.Magnitude", [vec("v", "Vector")], "number"),
	pure("vector3.unit", "Unit", "Vectors", "$in.v.Unit", [vec("v", "Vector")], "Vector3",
		"The vector scaled to length one. Undefined for a zero vector, as in Luau."),
	pure("vector3.lerp", "Vector3 Lerp", "Vectors", "$in.a:Lerp($in.b, $in.alpha)",
		[vec("a", "A"), vec("b", "B"), num("alpha", "Alpha", 0.5)], "Vector3"),
	pure("vector3.distance", "Distance", "Vectors", "($in.a - $in.b).Magnitude",
		[vec("a", "A"), vec("b", "B")], "number"),
	pure("vector2.new", "Vector2", "Vectors", "Vector2.new($in.x, $in.y)",
		[num("x", "X"), num("y", "Y")], "Vector2"),

	// -- CFrames -----------------------------------------------------------
	pure("cframe.identity", "CFrame Identity", "CFrames", "CFrame.identity", [], "CFrame"),
	pure("cframe.new", "CFrame", "CFrames", "CFrame.new($in.position)",
		[vec("position", "Position")], "CFrame", "A CFrame at a position, with no rotation."),
	pure("cframe.lookAt", "Look At", "CFrames", "CFrame.lookAt($in.from, $in.to, $in.up)",
		[vec("from", "From"), vec("to", "To"), { ...vec("up", "Up"), default: { t: "raw", v: "Vector3.yAxis" } }],
		"CFrame", "Positioned at From, facing To. The workhorse for aiming anything."),
	pure("cframe.angles", "CFrame Angles", "CFrames", "CFrame.Angles($in.rx, $in.ry, $in.rz)",
		[num("rx", "X (rad)"), num("ry", "Y (rad)"), num("rz", "Z (rad)")], "CFrame",
		"Rotation only, in radians. Pair with Rad to work in degrees."),
	pure("cframe.fromAxisAngle", "From Axis Angle", "CFrames",
		"CFrame.fromAxisAngle($in.axis, $in.angle)",
		[{ ...vec("axis", "Axis"), default: { t: "raw", v: "Vector3.yAxis" } }, num("angle", "Angle (rad)")],
		"CFrame"),
	pure("cframe.mul", "CFrame ×", "CFrames", "$in.a * $in.b", [cf("a", "A"), cf("b", "B")], "CFrame",
		"Composes two CFrames. Order matters: A then B, in A's space."),
	pure("cframe.translate", "CFrame + Vector3", "CFrames", "$in.cframe + $in.offset",
		[cf("cframe", "CFrame"), vec("offset", "Offset")], "CFrame",
		"Moves in world space, leaving the rotation alone."),
	pure("cframe.inverse", "Inverse", "CFrames", "$in.cframe:Inverse()", [cf("cframe", "CFrame")], "CFrame"),
	pure("cframe.lerp", "CFrame Lerp", "CFrames", "$in.a:Lerp($in.b, $in.alpha)",
		[cf("a", "A"), cf("b", "B"), num("alpha", "Alpha", 0.5)], "CFrame"),
	pure("cframe.toWorldSpace", "To World Space", "CFrames", "$in.cframe:ToWorldSpace($in.offset)",
		[cf("cframe", "CFrame"), cf("offset", "Offset")], "CFrame"),
	pure("cframe.toObjectSpace", "To Object Space", "CFrames", "$in.cframe:ToObjectSpace($in.other)",
		[cf("cframe", "CFrame"), cf("other", "Other")], "CFrame"),
	pure("cframe.pointToWorldSpace", "Point To World Space", "CFrames",
		"$in.cframe:PointToWorldSpace($in.point)",
		[cf("cframe", "CFrame"), vec("point", "Point")], "Vector3"),
	pure("cframe.pointToObjectSpace", "Point To Object Space", "CFrames",
		"$in.cframe:PointToObjectSpace($in.point)",
		[cf("cframe", "CFrame"), vec("point", "Point")], "Vector3"),
	pure("cframe.vectorToWorldSpace", "Vector To World Space", "CFrames",
		"$in.cframe:VectorToWorldSpace($in.vector)",
		[cf("cframe", "CFrame"), vec("vector", "Vector")], "Vector3"),
	pure("cframe.position", "CFrame Position", "CFrames", "$in.cframe.Position",
		[cf("cframe", "CFrame")], "Vector3"),
	pure("cframe.rotation", "CFrame Rotation", "CFrames", "$in.cframe.Rotation",
		[cf("cframe", "CFrame")], "CFrame"),
	pure("cframe.lookVector", "Look Vector", "CFrames", "$in.cframe.LookVector",
		[cf("cframe", "CFrame")], "Vector3"),
	pure("cframe.rightVector", "Right Vector", "CFrames", "$in.cframe.RightVector",
		[cf("cframe", "CFrame")], "Vector3"),
	pure("cframe.upVector", "Up Vector", "CFrames", "$in.cframe.UpVector",
		[cf("cframe", "CFrame")], "Vector3"),

	// -- DateTime ----------------------------------------------------------
	call("datetime.now", "Now", "Time", "DateTime.now()", [], "Now", "any",
		{ targets: ["roblox"], summary: "The current moment. Impure: it differs every call." }),
	pure("datetime.fromUnix", "From Unix Timestamp", "Time",
		"DateTime.fromUnixTimestamp($in.seconds)", [num("seconds", "Seconds")], "any"),
	pure("datetime.fromIso", "From ISO Date", "Time", "DateTime.fromIsoDate($in.iso)",
		[str("iso", "ISO 8601", "2026-09-06T00:00:00Z")], "any",
		"Returns nil if the string does not parse, which is Roblox's behaviour rather than an error."),
	pure("datetime.toIso", "To ISO Date", "Time", "$in.moment:ToIsoDate()",
		[d("moment", "DateTime", "any")], "string"),
	pure("datetime.unixTimestamp", "Unix Timestamp", "Time", "$in.moment.UnixTimestamp",
		[d("moment", "DateTime", "any")], "number"),
	pure("datetime.unixMillis", "Unix Timestamp (ms)", "Time",
		"$in.moment.UnixTimestampMillis", [d("moment", "DateTime", "any")], "number"),
	pure("datetime.formatUniversal", "Format (UTC)", "Time",
		"$in.moment:FormatUniversalTime($in.format, $in.locale)",
		[d("moment", "DateTime", "any"), str("format", "Format", "LLL"), str("locale", "Locale", "en-us")],
		"string"),
	pure("datetime.formatLocal", "Format (Local)", "Time",
		"$in.moment:FormatLocalTime($in.format, $in.locale)",
		[d("moment", "DateTime", "any"), str("format", "Format", "LLL"), str("locale", "Locale", "en-us")],
		"string"),

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
		inputs: [exec("in"), { ...d("code", "Code", "string", { t: "raw", v: "-- your Luau here" }), code: true }],
		outputs: [exec("then")],
		compilesTo: { kind: "statement", template: "$in.code!raw" },
	},
];
