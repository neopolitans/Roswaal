/**
 * The templated standard library.
 *
 * Every node here compiles through the same declarative `expr` / `call` /
 * `statement` templates available to custom node packs -- there is nothing a
 * built-in can do that a `.nodedef.json` cannot. That is deliberate: it keeps
 * the template language honest.
 *
 * **Summaries are shortened for the Inspector**, which shows the opening and
 * links to the reference page — so the first sentence has to stand on its own.
 * See docs/WORDING.md; the short version is that a description says what the
 * node does, and everything else belongs on the page.
 */

import type { Literal, NodeConfig, NodeDef, PinDef } from "../schema.js";
import {
	CLASS_OPTIONS, PATH_ROOTS, ROBLOX_SERVICES, TYPE_OPTIONS, isInstanceClass,
} from "../roblox.js";
import {
	SERVICE_CALL, SERVICE_VALUE, servicePins, serviceSubtitle,
} from "../serviceCalls.js";
import { pinTypeOf, typedLocalName } from "./variables.js";
import { LUAU_PRIMITIVES } from "../luneTypes.js";
import { DATATYPES } from "../robloxData.js";
import { ENGINE_TYPES, LUAU, PAIR, SPECIFIER_HINTS } from "../schema.js";

/** The category for coordinates brought across from a Z-up tool. */
export const ZUP_CONVERSIONS = "Z-Up Conversions";

/**
 * The nodes that assert a type rather than test one.
 *
 * Named as a set because three things ask the same question of them: the
 * Inspector, which offers the Implicit/Explicit choice; the emitter, which acts
 * on it; and the documentation, which lists them together on the casting page.
 * Each of those was written against the literal string `"cast.as"` first, and
 * each of them was then wrong about the other two nodes.
 */
export const CAST_NODES: ReadonlySet<string> = new Set(["cast.as", "cast.array", "cast.any"]);

/**
 * How a cast reaches the value it asserts about.
 *
 * `auto` is what a cast has always done and stays the default: spliced into its
 * one reader, bound to a local as soon as there are two, on the ordinary rule
 * every pure node follows.
 *
 * The other two say so outright, and exist because a cast is the one pure node
 * whose *line* is the point. `explicit` always writes `local part = value ::
 * BasePart`, which is the line you want when several statements below read it
 * and you would rather see the claim once than five times. `implicit` never
 * writes one: the assertion is spliced where it is used, and where Luau has
 * already narrowed the value itself — inside the True arm of a Branch on Is A —
 * it disappears entirely, because there is nothing left for it to tell the
 * typechecker.
 */
export type CastMode = "auto" | "explicit" | "implicit";

export const CAST_MODES: { mode: CastMode; label: string; what: string }[] = [
	{ mode: "auto", label: "Automatic", what: "A line when the value is read more than once." },
	{ mode: "explicit", label: "Explicit", what: "Always a line: local x = value :: T." },
	{ mode: "implicit", label: "Implicit", what: "Never a line. Dropped where Is A has already narrowed the value." },
];

export function castModeOf(config: Record<string, unknown> | undefined): CastMode {
	const mode = config?.cast;
	return mode === "explicit" || mode === "implicit" ? mode : "auto";
}

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

/**
 * A pin naming an Instance class: `FindFirstChildOfClass`, `Instance.new`.
 *
 * Every class the engine has, with the common ones first, and still a plain
 * string underneath — the list is what you pick from, not what you are held to,
 * so a class newer than this build is typed in and works.
 */
const cls = (id: string, name: string, value: string) => ({
	...str(id, name, value), options: CLASS_OPTIONS,
});
/**
 * A pin naming a Luau type: what a cast asserts.
 *
 * Offered like a Class Name is, and for the reason that was: a list you pick
 * from beats a field you spell into. Wider than the classes, because `string`
 * and `Vector3` are as ordinary a thing to cast to as `BasePart` — and still
 * only a suggestion, since the picker commits whatever you type and a type
 * expression like `Model & { Humanoid: Humanoid }` is not on any list.
 */
const luauType = (id: string, name: string, value: string) => ({
	...str(id, name, value), options: TYPE_OPTIONS,
});

const cf = (id: string, name: string) => d(id, name, "CFrame", { t: "raw", v: "CFrame.identity" });

/**
 * The local this node's result lands in, shown under the node's own name
 * rather than replacing it — a node has to go on saying what it does after
 * you have named what it gives you.
 *
 * Pure nodes show it too. One binds a local as soon as anything reads its
 * value twice, so the name is just as load-bearing there; it was only ever
 * an impure node's field because binding used to be an impure node's job.
 */
const resultSubtitle = (config: Record<string, unknown>): string | undefined =>
	(config.resultName as string) || undefined;

/** Shorthand for a pure node with a single `result` output. */
function pure(
	id: string, title: string, category: string, template: string,
	inputs: PinDef[], resultType: string, summary?: string,
): NodeDef {
	return {
		id, title, category, summary, pure: true, inputs,
		outputs: [d("result", "", resultType)],
		compilesTo: { kind: "expr", outputs: { result: template } },
		subtitle: resultSubtitle,
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
		subtitle: resultSubtitle,
	};
}

/** Shorthand for an impure node that produces nothing. */
function stmt(
	id: string, title: string, category: string, template: string,
	inputs: PinDef[],
	opts: { targets?: NodeDef["targets"]; summary?: string; latent?: boolean } = {},
): NodeDef {
	return {
		id, title, category, summary: opts.summary, targets: opts.targets, latent: opts.latent,
		inputs: [exec("in"), ...inputs],
		outputs: [exec("then")],
		compilesTo: { kind: "statement", template },
	};
}

/**
 * A pure node whose arity is chosen per instance: Add with three operands, a
 * Concatenate with five. That is the difference between one node and a chain
 * of them.
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


/**
 * A node whose result is the class one of its pins names.
 *
 * New Instance says `Part` on its face and handed back an `Instance`, so
 * everything downstream had to be told again what the graph already said: a
 * Cast to reach `Anchored`, and nothing offering `Anchored` in the first place.
 * The class is typed into a pin, so the pins are derived from the pin values —
 * see `NodeDef.derivePins`, which takes them for this.
 *
 * Only a **known** class narrows the pin. A name this build has never heard of
 * is left as `Instance`, which is the honest answer and keeps a class newer
 * than the catalogue working exactly as it did.
 *
 * A wire into the pin narrows nothing either: the class is then whatever the
 * wire carries at runtime, which is not knowable here.
 */
/**
 * A cast whose result is the type it asserts.
 *
 * The whole point of a cast is to say what a value is, and its result pin said
 * `any` regardless — so `packet :: Input` handed on something the editor knew
 * nothing about, and Get Member had nothing to offer off it. The type is typed
 * into a pin, so the pins are derived from the pin values.
 *
 * `pinTypeOf` decides what the pin becomes, which keeps this honest about what
 * it cannot use: a table type written out is a `table`, and an expression that
 * is not a name at all stays `any`.
 */
function castTyped(def: NodeDef): NodeDef {
	return {
		...def,
		derivePins: (config, literals) => {
			const base = def.derivePins?.(config, literals)
				?? { inputs: def.inputs, outputs: def.outputs };
			const pin = base.inputs.find((one) => one.id === "type");
			const named = literals?.type ?? pin?.default;
			const text = named && (named.t === "string" || named.t === "raw") ? named.v.trim() : "";
			if (text === "") return base;
			return {
				inputs: base.inputs,
				outputs: base.outputs.map(
					(one) => (one.id === "result" ? { ...one, type: pinTypeOf(text) } : one),
				),
			};
		},
	};
}

function classTyped(def: NodeDef, pinId: string, outputId: string): NodeDef {
	const derive = (config: NodeConfig, literals?: Record<string, Literal>) => {
		const base = def.derivePins?.(config, literals)
			?? { inputs: def.inputs, outputs: def.outputs };
		// The pin's own default counts: a New Instance dropped on the canvas
		// says `Part` on its face before anybody has typed anything, and the
		// pin it feeds should say Part too.
		const pin = base.inputs.find((one) => one.id === pinId);
		const named = literals?.[pinId] ?? pin?.default;
		const className = named && named.t === "string" ? named.v.trim() : "";
		if (!isInstanceClass(className)) return base;
		return {
			inputs: base.inputs,
			outputs: base.outputs.map(
				(pin) => (pin.id === outputId ? { ...pin, type: className } : pin),
			),
		};
	};
	return { ...def, derivePins: derive };
}

/**
 * What `typeof` answers, which is not the same list as what a type can be.
 *
 * Luau's own names first, then Roblox's datatypes; `Instance` covers everything
 * in the DataModel, since `typeof(part)` is "Instance" rather than "Part".
 * Deliberately not the class list: a check against "Part" never matches, and
 * offering it would be offering a bug.
 */
const TYPEOF_NAMES: string[] = [
	...LUAU_PRIMITIVES.filter((name) => name !== "any" && name !== "unknown" && name !== "never"),
	"userdata",
	"Instance",
	...DATATYPES,
];

/**
 * A node whose whole job is reading one member off a value.
 *
 * `v.Magnitude` is the same shape as a Get Member -- a value in, a member
 * named, one thing out -- so it is drawn the same way: a pill with the access
 * on its face. A header over two rows spent a title saying what the access
 * already says, which is the argument the comparisons made when they became
 * pills.
 *
 * The symbol is read from the template rather than written twice, so the node
 * that writes `$in.cframe.LookVector` shows `.LookVector` and cannot drift
 * from it. A template that is anything but one member read is left alone.
 */
function memberPill(def: NodeDef): NodeDef {
	const template = def.compilesTo.kind === "expr" ? def.compilesTo.outputs.result : undefined;
	const read = template?.match(/^\$in\.[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)$/);
	if (!read) return def;
	return pill(
		// Unnamed, as Get Member's own pin is: the pill writes `.Magnitude`,
		// and a row labelled "Vector" beside it repeats the wire's colour.
		{
			...def,
			inputs: def.inputs.map(
				(pin, i) => (i === 0 ? { ...pin, name: "", hideEditor: true as const } : pin),
			),
		},
		`.${read[1]}`,
	);
}

const LETTERS = "ABCDEFGH".split("");

/**
 * A pure node drawn as an operator pill, with its operator in the middle.
 *
 * For the nodes whose whole meaning is one symbol: a comparison, `and`, `or`,
 * `not`, `nil`, and since 0.75.0 arithmetic -- on numbers, vectors, CFrames and
 * the UDims, each showing the Luau it writes. A full node spends a header on a title that says what the
 * symbol says, and two rows on pins called A and B — so a graph of conditions
 * reads as a column of boxes rather than as the expressions it is.
 */
const pill = (def: NodeDef, operator: string): NodeDef => ({
	...def, display: "operator", operator,
});

/**
 * How many trailing pins a variadic node will grow to.
 *
 * Named, and in one place, because the number lived in three: the `variadic`
 * block on each definition, and the two functions that derive the pins. Raising
 * the dictionary's cap by editing only its definition changed the *offer* and
 * not the pins, so the node claimed twenty-four pairs and still made eight.
 *
 * Eight is plenty of operands for `+`. A dictionary is a different question:
 * it is how you write a table literal, a settings table of ten entries is
 * ordinary, and there is no way to say "a table with ten keys" by adding more
 * nodes — it is one node or it is not that table.
 */
const MAX_ARGS = 8;
const MAX_PAIRS = 24;

/** Payload pins for a call whose argument count is chosen per node. */
function payload(config: Record<string, unknown>, min: number, max = MAX_ARGS): PinDef[] {
	const count = Math.max(min, Math.min(max, Number(config.args ?? min)));
	return Array.from({ length: count }, (_, i) =>
		d(`a${i}`, count === 1 ? "Value" : `Value ${i + 1}`, "any", { t: "nil" }),
	);
}

/**
 * An impure node taking a variable number of trailing arguments.
 *
 * `variadic` above only builds pure nodes, and firing a remote is the opposite
 * of pure. The count lives in the node's own config, so one graph can fire two
 * remotes with different payloads — and `min: 0` matters here, because firing
 * with nothing to say is a normal thing to do.
 */
function variadicStmt(
	id: string, title: string, category: string, template: string,
	fixed: PinDef[], summary: string, opts: { min?: number; targets?: NodeDef["targets"] } = {},
): NodeDef {
	const min = opts.min ?? 0;
	const shape = (config: Record<string, unknown>) => ({
		inputs: [exec("in"), ...fixed, ...payload(config, min)],
		outputs: [exec("then")],
	});
	return {
		// No runtime default here. This helper used to fill in `["roblox"]`,
		// which made a node's runtime a property of the constructor its author
		// reached for -- right for the remotes, wrong for `coroutine.yield`,
		// which is plain Luau and was hidden from every Lune graph by it. The
		// answer comes from `runtimes.ts` now, or from the call site.
		id, title, category, summary, targets: opts.targets,
		variadic: { min, max: MAX_ARGS, type: "any", default: { t: "nil" } },
		...shape({}),
		compilesTo: { kind: "statement", template },
		derivePins: shape,
	};
}

/** The same, for a call that hands a value back. */
function variadicCall(
	id: string, title: string, category: string, template: string,
	fixed: PinDef[], resultName: string, summary: string,
	opts: { min?: number; latent?: boolean; targets?: NodeDef["targets"] } = {},
): NodeDef {
	const min = opts.min ?? 0;
	const shape = (config: Record<string, unknown>) => ({
		inputs: [exec("in"), ...fixed, ...payload(config, min)],
		outputs: [exec("then"), d("result", resultName, "any")],
	});
	return {
		// Same as `variadicStmt`: the runtime is not the constructor's to
		// decide. `coroutine.resume` came through here and was tagged Roblox.
		id, title, category, summary, targets: opts.targets, latent: opts.latent,
		variadic: { min, max: MAX_ARGS, type: "any", default: { t: "nil" } },
		...shape({}),
		compilesTo: { kind: "call", template, result: "result" },
		subtitle: resultSubtitle,
		derivePins: shape,
	};
}

/**
 * One pin per entry for Make Dictionary, each a Key Value Pair.
 *
 * A row used to be two pins — `k<i>` for the key and `a<i>` for the value, with
 * the value pin also accepting a whole pair. That is two shapes for one idea,
 * and it meant a pair wired in from elsewhere sat on a pin labelled Value with
 * the row's own Key silently unused.
 *
 * Now a row *is* a pair, and **splitting it gives the Key and Value back**. The
 * two states are exclusive on purpose: split, you type the key and value in;
 * whole, you wire a Key Value Pair into it. Rows arrive split, because a pair
 * pin has no literal and a node you cannot type into until you have found a
 * context menu is a node that does nothing when you place it.
 */
function dictionaryPins(config: Record<string, unknown>): { inputs: PinDef[]; outputs: PinDef[] } {
	const count = Math.max(1, Math.min(MAX_PAIRS, Number(config.args ?? 1)));
	const inputs: PinDef[] = [];
	for (let i = 0; i < count; i++) {
		// Unnamed at one row, so its split parts read "Key" and "Value" rather
		// than repeating a number the node does not need. See `applySplits`.
		inputs.push(d(`p${i}`, count === 1 ? "" : `Pair ${i + 1}`, PAIR));
	}
	return { inputs, outputs: [d("result", "", "table")] };
}

/**
 * Argument pins for the call nodes. One by default, because most calls take
 * one, and the count is stored per node rather than baked into the definition.
 */
function argPins(config: Record<string, unknown>): PinDef[] {
	const count = Math.max(0, Math.min(MAX_ARGS, Number(config.args ?? 1)));
	return Array.from({ length: count }, (_, i) =>
		d(`a${i}`, count === 1 ? "Argument" : `Arg ${i + 1}`, "any", { t: "nil" }),
	);
}

// ---------------------------------------------------------------------------
// Engine types
// ---------------------------------------------------------------------------

/**
 * A Roblox datatype's block of nodes.
 *
 * The category and subcategory are stamped on here rather than repeated on
 * every entry, which is what keeps ninety datatype nodes readable as a list of
 * operations rather than a column of the same two strings.
 */
function datatype(subcategory: string, defs: NodeDef[]): NodeDef[] {
	return defs.map((def) => ({ ...def, category: ENGINE_TYPES, subcategory }));
}

/** `pure`, with the category left to `datatype` to fill in. */
const p = (
	id: string, title: string, template: string,
	inputs: PinDef[], resultType: string, summary?: string,
): NodeDef => pure(id, title, ENGINE_TYPES, template, inputs, resultType, summary);

/**
 * A pure node that takes one value apart into several.
 *
 * The usual name for this is Break; here it is one node per datatype with an
 * output per component. Splitting the pin does the same job — see
 * `structs.ts` — but a Break node is what somebody who already knows node
 * graphs reaches for first, and having both costs one definition.
 *
 * Each output carries its **own** expression, because that is what `expr` is.
 * For a component that is a plain field read that is exactly right. For one
 * that comes out of a multiple-return call it means the call is written once
 * per output actually wired — see `Color3 To HSV`, which is the only case here
 * where that is true and where it is said on the node itself.
 */
function breakInto(
	id: string, title: string, inputs: PinDef[],
	outputs: { id: string; name: string; type: string; expr: string }[],
	summary?: string,
): NodeDef {
	return {
		id, title, category: ENGINE_TYPES, summary, pure: true, inputs,
		outputs: outputs.map((o) => d(o.id, o.name, o.type)),
		compilesTo: {
			kind: "expr",
			outputs: Object.fromEntries(outputs.map((o) => [o.id, o.expr])),
		},
	};
}

/** Datatype pins, each defaulting to a real value rather than nil. */
const v2 = (id: string, name: string) => d(id, name, "Vector2", { t: "raw", v: "Vector2.zero" });
const col = (id: string, name: string) =>
	d(id, name, "Color3", { t: "raw", v: "Color3.new(1, 1, 1)" });
const bcol = (id: string, name: string) =>
	d(id, name, "BrickColor", { t: "raw", v: 'BrickColor.new("Medium stone grey")' });
const ud = (id: string, name: string) => d(id, name, "UDim", { t: "raw", v: "UDim.new(0, 0)" });
const ud2 = (id: string, name: string) => d(id, name, "UDim2", { t: "raw", v: "UDim2.new()" });
const tinfo = (id: string, name: string) =>
	d(id, name, "TweenInfo", { t: "raw", v: "TweenInfo.new()" });

/**
 * Easing, as suggestions rather than a closed set.
 *
 * `options` on a pin is a dropdown you can still type into, which is the right
 * shape for an engine enum: these are the styles Roblox ships today, and a
 * value the list has not caught up with should not be a dead end.
 */
const EASING_STYLES = [
	"Linear", "Sine", "Quad", "Cubic", "Quart", "Quint",
	"Back", "Bounce", "Elastic", "Exponential", "Circular",
];
const EASING_DIRECTIONS = ["Out", "In", "InOut"];

/**
 * The BrickColor names worth offering, out of the many hundreds the engine
 * knows.
 *
 * Suggestions only, for the same reason as the easing lists. A full list would
 * be a dropdown nobody could scan and a large table to carry; these are the
 * ones that actually turn up in code.
 */
const BRICK_COLORS = [
	"Medium stone grey", "Institutional white", "White", "Black", "Really black",
	"Bright red", "Really red", "Bright blue", "Bright yellow", "Bright green",
	"Bright orange", "Dark stone grey", "Earth green", "Deep blue", "Reddish brown",
];

/** Declare Local's inputs, shared by the definition and its pin derivation. */
const LOCAL_INPUTS: PinDef[] = [
	exec("in"),
	/**
	 * Optional, and typed rather than derived from the node's label.
	 *
	 * The label already fed the generated identifier, which worked and was
	 * findable only by opening the Inspector and guessing that a cosmetic field
	 * was load-bearing. A name that ends up in the emitted Luau belongs on the
	 * node face, where it is read at the same moment as the value it names.
	 */
	d("name", "Name", "string", { t: "string", v: "" }),
	d("value", "Value", "any", { t: "nil" }),
];

export const LIBRARY_NODES: NodeDef[] = [
	// -- Values ------------------------------------------------------------
	pure("value.number", "Number", "Values", "$in.value", [num("value", "")], "number"),
	pure("value.string", "String", "Values", "$in.value", [str("value", "")], "string"),
	pure("value.boolean", "Boolean", "Values", "$in.value", [bool("value", "")], "boolean"),
	pill(pure("value.nil", "Nil", "Values", "nil", [], "any"), "nil"),
	pill(
		pure("value.typeof", "Type Of", "Values", "typeof($in.value)",
			[d("value", "", "any")], "string",
			"Roblox's `typeof`, which knows its own datatypes -- a Vector3 answers \"Vector3\" where " +
			"Lua's `type` only says \"userdata\". This is the runtime one; for `typeof(x)` inside a " +
			"type, write it in a Declare Type node's definition."),
		"typeof",
	),
	/**
	 * The name a value's type answers to, as a string, chosen rather than spelt.
	 *
	 * `typeof(aim) ~= "Vector3"` is the shape of every runtime type check, and
	 * the right-hand side was a String node with the name typed into it — where
	 * "vector3", "Vector 3" and a stray space are all things you find out about
	 * at runtime, if at all. The list is what `typeof` can actually answer:
	 * Luau's own type names and Roblox's datatypes, with `Instance` for
	 * anything in the DataModel.
	 *
	 * Still only a suggestion, like every other list here -- a datatype newer
	 * than this build is typed in and compiles to exactly the same string.
	 */
	pure("value.typeName", "Type as String", "Values", "$in.type",
		[{ ...str("type", "", "Vector3"), options: TYPEOF_NAMES }], "string",
		"The name `typeof` answers for a type, as a string: `\"Vector3\"`. Picked from a list " +
		"rather than typed, since a misspelt one is a check that never matches."),
	/**
	 * `x ~= x`, which is true of exactly one value.
	 *
	 * NaN is not equal to itself, and that is the whole test for it: there is
	 * no `isnan` in Luau, and `x == x` reads as a tautology to anybody who has
	 * not met the trick. A node for it says what it is for on its face, and
	 * makes the graph's intent legible where a comparison of a value against
	 * itself looks like a mistake somebody should clean up.
	 */
	pill(
		pure("compare.selfNeq", "Not Equal to Self", "Logic", "$in.a ~= $in.a",
			[d("a", "", "any")], "boolean",
			"True only for NaN, which is the one value not equal to itself — the check for a " +
			"number that came out of `0/0` or a normalised zero vector. Luau has no `isnan`."),
		"~= self",
	),
	{
		id: "value.expression",
		title: "Luau Expression",
		category: "Values",
		summary: "Escape hatch. The text is inserted verbatim as an expression.",
		pure: true,
		inputs: [{ ...d("code", "Code", LUAU, { t: "raw", v: "0" }), code: true }],
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
			"Binds a local in the current block. Wire the Local output onward, or drag it from the Locals list as a Get Local. Name and type are optional.",
		inputs: LOCAL_INPUTS,
		outputs: [exec("then"), d("ref", "Local", "any")],
		compilesTo: { kind: "builtin", handler: "local.declare" },
		// The Local pin takes the declared type, so a table local is a table
		// wire and a `Model` local fits an `Instance` pin.
		derivePins: (config) => ({
			inputs: LOCAL_INPUTS,
			outputs: [exec("then"), d("ref", "Local", pinTypeOf(config.type as string | undefined))],
		}),
		/**
		 * The name in brackets after the title, the way Declare Function shows
		 * its own -- so a graph with four locals in it can be read without
		 * opening any of them.
		 *
		 * Beside the title rather than instead of it: this node is one of two
		 * ways to hold a value, and which one it is is the thing you are looking
		 * at it to find out. Only when a name has been typed; an unnamed one
		 * still reads "Declare Local" rather than announcing its fallback.
		 */
		defaultLabel: (_config, node) => {
			const name = node ? typedLocalName(node) : "";
			return name ? `Declare Local (${name})` : undefined;
		},
		// The type under the title, the way Declare Type shows the name it declares.
		subtitle: (config) => (config.type as string | undefined)?.trim() || undefined,
	},
	stmt("local.set", "Set Local", "Variables", "$in.variable = $in.value", [
		d("variable", "Local", "any", undefined),
		d("value", "Value", "any", { t: "nil" }),
	], { summary: "Reassigns a local declared upstream." }),

	// -- Math --------------------------------------------------------------
	pill(variadic("math.add", "Add", "Math", "$args( + )", "number", { t: "number", v: 0 }, "number"), "+"),
	pill(variadic("math.sub", "Subtract", "Math", "$args( - )", "number", { t: "number", v: 0 }, "number"), "-"),
	pill(variadic("math.mul", "Multiply", "Math", "$args( * )", "number", { t: "number", v: 1 }, "number"), "*"),
	pill(variadic("math.div", "Divide", "Math", "$args( / )", "number", { t: "number", v: 1 }, "number"), "/"),
	pill(pure("math.mod", "Modulo", "Math", "$in.a % $in.b", [num("a", "A"), num("b", "B", 1)], "number"), "%"),
	pill(pure("math.pow", "Power", "Math", "$in.a ^ $in.b", [num("a", "A"), num("b", "B", 2)], "number"), "^"),
	pill(pure("math.neg", "Negate", "Math", "-$in.a", [num("a", "A")], "number"), "-"),
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
	pill(pure("compare.eq", "Equal", "Logic", "$in.a == $in.b", [d("a", "A", "any"), d("b", "B", "any")], "boolean"), "=="),
	pill(pure("compare.neq", "Not Equal", "Logic", "$in.a ~= $in.b", [d("a", "A", "any"), d("b", "B", "any")], "boolean"), "~="),
	pill(pure("compare.lt", "Less Than", "Logic", "$in.a < $in.b", [num("a", "A"), num("b", "B")], "boolean"), "<"),
	pill(pure("compare.lte", "Less Or Equal", "Logic", "$in.a <= $in.b", [num("a", "A"), num("b", "B")], "boolean"), "<="),
	pill(pure("compare.gt", "Greater Than", "Logic", "$in.a > $in.b", [num("a", "A"), num("b", "B")], "boolean"), ">"),
	pill(pure("compare.gte", "Greater Or Equal", "Logic", "$in.a >= $in.b", [num("a", "A"), num("b", "B")], "boolean"), ">="),
	// Luau has no boolean-only operators: `nil` and `false` are false, every other
	// value is true, and `and`/`or` hand back one of their operands rather than a
	// boolean. Typing these pins `boolean` blocked `if not part then` -- the most
	// common line in Roblox code -- and would have annotated `local x: boolean =
	// part or default` in strict mode, which does not compile.
	pill(variadic("logic.and", "And", "Logic", "$args( and )", "any", { t: "boolean", v: true }, "any",
		"The last operand, or the first that is falsy. Not a boolean: `a and b` hands back " +
		"one of the two, which is what Luau's `and` does. Brackets, in the Inspector, wraps " +
		"the result in `( )`; precedence is handled either way."), "and"),
	pill(variadic("logic.or", "Or", "Logic", "$args( or )", "any", { t: "boolean", v: false }, "any",
		"The first operand that is not `nil` or `false`. This is how a default is written: " +
		"`value or fallback` is the value when there is one and the fallback when there is not. " +
		"Brackets, in the Inspector, wraps the result in `( )`; precedence is handled either way."), "or"),
	pill(pure("logic.not", "Not", "Logic", "not $in.a", [d("a", "A", "any", { t: "boolean", v: false })],
		"boolean",
		"True when the value is `nil` or `false`, and false for everything else. Takes any " +
		"value, so `not part` on an `Instance?` is the usual way to ask whether it is there. " +
		"Note that 0 and an empty string are true in Luau. Brackets, in the Inspector, wraps " +
		"the result in `( )`; precedence is handled either way."), "not"),

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
		subtitle: (config) => (config.resultName as string) || undefined,
	},
	// Index and Key are two nodes, because an index is a number to anyone who
	// has written code, and one node for both left `t.name` behind a pin called
	// Index. The template is the same; what differs is what the pin takes.
	pure("table.get", "Get Index", "Tables", "$index(table, key)",
		[d("table", "Table", "table"), num("key", "Index", 1)], "any",
		"Reads `t[i]` for a numeric index. For a named or computed key, use Get Key."),
	pure("table.getKey", "Get Key", "Tables", "$index(table, key)",
		[d("table", "Table", "table"), d("key", "Key", "any", { t: "string", v: "name" })], "any",
		"Reads `t.name`, or `t[key]` for any key wired in. For a numeric index, use Get Index."),
	pure("table.length", "Table Length", "Tables", "#$in.table", [d("table", "Table", "table")], "number"),
	stmt("table.set", "Set Index", "Tables", "$index(table, key) = $in.value", [
		d("table", "Table", "table"), num("key", "Index", 1), d("value", "Value", "any", { t: "nil" }),
	], { summary: "Assigns `t[i]` for a numeric index. For a named or computed key, use Set Key." }),
	stmt("table.setKey", "Set Key", "Tables", "$index(table, key) = $in.value", [
		d("table", "Table", "table"),
		d("key", "Key", "any", { t: "string", v: "name" }),
		d("value", "Value", "any", { t: "nil" }),
	], { summary: "Assigns `t.name`, or `t[key]` for any key wired in. For a numeric index, use Set Index." }),
	stmt("table.insert", "Insert", "Tables", "table.insert($in.table, $in.value)", [
		d("table", "Table", "table"), d("value", "Value", "any", { t: "nil" }),
	]),
	stmt("table.remove", "Remove", "Tables", "table.remove($in.table, $in.index)", [
		d("table", "Table", "table"), num("index", "Index", 1),
	]),

	/**
	 * A dictionary written out in one node.
	 *
	 * The general answer to "this call wants a table of things", of which
	 * tweening is the case that forced it: `TweenService:Create` takes a map of
	 * property names to target values, and building one with New Table and a
	 * chain of Set Index is three nodes and an execution wire to say `{ x = 1 }`.
	 *
	 * Pure, so it composes into the call rather than sitting in front of it.
	 * Keys are pins rather than config so a key can be computed, which config
	 * could not do.
	 */
	{
		id: "table.dictionary",
		title: "Make Dictionary",
		category: "Tables",
		summary:
			"A table built in one node. Each row is a Key Value Pair: split it to type a key " +
			"and value in, or leave it whole to wire one in. Use + and − for how many rows; a " +
			"row with an empty key is left out.",
		pure: true,
		/**
		 * Room for a settings table, which is what this node is mostly for.
		 *
		 * Eight was the cap every variadic node shared, and eight operands is
		 * plenty for `+` — but a tank's tuning table has ten entries and a
		 * `TweenInfo` map can have more, and there is no way to say "a table with
		 * eleven keys" by adding more nodes. It has to be one node or it is not
		 * that table. Twenty-four is tall on the canvas and still finite.
		 */
		variadic: { min: 1, max: MAX_PAIRS, type: "any", default: { t: "nil" } },
		...dictionaryPins({}),
		outputs: [d("result", "", "table")],
		compilesTo: { kind: "expr", outputs: { result: "{$pairs(, )}" } },
		derivePins: dictionaryPins,
	},

	/**
	 * One entry of a dictionary, as a wire.
	 *
	 * Make Dictionary's rows are key and value side by side on one node, which
	 * is the right shape until the values come from all over the graph. This
	 * gathers a key and its value where the value is made, and one wire takes
	 * the pair to the table. Builtin, because it has no expression of its own:
	 * the emitter reads it from inside `$pairs`, and anywhere else it is an
	 * error rather than a guess.
	 */
	{
		id: "table.pair",
		title: "Key Value Pair",
		category: "Tables",
		summary:
			"One entry for Make Dictionary: a key and its value, wired in together. Set the key on the node or in the Inspector.",
		pure: true,
		inputs: [str("key", "Key", "name"), d("value", "Value", "any", { t: "string", v: "" })],
		outputs: [d("result", "", PAIR)],
		compilesTo: { kind: "builtin", handler: "table.pair" },
	},

	// -- Engine ------------------------------------------------------------
	{
		// Pure, and hoisted. GetService is idempotent and cached by Roblox, so
		// calling it mid-flow buys nothing; every Roblox codebase pulls services
		// into locals at the top of the file, and the generated output should
		// read like one that was written by hand.
		id: "roblox.getService",
		title: "Get Service",
		category: "Engine",
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
		/**
		 * A service is an instance of a class named after it, so the local it
		 * binds is typed as that class rather than as a bare `Instance` —
		 * which is what lets Get Member offer `Workspace.Gravity`.
		 */
		derivePins: (_config, literals) => {
			const named = literals?.service ?? { t: "string" as const, v: "Players" };
			const service = named.t === "string" ? named.v.trim() : "";
			return {
				inputs: [
					{
						...str("service", "Service", "Players"),
						options: [...ROBLOX_SERVICES],
						description: "Pick a service, or type one the list has not caught up with.",
					},
				],
				outputs: [d("service", "", isInstanceClass(service) ? service : "Instance")],
			};
		},
	},
	/**
	 * Every method a service has, without a node each.
	 *
	 * The pair exists for the reason Call Function and Call have one: a method
	 * that *does* something belongs in the execution chain, and a method that
	 * *answers* something belongs in the condition of the Branch that asks. Both
	 * call any method — the catalogue's read-only mark decides which one the
	 * menu reaches for and nothing more.
	 *
	 * See `serviceCalls.ts` for why the signature is derived rather than typed.
	 */
	{
		id: SERVICE_CALL,
		title: "Service Function",
		category: "Engine",
		summary:
			"Calls a method on a service: Debris:AddItem, TweenService:Create. The service is pulled into a local at the top of the file, as Get Service does.",
		targets: ["roblox"],
		inputs: servicePins(undefined, false).inputs,
		outputs: servicePins(undefined, false).outputs,
		compilesTo: { kind: "builtin", handler: "service.call" },
		derivePins: (config) => servicePins(config, false),
		subtitle: (config) => serviceSubtitle(config) ?? resultSubtitle(config),
	},
	{
		id: SERVICE_VALUE,
		title: "Service Function (Value)",
		category: "Engine",
		summary:
			"Asks a service something, where the answer is wanted: RunService:IsServer() in a Branch, Players:GetPlayers() in a For Each. No execution wire.",
		targets: ["roblox"],
		pure: true,
		inputs: servicePins(undefined, true).inputs,
		outputs: servicePins(undefined, true).outputs,
		compilesTo: { kind: "builtin", handler: "service.call" },
		derivePins: (config) => servicePins(config, true),
		subtitle: (config) => serviceSubtitle(config) ?? resultSubtitle(config),
	},
	classTyped(
		call("roblox.instanceNew", "New Instance", "Engine", "Instance.new($in.className)",
			[cls("className", "Class Name", "Part")], "Instance", "Instance", { targets: ["roblox"] }),
		"className", "result",
	),
	call("roblox.waitForChild", "Wait For Child", "Engine",
		"$in.parent:WaitForChild($in.name)",
		[d("parent", "Parent", "Instance"), str("name", "Name")], "Child", "Instance",
		{ latent: true, targets: ["roblox"], summary: "Yields until the child exists." }),
	/**
	 * The same call as a value.
	 *
	 * Waiting is a step and belongs in the chain — which is why the impure one
	 * leads and stays the default. But a module that reaches three children at
	 * the top of itself is four statements of ceremony for three names, and
	 * `local remote = ReplicatedStorage:WaitForChild("Remote")` is what a
	 * hand-written one says. A pure node *is* that line: spliced where it is
	 * read, bound to a local as soon as two things read it.
	 *
	 * Latent all the same. It yields wherever it lands, and the clock on the
	 * node is the only thing that says so once the execution wire is gone.
	 */
	{
		...pure("roblox.waitForChildValue", "Wait For Child (Value)", "Engine",
			"$in.parent:WaitForChild($in.name)",
			[d("parent", "Parent", "Instance"), str("name", "Name")], "Instance",
			"Yields until the child exists, where the child is wanted rather than as a step of its own. Use Wait For Child when the waiting is the point — this one disappears into the line that reads it."),
		latent: true,
		targets: ["roblox"],
	},
	pure("roblox.getProperty", "Get Property", "Engine", "$in.instance.$in.property!ident",
		[d("instance", "Instance", "Instance"), str("property", "Property", "Name")], "any"),
	pure("roblox.getEvent", "Get Event", "Engine", "$in.instance.$in.event!ident",
		[d("instance", "Instance", "Instance"), str("event", "Event", "Touched")], "RBXScriptSignal",
		"Reads a signal off an instance. Same access as Get Property, but typed as a signal so it wires straight into Connect Event."),
	stmt("roblox.setProperty", "Set Property", "Engine", "$in.instance.$in.property!ident = $in.value",
		[d("instance", "Instance", "Instance"), str("property", "Property", "Name"), d("value", "Value", "any", { t: "nil" })],
		{ targets: ["roblox"] }),
	stmt("roblox.setParent", "Set Parent", "Engine", "$in.instance.Parent = $in.parent",
		[d("instance", "Instance", "Instance"), d("parent", "Parent", "Instance")], { targets: ["roblox"] }),
	stmt("roblox.destroy", "Destroy", "Engine", "$in.instance:Destroy()",
		[d("instance", "Instance", "Instance")], { targets: ["roblox"] }),

	// -- Signals and connections -------------------------------------------
	//
	// Connect was the only node here, which meant a graph could take a connection
	// out and had no way to put it back. Disconnect is the missing half.
	{
		id: "event.once",
		title: "Connect Once",
		category: "Events",
		role: "flow",
		summary:
			"Runs the Body the next time the signal fires, then unbinds itself. No Disconnect needed, and no connection left behind if the thing never fires again.",
		targets: ["roblox"],
		inputs: [exec("in", ""), d("signal", "Signal", "RBXScriptSignal")],
		outputs: [
			exec("then", ""),
			exec("body", "Body"),
			d("connection", "Connection", "RBXScriptConnection"),
		],
		compilesTo: { kind: "builtin", handler: "event.once" },
		derivePins(config) {
			const sig = config as { params?: { name?: string; type?: string }[] };
			return {
				inputs: [exec("in", ""), d("signal", "Signal", "RBXScriptSignal")],
				outputs: [
					exec("then", ""),
					exec("body", "Body"),
					d("connection", "Connection", "RBXScriptConnection"),
					...(sig.params ?? []).map((p, i) =>
						d(`p${i}`, p.name || `arg${i + 1}`, p.type ?? "any"),
					),
				],
			};
		},
	},
	call("event.wait", "Wait For Signal", "Events", "$in.signal:Wait()",
		[d("signal", "Signal", "RBXScriptSignal")], "Value", "any",
		{
			latent: true, targets: ["roblox"],
			summary:
				"Yields until the signal fires, then continues with what it carried. Nothing else in this script runs meanwhile — Connect when you want it to.",
		}),
	stmt("connection.disconnect", "Disconnect", "Events", "$in.connection:Disconnect()",
		[d("connection", "Connection", "RBXScriptConnection")],
		{
			targets: ["roblox"],
			summary:
				"Stops a connection. A connection you never disconnect keeps its handler — and everything the handler captured — alive as long as the signal is.",
		}),
	pure("connection.isConnected", "Is Connected", "Events", "$in.connection.Connected",
		[d("connection", "Connection", "RBXScriptConnection")], "boolean",
		"False once it has been disconnected, or after Connect Once has fired."),

	// -- Networking --------------------------------------------------------
	//
	// One set of nodes covers RemoteEvent and UnreliableRemoteEvent both: their
	// methods are identical, and the difference is a decision made when the
	// instance is created rather than a different call to write.
	variadicStmt("remote.fireServer", "Fire Server", "Networking",
		"$in.remote:FireServer($args(, ))", [d("remote", "Remote", "Instance")],
		"Client to server. Works on a RemoteEvent or an UnreliableRemoteEvent — the call is the same; the guarantees are what differ."),
	variadicStmt("remote.fireClient", "Fire Client", "Networking",
		"$in.remote:FireClient($in.player$more(, ))",
		[d("remote", "Remote", "Instance"), d("player", "Player", "Instance")],
		"Server to one client. The player is not optional, and is not part of what they receive."),
	variadicStmt("remote.fireAllClients", "Fire All Clients", "Networking",
		"$in.remote:FireAllClients($args(, ))", [d("remote", "Remote", "Instance")],
		"Server to everyone connected."),
	pure("remote.onServerEvent", "On Server Event", "Networking", "$in.remote.OnServerEvent",
		[d("remote", "Remote", "Instance")], "RBXScriptSignal",
		"Fires on the server when a client fires this remote. The first argument is always the Player who sent it, added by Roblox — never trust anything after it."),
	pure("remote.onClientEvent", "On Client Event", "Networking", "$in.remote.OnClientEvent",
		[d("remote", "Remote", "Instance")], "RBXScriptSignal",
		"Fires on the client when the server fires this remote."),

	variadicCall("remote.invokeServer", "Invoke Server", "Networking",
		"$in.remote:InvokeServer($args(, ))", [d("remote", "Remote", "Instance")], "Result",
		"Client to server, and waits for the answer. Yields, and **raises the server's error on the caller** if the handler throws — a RemoteFunction couples the two sides in a way a RemoteEvent does not.",
		{ latent: true }),
	variadicCall("remote.invokeClient", "Invoke Client", "Networking",
		"$in.remote:InvokeClient($in.player$more(, ))",
		[d("remote", "Remote", "Instance"), d("player", "Player", "Instance")], "Result",
		"Server to one client, waiting for the answer. Rarely the right tool: a client that never answers leaves the server yielding, and one that leaves raises an error.",
		{ latent: true }),
	stmt("remote.onServerInvoke", "Set On Server Invoke", "Networking",
		"$in.remote.OnServerInvoke = $in.handler",
		[d("remote", "Remote", "Instance"), d("handler", "Handler", "function")],
		{
			targets: ["roblox"],
			summary:
				"A RemoteFunction is answered by assigning one callback, not by connecting to a signal — so there is exactly one handler, and assigning again replaces it. Wire Get Function in.",
		}),
	stmt("remote.onClientInvoke", "Set On Client Invoke", "Networking",
		"$in.remote.OnClientInvoke = $in.handler",
		[d("remote", "Remote", "Instance"), d("handler", "Handler", "function")],
		{ targets: ["roblox"], summary: "The client side of the same one-callback rule." }),

	variadicStmt("bindable.fire", "Fire Bindable", "Networking",
		"$in.event:Fire($args(, ))", [d("event", "Bindable Event", "Instance")],
		"In-process, one machine, no network: how one script signals another."),
	pure("bindable.event", "Bindable Event Signal", "Networking", "$in.event.Event",
		[d("event", "Bindable Event", "Instance")], "RBXScriptSignal",
		"The signal a BindableEvent fires. Unlike a remote, no Player is prepended."),
	variadicCall("bindable.invoke", "Invoke Bindable", "Networking",
		"$in.fn:Invoke($args(, ))", [d("fn", "Bindable Function", "Instance")], "Result",
		"Calls a BindableFunction and waits. Same one-callback rule as a RemoteFunction, without the network."),
	stmt("bindable.onInvoke", "Set On Invoke", "Networking",
		"$in.fn.OnInvoke = $in.handler",
		[d("fn", "Bindable Function", "Instance"), d("handler", "Handler", "function")],
		{ targets: ["roblox"] }),

	// -- Z-up conversions --------------------------------------------------
	//
	// Coordinates from a tool that is X forward, Y right and Z up -- left-handed,
	// and in centimetres unless told otherwise. Roblox is X right, Y up and Z
	// back, in studs, so a position becomes `Vector3.new(y, z, -x)`, scaled.
	//
	// A rotation is the same change of axes applied to a quaternion. The change
	// flips handedness, which the quaternion's vector part absorbs as a sign:
	// (x, y, z) goes to (-y, -z, x), and w is untouched. tests/zup.test.ts
	// checks that against the rotation matrices it is shorthand for.
	//
	// Negation is written `-($in.x)`, never `-$in.x`: a negative literal spliced
	// after a minus would emit `--3`, which Luau reads as a comment.
	//
	// Named for the convention rather than for any one tool that uses it.
	pure("zup.vector3", "Vector3 from Z-Up", ZUP_CONVERSIONS,
		"Vector3.new($in.y, $in.z, -($in.x)) / $in.units",
		[num("x", "X (forward)"), num("y", "Y (right)"), num("z", "Z (up)"),
			num("units", "Units Per Stud", 28)],
		"Vector3",
		"A position from X-forward, Y-right, Z-up coordinates. Units Per Stud is 28 for centimetres; set it to 1 for a direction."),
	pure("zup.rotation", "CFrame from Z-Up Rotation", ZUP_CONVERSIONS,
		"CFrame.new(0, 0, 0, -($in.y), -($in.z), $in.x, $in.w)",
		[num("x", "X"), num("y", "Y"), num("z", "Z"), num("w", "W", 1)],
		"CFrame",
		"A rotation from an X-forward, Y-right, Z-up quaternion, as a CFrame at the origin."),
	// Pitch, yaw and roll in degrees, in the source's sense of each: yaw turns
	// forward towards right, pitch tilts it up, roll tips the right side down.
	// The source's own formula applies roll, then pitch, then yaw, with pitch
	// and roll against the right-hand rule. Carried across the axes, that is
	// Roblox's Y, X, Z order -- `fromEulerAnglesYXZ` -- with yaw and roll
	// negated. tests/zup.test.ts checks it against the quaternion the source
	// itself would compute.
	pure("zup.rotator", "CFrame from Z-Up Rotator", ZUP_CONVERSIONS,
		"CFrame.fromEulerAnglesYXZ(math.rad($in.pitch), -math.rad($in.yaw), -math.rad($in.roll))",
		[num("pitch", "Pitch"), num("yaw", "Yaw"), num("roll", "Roll")],
		"CFrame",
		"A rotation from pitch, yaw and roll in degrees, as an X-forward, Z-up tool gives them, as a CFrame at the origin."),
	{
		id: "zup.transform",
		title: "CFrame from Z-Up Transform",
		category: ZUP_CONVERSIONS,
		summary:
			"A location and rotation from X-forward, Y-right, Z-up coordinates, as one CFrame. " +
			"Scale comes out on its own, because a CFrame has none — use it for a part's Size.",
		pure: true,
		inputs: [
			num("lx", "Location X"), num("ly", "Location Y"), num("lz", "Location Z"),
			num("qx", "Rotation X"), num("qy", "Rotation Y"), num("qz", "Rotation Z"),
			num("qw", "Rotation W", 1),
			num("sx", "Scale X", 1), num("sy", "Scale Y", 1), num("sz", "Scale Z", 1),
			num("units", "Units Per Stud", 28),
		],
		outputs: [d("cframe", "CFrame", "CFrame"), d("scale", "Scale", "Vector3")],
		compilesTo: {
			kind: "expr",
			outputs: {
				cframe:
					"CFrame.new($in.ly / $in.units, $in.lz / $in.units, -($in.lx) / $in.units, " +
					"-($in.qy), -($in.qz), $in.qx, $in.qw)",
				// Scale is a size per axis, so it swaps axes and never changes sign.
				scale: "Vector3.new($in.sy, $in.sz, $in.sx)",
			},
		},
	},

	// -- Instances ---------------------------------------------------------
	//
	// Roblox's Instance surface, minus what needs an execution wire. The line
	// drawn here is **side effects, not method-versus-property**: `:IsA()` is a
	// question about the value in front of you, and making you thread an
	// execution wire through a question is what pushes people into Custom Code.
	// Anything that allocates or mutates stays impure.
	pure("instance.getName", "Get Name", "Instances", "$in.instance.Name",
		[d("instance", "Instance", "Instance")], "string"),
	pure("instance.getClassName", "Get Class Name", "Instances", "$in.instance.ClassName",
		[d("instance", "Instance", "Instance")], "string",
		"The exact class, as a string. Comparing against it misses derived classes — Is A is the test for those."),
	pure("instance.isA", "Is A", "Instances", "$in.instance:IsA($in.className)",
		[d("instance", "Instance", "Instance"), cls("className", "Class Name", "BasePart")], "boolean",
		"True for the class itself and anything derived from it — the test you want when a Cast would be too strict."),
	pure("instance.isDescendantOf", "Is Descendant Of", "Instances",
		"$in.instance:IsDescendantOf($in.ancestor)",
		[d("instance", "Instance", "Instance"), d("ancestor", "Ancestor", "Instance")], "boolean"),
	pure("instance.isAncestorOf", "Is Ancestor Of", "Instances",
		"$in.instance:IsAncestorOf($in.descendant)",
		[d("instance", "Instance", "Instance"), d("descendant", "Descendant", "Instance")], "boolean"),
	pure("instance.queryDescendants", "Query Descendants", "Instances",
		"$in.instance:QueryDescendants($in.selector)",
		[d("instance", "Instance", "Instance"), str("selector", "Selector", "MeshPart")], "table",
		"Every descendant matching a selector string, as { Instance }. ClassName matches by IsA, .Tag by CollectionService tag, #Name by name, [Property = value] and [$Attribute = value] by value; combine them, and use :not(...) for absence. Pair with Cast Array when you know what comes back."),
	pure("instance.getFullName", "Get Full Name", "Instances", "$in.instance:GetFullName()",
		[d("instance", "Instance", "Instance")], "string"),
	pure("instance.getChildren", "Get Children", "Instances", "$in.instance:GetChildren()",
		[d("instance", "Instance", "Instance")], "table",
		"A fresh array each call. Typed `{ Instance }` — use Cast Array when you know what is in it."),
	pure("instance.getDescendants", "Get Descendants", "Instances",
		"$in.instance:GetDescendants()", [d("instance", "Instance", "Instance")], "table",
		"Everything below this instance, at any depth. Typed `{ Instance }`."),
	classTyped(
		pure("instance.findFirstChildOfClass", "Find First Child Of Class", "Instances",
			"$in.instance:FindFirstChildOfClass($in.className)",
			[d("instance", "Instance", "Instance"), cls("className", "Class Name", "Humanoid")], "Instance"),
		"className", "result",
	),
	/**
	 * Pure, as every sibling asking the same question already is: Find First
	 * Child Which Is A, the three Find First Ancestors, Get Children, Is A. It
	 * asks and changes nothing.
	 *
	 * Here rather than in Engine, with the questions it belongs beside. It sat
	 * in Engine from when it was impure and lived next to Wait For Child, which
	 * is the one of the pair that genuinely belongs there: Wait For Child
	 * yields, and yielding is an engine concern rather than a question about an
	 * instance. Its id stays `roblox.findFirstChild`, because an id is what a
	 * saved graph refers to and a category is not.
	 *
	 * Recursive is how Roblox searches a whole subtree by name, now that
	 * FindFirstDescendant is deprecated. Optional, so a Find First Child that
	 * does not set it compiles to exactly the call it always did.
	 */
	{
		id: "roblox.findFirstChild",
		title: "Find First Child",
		category: "Instances",
		targets: ["roblox"],
		summary: "Set Recursive to search every descendant, not only the children.",
		pure: true,
		inputs: [
			d("parent", "Parent", "Instance"),
			str("name", "Name"),
			{ ...bool("recursive", "Recursive"), optional: true },
		],
		outputs: [d("result", "Child", "Instance")],
		compilesTo: {
			kind: "expr",
			outputs: { result: "$in.parent:FindFirstChild($in.name$opt(, ))" },
		},
		subtitle: resultSubtitle,
	},
	// Recursive is optional here for the reason it is on Find First Child: left
	// alone it is not passed at all, so the line reads as the one somebody would
	// have written by hand. Roblox's own default is false either way.
	classTyped(
		pure("instance.findFirstChildWhichIsA", "Find First Child Which Is A", "Instances",
			"$in.instance:FindFirstChildWhichIsA($in.className$opt(, ))",
			[d("instance", "Instance", "Instance"), cls("className", "Class Name", "BasePart"),
				{ ...bool("recursive", "Recursive"), optional: true }], "Instance",
			"Matches derived classes too, unlike Find First Child Of Class."),
		"className", "result",
	),
	pure("instance.findFirstAncestor", "Find First Ancestor", "Instances",
		"$in.instance:FindFirstAncestor($in.name)",
		[d("instance", "Instance", "Instance"), str("name", "Name", "Model")], "Instance"),
	classTyped(
		pure("instance.findFirstAncestorOfClass", "Find First Ancestor Of Class", "Instances",
			"$in.instance:FindFirstAncestorOfClass($in.className)",
			[d("instance", "Instance", "Instance"), cls("className", "Class Name", "Model")], "Instance"),
		"className", "result",
	),
	classTyped(
		pure("instance.findFirstAncestorWhichIsA", "Find First Ancestor Which Is A", "Instances",
			"$in.instance:FindFirstAncestorWhichIsA($in.className)",
			[d("instance", "Instance", "Instance"), cls("className", "Class Name", "Model")], "Instance"),
		"className", "result",
	),
	pure("instance.propertyChanged", "Get Property Changed Signal", "Instances",
		"$in.instance:GetPropertyChangedSignal($in.property)",
		[d("instance", "Instance", "Instance"), str("property", "Property", "Name")], "RBXScriptSignal",
		"Fires only for that one property, unlike Changed. Wires straight into Connect Event."),
	call("instance.clone", "Clone", "Instances", "$in.instance:Clone()",
		[d("instance", "Instance", "Instance")], "Copy", "Instance",
		{ targets: ["roblox"], summary: "The copy has no parent until you give it one." }),
	stmt("instance.clearAllChildren", "Clear All Children", "Instances",
		"$in.instance:ClearAllChildren()", [d("instance", "Instance", "Instance")],
		{ targets: ["roblox"] }),

	// -- Attributes --------------------------------------------------------
	pure("instance.getAttribute", "Get Attribute", "Instances",
		"$in.instance:GetAttribute($in.name)",
		[d("instance", "Instance", "Instance"), str("name", "Name", "Health")], "any",
		"Returns nil when the attribute is not set, which is how you test for one."),
	pure("instance.getAttributes", "Get Attributes", "Instances",
		"$in.instance:GetAttributes()", [d("instance", "Instance", "Instance")], "table",
		"Every attribute as a table of name to value."),
	stmt("instance.setAttribute", "Set Attribute", "Instances",
		"$in.instance:SetAttribute($in.name, $in.value)",
		[d("instance", "Instance", "Instance"), str("name", "Name", "Health"),
			d("value", "Value", "any", { t: "nil" })],
		{ targets: ["roblox"], summary: "Setting nil removes the attribute." }),
	pure("instance.attributeChanged", "Get Attribute Changed Signal", "Instances",
		"$in.instance:GetAttributeChangedSignal($in.name)",
		[d("instance", "Instance", "Instance"), str("name", "Name", "Health")], "RBXScriptSignal"),

	// -- Tags --------------------------------------------------------------
	//
	// The methods on Instance rather than the CollectionService calls they
	// forward to: `part:AddTag("Enemy")` reads better than
	// `CollectionService:AddTag(part, "Enemy")` and needs no service hoisted.
	pure("instance.hasTag", "Has Tag", "Instances", "$in.instance:HasTag($in.tag)",
		[d("instance", "Instance", "Instance"), str("tag", "Tag", "Enemy")], "boolean"),
	pure("instance.getTags", "Get Tags", "Instances", "$in.instance:GetTags()",
		[d("instance", "Instance", "Instance")], "table",
		"Typed { any } by Roblox rather than { string }, so Cast Array earns its place here."),
	stmt("instance.addTag", "Add Tag", "Instances", "$in.instance:AddTag($in.tag)",
		[d("instance", "Instance", "Instance"), str("tag", "Tag", "Enemy")], { targets: ["roblox"] }),
	stmt("instance.removeTag", "Remove Tag", "Instances", "$in.instance:RemoveTag($in.tag)",
		[d("instance", "Instance", "Instance"), str("tag", "Tag", "Enemy")], { targets: ["roblox"] }),

	// -- Players -----------------------------------------------------------
	//
	// These reach the Players service themselves, so the common case does not
	// need a Get Service node wired into every one of them. The service is still
	// hoisted once, by the same mechanism.
	{
		id: "players.localPlayer",
		title: "Local Player",
		category: "Players",
		summary:
			"The player this client belongs to. Client-only: it is nil on the server, and Roswaal says so if the script is not a LocalScript.",
		pure: true,
		targets: ["roblox"],
		inputs: [],
		outputs: [d("player", "", "Instance")],
		compilesTo: { kind: "builtin", handler: "players.localPlayer" },
	},
	{
		id: "players.localCharacter",
		title: "Local Character",
		category: "Players",
		summary:
			"The local player's character model, or nil before it has spawned. Client-only.",
		pure: true,
		targets: ["roblox"],
		inputs: [],
		outputs: [d("character", "", "Instance")],
		compilesTo: { kind: "builtin", handler: "players.localCharacter" },
	},
	pure("players.fromCharacter", "Get Player From Character", "Players",
		"$in.players:GetPlayerFromCharacter($in.character)",
		[d("players", "Players", "Instance"), d("character", "Character", "Instance")], "Instance",
		"Wire Get Service (Players) in. Returns nil for a character with no player behind it."),
	pure("players.all", "Get Players", "Players", "$in.players:GetPlayers()",
		[d("players", "Players", "Instance")], "table",
		"Every player currently connected. Typed `{ Player }`."),

	// -- Casts -------------------------------------------------------------
	//
	// Luau's `::` assertion. It has no runtime behaviour at all: it tells the
	// typechecker what you know and disappears. That is genuinely different from
	// a checked cast, which branches at runtime — so there is no Cast Failed pin
	// here, and Is A is the node for asking rather than asserting.
	//
	// Drawn as pills, for the reason the comparisons are: a cast *is* an
	// operator — `value :: T`, two operands and a symbol — and a full node put a
	// header reading "Cast" above a pin called Value to say what `::` says. The
	// shape is also the point of the node. A cast is a claim made without a
	// check, and a graph should show where those are at a glance rather than
	// after reading three titles.
	castTyped(pill(pure("cast.as", "Cast", "Values", "($in.value :: $in.type!raw)",
		[d("value", "Value", "any"), luauType("type", "Type", "BasePart")], "any",
		"Asserts a type for the typechecker. No runtime check: if you are wrong, it is wrong silently — use Is A to ask first. The Type pin takes any Luau type expression, so an intersection like `Model & { Humanoid: Humanoid }` is written here directly. Cast, in the Inspector, decides whether the assertion gets a line of its own; an implicit one inside the True arm of a Branch on Is A writes nothing at all, because Luau has already narrowed the value."), "::")),
	pill(pure("cast.array", "Cast Array", "Values", "($in.value :: { $in.type!raw })",
		[d("value", "Value", "table"), luauType("type", "Type", "BasePart")], "table",
		"For a collection you know more about than its type says: Get Descendants is { Instance }, and this is how you say they are all BaseParts."), ":: { }"),
	castTyped(pill(pure("cast.any", "Cast Through Any", "Values", "(($in.value :: any) :: $in.type!raw)",
		[d("value", "Value", "any"), luauType("type", "Type", "BasePart")], "any",
		"Luau refuses a cast between unrelated types. Going through `any` is the documented way round it, and the extra step is the point: it marks where you overrode the typechecker rather than agreed with it."), ":: any ::")),

	// -- Engine types ------------------------------------------------------
	//
	// Every Roblox datatype, one subcategory per type. Almost all of it is pure,
	// so the values compose into an expression without an execution wire
	// threading through the arithmetic -- which is the difference between a
	// readable maths graph and a staircase.
	//
	// Node ids are unchanged from when these lived under Vectors, CFrames and
	// Engine. A graph stores ids, so folding three categories into one moved
	// nothing anybody had already placed.

	...datatype("Vector3", [
		p("roblox.vector3", "Vector3", "Vector3.new($in.x, $in.y, $in.z)",
			[num("x", "X"), num("y", "Y"), num("z", "Z")], "Vector3"),
		p("vector3.zero", "Vector3 Zero", "Vector3.zero", [], "Vector3"),
		p("vector3.one", "Vector3 One", "Vector3.one", [], "Vector3"),
		p("vector3.axis", "Vector3 Axis", "Vector3.$in.axis!ident",
			[{ ...str("axis", "Axis", "yAxis"), options: ["xAxis", "yAxis", "zAxis"] }], "Vector3",
			"A unit vector along one axis."),

		pill(p("vector3.add", "Vector3 +", "$in.a + $in.b", [vec("a", "A"), vec("b", "B")], "Vector3"), "+"),
		pill(p("vector3.sub", "Vector3 −", "$in.a - $in.b", [vec("a", "A"), vec("b", "B")], "Vector3"), "-"),
		pill(p("vector3.scale", "Vector3 × Scalar", "$in.v * $in.scalar",
			[vec("v", "Vector"), num("scalar", "Scalar", 1)], "Vector3"), "*"),
		pill(p("vector3.divide", "Vector3 ÷ Scalar", "$in.v / $in.scalar",
			[vec("v", "Vector"), num("scalar", "Scalar", 1)], "Vector3"), "/"),
		pill(p("vector3.mul", "Vector3 × Vector3", "$in.a * $in.b",
			[vec("a", "A"), vec("b", "B")], "Vector3",
			"Component by component, not a dot or cross product. Useful as a per-axis scale."), "*"),
		pill(p("vector3.negate", "Vector3 Negate", "-$in.v", [vec("v", "Vector")], "Vector3"), "-"),

		p("vector3.dot", "Dot", "$in.a:Dot($in.b)", [vec("a", "A"), vec("b", "B")], "number"),
		p("vector3.cross", "Cross", "$in.a:Cross($in.b)", [vec("a", "A"), vec("b", "B")], "Vector3"),
		p("vector3.angle", "Vector3 Angle", "$in.a:Angle($in.b)",
			[vec("a", "A"), vec("b", "B")], "number",
			"The unsigned angle between two vectors, in radians."),
		p("vector3.lerp", "Vector3 Lerp", "$in.a:Lerp($in.b, $in.alpha)",
			[vec("a", "A"), vec("b", "B"), num("alpha", "Alpha", 0.5)], "Vector3"),
		p("vector3.max", "Vector3 Max", "$in.a:Max($in.b)",
			[vec("a", "A"), vec("b", "B")], "Vector3", "The larger of each component."),
		p("vector3.min", "Vector3 Min", "$in.a:Min($in.b)",
			[vec("a", "A"), vec("b", "B")], "Vector3", "The smaller of each component."),
		p("vector3.fuzzyEq", "Vector3 Fuzzy Equals", "$in.a:FuzzyEq($in.b$opt(, ))",
			[vec("a", "A"), vec("b", "B"),
			 { ...num("epsilon", "Epsilon", 0.00001), optional: true }], "boolean",
			"Equality within a tolerance. What you want instead of `=` on anything that came out of arithmetic."),

		p("vector3.abs", "Vector3 Abs", "$in.v:Abs()", [vec("v", "Vector")], "Vector3"),
		p("vector3.ceil", "Vector3 Ceil", "$in.v:Ceil()", [vec("v", "Vector")], "Vector3"),
		p("vector3.floor", "Vector3 Floor", "$in.v:Floor()", [vec("v", "Vector")], "Vector3"),
		p("vector3.sign", "Vector3 Sign", "$in.v:Sign()", [vec("v", "Vector")], "Vector3",
			"-1, 0 or 1 per component."),

		memberPill(p("vector3.magnitude", "Magnitude", "$in.v.Magnitude", [vec("v", "Vector")], "number")),
		memberPill(p("vector3.unit", "Unit", "$in.v.Unit", [vec("v", "Vector")], "Vector3",
			"The vector scaled to length one. Undefined for a zero vector, as in Luau.")),
		p("vector3.distance", "Distance", "($in.a - $in.b).Magnitude",
			[vec("a", "A"), vec("b", "B")], "number"),
		breakInto("vector3.break", "Break Vector3", [vec("v", "Vector")], [
			{ id: "x", name: "X", type: "number", expr: "$in.v.X" },
			{ id: "y", name: "Y", type: "number", expr: "$in.v.Y" },
			{ id: "z", name: "Z", type: "number", expr: "$in.v.Z" },
		], "Splitting the pin does the same job and takes up less room."),
	]),

	...datatype("Vector2", [
		p("vector2.new", "Vector2", "Vector2.new($in.x, $in.y)",
			[num("x", "X"), num("y", "Y")], "Vector2"),
		p("vector2.zero", "Vector2 Zero", "Vector2.zero", [], "Vector2"),
		p("vector2.one", "Vector2 One", "Vector2.one", [], "Vector2"),
		p("vector2.axis", "Vector2 Axis", "Vector2.$in.axis!ident",
			[{ ...str("axis", "Axis", "yAxis"), options: ["xAxis", "yAxis"] }], "Vector2"),

		pill(p("vector2.add", "Vector2 +", "$in.a + $in.b", [v2("a", "A"), v2("b", "B")], "Vector2"), "+"),
		pill(p("vector2.sub", "Vector2 −", "$in.a - $in.b", [v2("a", "A"), v2("b", "B")], "Vector2"), "-"),
		pill(p("vector2.scale", "Vector2 × Scalar", "$in.v * $in.scalar",
			[v2("v", "Vector"), num("scalar", "Scalar", 1)], "Vector2"), "*"),
		pill(p("vector2.divide", "Vector2 ÷ Scalar", "$in.v / $in.scalar",
			[v2("v", "Vector"), num("scalar", "Scalar", 1)], "Vector2"), "/"),
		pill(p("vector2.negate", "Vector2 Negate", "-$in.v", [v2("v", "Vector")], "Vector2"), "-"),

		p("vector2.dot", "Vector2 Dot", "$in.a:Dot($in.b)", [v2("a", "A"), v2("b", "B")], "number"),
		p("vector2.cross", "Vector2 Cross", "$in.a:Cross($in.b)",
			[v2("a", "A"), v2("b", "B")], "number",
			"In two dimensions the cross product is a single number, not a vector."),
		p("vector2.angle", "Vector2 Angle", "$in.a:Angle($in.b)",
			[v2("a", "A"), v2("b", "B")], "number"),
		p("vector2.lerp", "Vector2 Lerp", "$in.a:Lerp($in.b, $in.alpha)",
			[v2("a", "A"), v2("b", "B"), num("alpha", "Alpha", 0.5)], "Vector2"),
		p("vector2.max", "Vector2 Max", "$in.a:Max($in.b)", [v2("a", "A"), v2("b", "B")], "Vector2"),
		p("vector2.min", "Vector2 Min", "$in.a:Min($in.b)", [v2("a", "A"), v2("b", "B")], "Vector2"),
		p("vector2.fuzzyEq", "Vector2 Fuzzy Equals", "$in.a:FuzzyEq($in.b$opt(, ))",
			[v2("a", "A"), v2("b", "B"),
			 { ...num("epsilon", "Epsilon", 0.00001), optional: true }], "boolean"),

		p("vector2.abs", "Vector2 Abs", "$in.v:Abs()", [v2("v", "Vector")], "Vector2"),
		p("vector2.ceil", "Vector2 Ceil", "$in.v:Ceil()", [v2("v", "Vector")], "Vector2"),
		p("vector2.floor", "Vector2 Floor", "$in.v:Floor()", [v2("v", "Vector")], "Vector2"),
		p("vector2.sign", "Vector2 Sign", "$in.v:Sign()", [v2("v", "Vector")], "Vector2"),

		memberPill(p("vector2.magnitude", "Vector2 Magnitude", "$in.v.Magnitude", [v2("v", "Vector")], "number")),
		memberPill(p("vector2.unit", "Vector2 Unit", "$in.v.Unit", [v2("v", "Vector")], "Vector2")),
		p("vector2.distance", "Vector2 Distance", "($in.a - $in.b).Magnitude",
			[v2("a", "A"), v2("b", "B")], "number"),
		breakInto("vector2.break", "Break Vector2", [v2("v", "Vector")], [
			{ id: "x", name: "X", type: "number", expr: "$in.v.X" },
			{ id: "y", name: "Y", type: "number", expr: "$in.v.Y" },
		]),
	]),

	...datatype("CFrame", [
		p("cframe.identity", "CFrame Identity", "CFrame.identity", [], "CFrame"),
		p("cframe.new", "CFrame", "CFrame.new($in.position)",
			[vec("position", "Position")], "CFrame", "A CFrame at a position, with no rotation."),
		p("cframe.lookAt", "Look At", "CFrame.lookAt($in.from, $in.to$opt(, ))",
			[vec("from", "From"), vec("to", "To"),
			 { ...vec("up", "Up"), default: { t: "raw", v: "Vector3.yAxis" }, optional: true }],
			"CFrame", "Positioned at From, facing To. The workhorse for aiming anything. Up is the engine's own default unless you set it."),
		p("cframe.angles", "CFrame Angles", "CFrame.Angles($in.rx, $in.ry, $in.rz)",
			[num("rx", "X (rad)"), num("ry", "Y (rad)"), num("rz", "Z (rad)")], "CFrame",
			"Rotation only, in radians. Pair with Rad to work in degrees."),
		p("cframe.fromAxisAngle", "From Axis Angle", "CFrame.fromAxisAngle($in.axis, $in.angle)",
			[{ ...vec("axis", "Axis"), default: { t: "raw", v: "Vector3.yAxis" } }, num("angle", "Angle (rad)")],
			"CFrame"),

		pill(p("cframe.mul", "CFrame ×", "$in.a * $in.b", [cf("a", "A"), cf("b", "B")], "CFrame",
			"Composes two CFrames. Order matters: A then B, in A's space."), "*"),
		pill(p("cframe.translate", "CFrame + Vector3", "$in.cframe + $in.offset",
			[cf("cframe", "CFrame"), vec("offset", "Offset")], "CFrame",
			"Moves in world space, leaving the rotation alone."), "+"),
		p("cframe.inverse", "Inverse", "$in.cframe:Inverse()", [cf("cframe", "CFrame")], "CFrame"),
		p("cframe.lerp", "CFrame Lerp", "$in.a:Lerp($in.b, $in.alpha)",
			[cf("a", "A"), cf("b", "B"), num("alpha", "Alpha", 0.5)], "CFrame"),

		p("cframe.toWorldSpace", "To World Space", "$in.cframe:ToWorldSpace($in.offset)",
			[cf("cframe", "CFrame"), cf("offset", "Offset")], "CFrame"),
		p("cframe.toObjectSpace", "To Object Space", "$in.cframe:ToObjectSpace($in.other)",
			[cf("cframe", "CFrame"), cf("other", "Other")], "CFrame"),
		p("cframe.pointToWorldSpace", "Point To World Space", "$in.cframe:PointToWorldSpace($in.point)",
			[cf("cframe", "CFrame"), vec("point", "Point")], "Vector3"),
		p("cframe.pointToObjectSpace", "Point To Object Space", "$in.cframe:PointToObjectSpace($in.point)",
			[cf("cframe", "CFrame"), vec("point", "Point")], "Vector3"),
		p("cframe.vectorToWorldSpace", "Vector To World Space", "$in.cframe:VectorToWorldSpace($in.vector)",
			[cf("cframe", "CFrame"), vec("vector", "Vector")], "Vector3"),
		p("cframe.vectorToObjectSpace", "Vector To Object Space", "$in.cframe:VectorToObjectSpace($in.vector)",
			[cf("cframe", "CFrame"), vec("vector", "Vector")], "Vector3",
			"A direction expressed in this CFrame's own axes. Rotation only, so a translation does not move it."),

		memberPill(p("cframe.position", "CFrame Position", "$in.cframe.Position", [cf("cframe", "CFrame")], "Vector3")),
		memberPill(p("cframe.rotation", "CFrame Rotation", "$in.cframe.Rotation", [cf("cframe", "CFrame")], "CFrame")),
		memberPill(p("cframe.lookVector", "Look Vector", "$in.cframe.LookVector", [cf("cframe", "CFrame")], "Vector3")),
		memberPill(p("cframe.rightVector", "Right Vector", "$in.cframe.RightVector", [cf("cframe", "CFrame")], "Vector3")),
		memberPill(p("cframe.upVector", "Up Vector", "$in.cframe.UpVector", [cf("cframe", "CFrame")], "Vector3")),
		breakInto("cframe.toEulerAngles", "To Euler Angles XYZ", [cf("cframe", "CFrame")], [
			{ id: "x", name: "X (rad)", type: "number", expr: "(select(1, $in.cframe:ToEulerAnglesXYZ()))" },
			{ id: "y", name: "Y (rad)", type: "number", expr: "(select(2, $in.cframe:ToEulerAnglesXYZ()))" },
			{ id: "z", name: "Z (rad)", type: "number", expr: "(select(3, $in.cframe:ToEulerAnglesXYZ()))" },
		], "The inverse of CFrame Angles. Each output wired calls ToEulerAnglesXYZ once, because a pure node is one expression per output."),
	]),

	...datatype("Color3", [
		// `Color3.fromRGB` keeps the id it had as the old Engine-category
		// "Color3" node, because a graph stores ids: renaming it would have
		// broken every project that already had one.
		p("roblox.color3", "Color3 from RGB", "Color3.fromRGB($in.r, $in.g, $in.b)",
			[num("r", "R", 255), num("g", "G", 255), num("b", "B", 255)], "Color3",
			"Channels from 0 to 255, the numbers a colour picker shows you."),
		p("color3.new", "Color3 from RGB Float", "Color3.new($in.r, $in.g, $in.b)",
			[num("r", "R", 1), num("g", "G", 1), num("b", "B", 1)], "Color3",
			"Channels from 0 to 1, which is how the engine actually stores them."),
		p("color3.fromHSV", "Color3 from HSV", "Color3.fromHSV($in.h, $in.s, $in.v)",
			[num("h", "Hue", 0), num("s", "Saturation", 1), num("v", "Value", 1)], "Color3",
			"All three from 0 to 1 — hue included, so a hue in degrees wants dividing by 360."),
		p("color3.fromHex", "Color3 from Hex", "Color3.fromHex($in.hex)",
			[str("hex", "Hex", "#ffffff")], "Color3",
			"With or without the leading #. Three-digit shorthand works too."),

		p("color3.toHex", "Color3 To Hex", "$in.color:ToHex()", [col("color", "Colour")], "string",
			"Six lowercase digits, with no leading #."),
		breakInto("color3.toHSV", "Color3 To HSV", [col("color", "Colour")], [
			{ id: "h", name: "Hue", type: "number", expr: "(select(1, $in.color:ToHSV()))" },
			{ id: "s", name: "Saturation", type: "number", expr: "(select(2, $in.color:ToHSV()))" },
			{ id: "v", name: "Value", type: "number", expr: "(select(3, $in.color:ToHSV()))" },
		], "All three from 0 to 1. Each output wired calls ToHSV once — a pure node is one expression per output, and the alternative was making a colour conversion into an execution step."),
		breakInto("color3.toRGB", "Color3 To RGB", [col("color", "Colour")], [
			{ id: "r", name: "R", type: "number", expr: "math.round($in.color.R * 255)" },
			{ id: "g", name: "G", type: "number", expr: "math.round($in.color.G * 255)" },
			{ id: "b", name: "B", type: "number", expr: "math.round($in.color.B * 255)" },
		], "Rounded to whole 0-255 channels. Round-tripping through this is lossy; To RGB Float is not."),
		breakInto("color3.toRGBFloat", "Color3 To RGB Float", [col("color", "Colour")], [
			{ id: "r", name: "R", type: "number", expr: "$in.color.R" },
			{ id: "g", name: "G", type: "number", expr: "$in.color.G" },
			{ id: "b", name: "B", type: "number", expr: "$in.color.B" },
		], "The stored channels, 0 to 1, exactly as the engine holds them."),

		p("color3.lerp", "Color3 Lerp", "$in.a:Lerp($in.b, $in.alpha)",
			[col("a", "A"), col("b", "B"), num("alpha", "Alpha", 0.5)], "Color3",
			"Blends in RGB, which is what the engine does. Fading through HSV instead means converting, lerping the hue, and converting back."),
	]),

	...datatype("BrickColor", [
		p("brickcolor.new", "BrickColor", "BrickColor.new($in.name)",
			[{ ...str("name", "Name", "Medium stone grey"), options: BRICK_COLORS }], "BrickColor",
			"By name. An unknown name does not error — the engine quietly gives you the nearest one it has."),
		p("brickcolor.fromColor3", "BrickColor from Colour", "BrickColor.new($in.color)",
			[col("color", "Colour")], "BrickColor",
			"The nearest BrickColor to an arbitrary colour. Lossy, and deliberately so: the palette is fixed."),
		p("brickcolor.fromRGB", "BrickColor from RGB Float", "BrickColor.new($in.r, $in.g, $in.b)",
			[num("r", "R", 1), num("g", "G", 1), num("b", "B", 1)], "BrickColor",
			"Channels from 0 to 1, not 0 to 255 — the one place BrickColor disagrees with the colour picker."),
		p("brickcolor.palette", "BrickColor Palette", "BrickColor.palette($in.index)",
			[num("index", "Index", 1)], "BrickColor", "By position in the Studio palette."),
		call("brickcolor.random", "Random BrickColor", ENGINE_TYPES, "BrickColor.random()",
			[], "Colour", "BrickColor",
			{ summary: "Impure: it differs every call, so it is an execution step rather than a value." }),

		p("brickcolor.color", "BrickColor Colour", "$in.brickColor.Color",
			[bcol("brickColor", "BrickColor")], "Color3",
			"The Color3 behind the name. A BrickColor is not a Color3 and cannot be used where one is wanted."),
		p("brickcolor.name", "BrickColor Name", "$in.brickColor.Name",
			[bcol("brickColor", "BrickColor")], "string"),
		p("brickcolor.number", "BrickColor Number", "$in.brickColor.Number",
			[bcol("brickColor", "BrickColor")], "number"),
	]),

	...datatype("UDim", [
		p("udim.new", "UDim", "UDim.new($in.scale, $in.offset)",
			[num("scale", "Scale"), num("offset", "Offset")], "UDim",
			"Scale is a fraction of the parent; offset is pixels. A UDim is one axis of a UDim2."),
		pill(p("udim.add", "UDim +", "$in.a + $in.b", [ud("a", "A"), ud("b", "B")], "UDim"), "+"),
		pill(p("udim.sub", "UDim −", "$in.a - $in.b", [ud("a", "A"), ud("b", "B")], "UDim"), "-"),
		breakInto("udim.break", "Break UDim", [ud("udim", "UDim")], [
			{ id: "scale", name: "Scale", type: "number", expr: "$in.udim.Scale" },
			{ id: "offset", name: "Offset", type: "number", expr: "$in.udim.Offset" },
		]),
	]),

	...datatype("UDim2", [
		p("udim2.new", "UDim2", "UDim2.new($in.xScale, $in.xOffset, $in.yScale, $in.yOffset)",
			[num("xScale", "X Scale"), num("xOffset", "X Offset"),
			 num("yScale", "Y Scale"), num("yOffset", "Y Offset")], "UDim2"),
		p("udim2.fromScale", "UDim2 from Scale", "UDim2.fromScale($in.x, $in.y)",
			[num("x", "X"), num("y", "Y")], "UDim2", "Fractions of the parent, with no pixel offset."),
		p("udim2.fromOffset", "UDim2 from Offset", "UDim2.fromOffset($in.x, $in.y)",
			[num("x", "X"), num("y", "Y")], "UDim2", "Pixels, with no scaling."),

		pill(p("udim2.add", "UDim2 +", "$in.a + $in.b", [ud2("a", "A"), ud2("b", "B")], "UDim2"), "+"),
		pill(p("udim2.sub", "UDim2 −", "$in.a - $in.b", [ud2("a", "A"), ud2("b", "B")], "UDim2"), "-"),
		p("udim2.lerp", "UDim2 Lerp", "$in.a:Lerp($in.b, $in.alpha)",
			[ud2("a", "A"), ud2("b", "B"), num("alpha", "Alpha", 0.5)], "UDim2"),

		p("udim2.x", "UDim2 X", "$in.udim2.X", [ud2("udim2", "UDim2")], "UDim"),
		p("udim2.y", "UDim2 Y", "$in.udim2.Y", [ud2("udim2", "UDim2")], "UDim"),
		p("udim2.width", "UDim2 Width", "$in.udim2.Width", [ud2("udim2", "UDim2")], "UDim",
			"The same UDim as X. Both names exist because a size and a position read differently."),
		p("udim2.height", "UDim2 Height", "$in.udim2.Height", [ud2("udim2", "UDim2")], "UDim"),
	]),

	...datatype("TweenInfo", [
		{
			id: "tweeninfo.new",
			title: "TweenInfo",
			category: ENGINE_TYPES,
			summary:
				"How a tween moves, without saying what it moves. One TweenInfo can drive " +
				"any number of tweens.",
			pure: true,
			inputs: [
				num("time", "Time", 1),
				{ ...str("style", "Easing Style", "Quad"), options: EASING_STYLES },
				{ ...str("direction", "Easing Direction", "Out"), options: EASING_DIRECTIONS },
				// Optional rather than defaulted, which is the difference
				// between `TweenInfo.new(1, style, dir)` and the same call with
				// three arguments the engine was going to supply itself.
				{ ...num("repeatCount", "Repeat Count", 0), optional: true },
				{ ...bool("reverses", "Reverses", false), optional: true },
				{ ...num("delayTime", "Delay", 0), optional: true },
			],
			outputs: [d("result", "", "TweenInfo")],
			compilesTo: {
				kind: "expr",
				outputs: {
					result:
						"TweenInfo.new($in.time, Enum.EasingStyle.$in.style!ident, " +
						"Enum.EasingDirection.$in.direction!ident$opt(, ))",
				},
			},
		},
	]),

	...datatype("Tween", [
		p("tween.property", "Tween Property", "{ [$in.name] = $in.value }",
			[str("name", "Property", "Position"), d("value", "To", "any", { t: "nil" })], "table",
			"One property and the value to reach. For several at once, wire a Make Dictionary in instead — this is the shorthand for the common case."),
		call("tween.create", "Create Tween", ENGINE_TYPES,
			'game:GetService("TweenService"):Create($in.instance, $in.info, $in.properties)',
			[d("instance", "Instance", "Instance"), tinfo("info", "Tween Info"),
			 d("properties", "Properties", "table")],
			"Tween", "Tween",
			{
				targets: ["roblox"],
				summary:
					"Builds the tween but does not start it. Nothing moves until Play, which " +
					"is what lets you create one and keep it.",
			}),
		stmt("tween.play", "Play Tween", ENGINE_TYPES, "$in.tween:Play()",
			[d("tween", "Tween", "Tween")],
			{ targets: ["roblox"], summary: "Returns immediately; the tween runs on its own. Wait on Completed to know it has finished." }),
		stmt("tween.pause", "Pause Tween", ENGINE_TYPES, "$in.tween:Pause()",
			[d("tween", "Tween", "Tween")],
			{ targets: ["roblox"], summary: "Stops where it is. Playing again carries on rather than restarting." }),
		stmt("tween.cancel", "Cancel Tween", ENGINE_TYPES, "$in.tween:Cancel()",
			[d("tween", "Tween", "Tween")],
			{ targets: ["roblox"], summary: "Stops and resets its progress, leaving the property wherever it had reached." }),
		memberPill(p("tween.completed", "Tween Completed", "$in.tween.Completed",
			[d("tween", "Tween", "Tween")], "RBXScriptSignal",
			"Wire into Connect Event to run something afterwards, or Wait For Signal to hold the thread until it finishes.")),
	]),

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
		category: "Engine",
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
	/**
	 * Require at Top: a module by the string its runtime resolves.
	 *
	 * The general form of Require Module, which is Roblox-only and builds an
	 * *instance* path. This takes the specifier verbatim, because the two
	 * runtimes resolve different things and the set is still moving: Roblox
	 * takes `./`, `../`, `@self/` and `@game/` today and says alias maps are
	 * coming; Lune takes `./`, `../`, `@lune/*` and `.luaurc` aliases.
	 *
	 * Held as text rather than parsed into parts, so a form shipping next month
	 * needs no release here.
	 */
	{
		id: "module.requireTop",
		title: "Require at Top",
		category: "Modules",
		summary:
			"Requires a module by its specifier, as a top-level local below the GetService calls. " +
			"Pure: requiring the same module twice reuses one local.",
		pure: true,
		inputs: [
			{
				...str("specifier", "Module", "@lune/fs"),
				// What this project's `.luaurc` defines, plus the runtime's own
				// prefixes. A project fact, so the list is filled at run time.
				suggest: SPECIFIER_HINTS,
				description:
					"What goes inside require(...). A prefix is required -- `@` for an alias, `./` or " +
					"`../` for a path. An unprefixed path is an error in Luau itself, not a fallback.",
			},
			{
				...str("as", "As", ""),
				description: "Name for the generated local. Defaults to the last part of the specifier.",
			},
		],
		outputs: [d("exports", "", "any")],
		compilesTo: { kind: "builtin", handler: "module.requireTop" },
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
	/**
	 * The other half of Get Field: a member of a type that says what it holds.
	 *
	 * Get Field is right for a table whose keys are the program's business --
	 * a dictionary filled and emptied as it runs -- and it can offer nothing,
	 * because there is nothing fixed to offer. This one is for the value whose
	 * type is **declared**: `Input` with `throttle`, `steer` and `aim`, or a
	 * Roblox instance, whose properties the engine fixes. The list comes from
	 * the type of whatever is wired in, and the result is typed as the member
	 * is -- so `aim` gives a Vector3 pin, and the wire from it is the colour of
	 * one.
	 *
	 * A pill, because `input.aim` is an expression with one operand and the
	 * member is the rest of it -- the same shape a cast has, which is also a
	 * value and a word about it.
	 */
	{
		...pill(
			pure("value.member", "Get Member", "Modules", "$in.object.$config.member",
				// Unnamed: the pill writes `.throttle` and a row labelled
				// "Object" beside it would be saying what the wire already says.
				[d("object", "", "any")], "any",
				"Reads a member the type declares: a field of a declared table type, or a " +
				"property of a Roblox instance. The list comes from what is wired in; for a " +
				"table whose keys change as the program runs, use Get Field."),
			".",
		),
		/**
		 * The result takes the member's own type, which the editor wrote onto
		 * the node when the member was picked.
		 *
		 * Cached there rather than worked out here, for the reason Get Local
		 * caches its type: pin derivation sees the node's config and nothing
		 * else -- not the wire, not the graph, and so not the type of what is
		 * on the other end of it.
		 */
		derivePins: (config) => ({
			inputs: [d("object", "", "any")],
			outputs: [d("result", "", pinTypeOf(config.type as string | undefined))],
		}),
	},
	{
		/**
		 * A call where a *value* is wanted, rather than a step.
		 *
		 * Call Function sits on the execution wire, so its result binds to a
		 * local and is used from there. That is right for a call that does
		 * something, and it makes one line impossible to write:
		 *
		 * ```lua
		 * return { movementSpeed = readNumber(hullSettings, "MovementSpeed") }
		 * ```
		 *
		 * There is nowhere inside a table literal to put an execution wire, so
		 * the call came out above it as `local result = ...` and the table
		 * referred to that. Correct, and not the line.
		 *
		 * Pure, so it splices into whatever reads it. The line drawn is the one
		 * the Instances section draws -- **side effects, not syntax**: this says
		 * the call is a question. A call that changes something stays on the
		 * wire, where its order is visible.
		 */
		id: "call.value",
		title: "Call For Value",
		category: "Modules",
		summary:
			"Calls a function where a value is wanted — inside a table, an argument, an " +
			"expression. No execution wire, so use Call Function when the call changes something.",
		pure: true,
		inputs: [d("fn", "Function", "function"), d("a0", "Argument", "any", { t: "nil" })],
		outputs: [d("result", "", "any")],
		compilesTo: { kind: "expr", outputs: { result: "$in.fn($args(, ))" } },
		derivePins: (config) => ({
			inputs: [d("fn", "Function", "function"), ...argPins(config)],
			outputs: [d("result", "", "any")],
		}),
	},
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

	// -- Threads -----------------------------------------------------------
	//
	// The `task` library, which is Roblox's scheduler, and Luau's `coroutine`
	// library underneath it. Reach for `task` first: it is scheduler-aware, and
	// the old globals `spawn`, `delay` and `wait` are deprecated in its favour.
	//
	// Wait leads, because it is the one everybody reaches for and because it is
	// where the rest of the library becomes relevant: the moment a graph yields
	// is the moment it has more than one thread to think about. It sat under
	// Time for a while, which is a category about dates and durations rather
	// than about the scheduler, so the node was in the wrong drawer.
	call("task.wait", "Wait", "Threads", "task.wait($in.seconds)",
		[num("seconds", "Seconds", 1)], "Elapsed", "number",
		{
			latent: true,
			summary:
				"Yields this thread for at least that long, and gives back how long it actually took. The global `wait()` is deprecated; this is its replacement.",
		}),
	variadicCall("task.spawn", "Spawn", "Threads", "task.spawn($in.fn$more(, ))",
		[d("fn", "Function", "function")], "Thread",
		"Runs the function on a new thread, **starting immediately** and continuing here when it yields or finishes. The thread is handed back so it can be cancelled."),
	variadicCall("task.defer", "Defer", "Threads", "task.defer($in.fn$more(, ))",
		[d("fn", "Function", "function")], "Thread",
		"Like Spawn, but the function does not start until the engine next resumes — use it when you want the current frame's work to finish first."),
	variadicCall("task.delay", "Delay", "Threads",
		"task.delay($in.seconds, $in.fn$more(, ))",
		[num("seconds", "Seconds", 1), d("fn", "Function", "function")], "Thread",
		"Runs the function after a delay, without yielding here. `delay()` the global is deprecated in favour of this."),
	stmt("task.cancel", "Cancel Thread", "Threads", "task.cancel($in.thread)",
		[d("thread", "Thread", "thread")],
		{
			targets: ["roblox"],
			summary:
				"Stops a thread from Spawn, Defer or Delay. Errors if the thread has already finished, so keep the reference only while it is live.",
		}),
	stmt("task.desynchronize", "Desynchronize", "Threads", "task.desynchronize()", [],
		{
			targets: ["roblox"], latent: true,
			summary:
				"Moves this thread into the parallel phase, where it may not write to the DataModel. Only meaningful inside an Actor. Yields.",
		}),
	stmt("task.synchronize", "Synchronize", "Threads", "task.synchronize()", [],
		{
			targets: ["roblox"], latent: true,
			summary: "Moves back to the serial phase, where writing is allowed again. Yields.",
		}),

	call("coroutine.create", "Create Coroutine", "Threads", "coroutine.create($in.fn)",
		[d("fn", "Function", "function")], "Thread", "thread",
		{
			summary:
				"A thread that does not start until it is resumed — the difference from Spawn, which starts at once. Luau's own primitive; `task` is the scheduler built on it.",
		}),
	call("coroutine.wrap", "Wrap Coroutine", "Threads", "coroutine.wrap($in.fn)",
		[d("fn", "Function", "function")], "Resume", "function",
		{
			summary:
				"A coroutine as a plain function: calling it resumes the thread. Errors inside propagate to the caller rather than coming back as a false, which Resume does instead.",
		}),
	variadicCall("coroutine.resume", "Resume Coroutine", "Threads",
		"coroutine.resume($in.thread$more(, ))",
		[d("thread", "Thread", "thread")], "Succeeded",
		"Runs a coroutine until it yields or finishes. Returns whether it survived — an error inside comes back as false rather than being raised here. **Only the first return value is captured**; for the rest, use Custom Code.",
		{ latent: true }),
	variadicStmt("coroutine.yield", "Yield", "Threads", "coroutine.yield($args(, ))", [],
		"Hands control back to whoever resumed this coroutine, passing values out. What comes back in on the next resume needs Custom Code to catch."),
	pure("coroutine.status", "Coroutine Status", "Threads", "coroutine.status($in.thread)",
		[d("thread", "Thread", "thread")], "string",
		"One of running, suspended, normal or dead."),
	pure("coroutine.running", "Running Coroutine", "Threads", "coroutine.running()", [], "thread",
		"The thread this code is on."),
	pure("coroutine.isYieldable", "Is Yieldable", "Threads", "coroutine.isyieldable()", [], "boolean",
		"False at the top level of a script, where there is nothing to yield to."),
	call("coroutine.close", "Close Coroutine", "Threads", "coroutine.close($in.thread)",
		[d("thread", "Thread", "thread")], "Closed", "boolean",
		{ summary: "Kills a suspended coroutine and releases what it was holding." }),

	// -- Debug -------------------------------------------------------------
	stmt("debug.print", "Print", "Debug", "print($in.value)", [d("value", "Value", "any", { t: "string", v: "Hello" })]),
	stmt("debug.warn", "Warn", "Debug", "warn($in.value)", [d("value", "Value", "any", { t: "string", v: "Warning" })]),
	stmt("debug.error", "Error", "Debug", "error($in.message, $in.level)",
		[str("message", "Message", "Something went wrong"), num("level", "Level", 1)],
		{
			summary:
				"Raises an error and stops the thread. Level 1 blames the caller, 2 blames the caller's caller, 0 attaches no position at all.",
		}),
	stmt("debug.assert", "Assert", "Debug", "assert($in.condition, $in.message)",
		[bool("condition", "Condition", true), str("message", "Message", "assertion failed")],
		{
			summary:
				"Errors when the condition is false or nil. The check runs in production too — it is a claim about your own code, not a debug-only guard.",
		}),
	pure("debug.traceback", "Traceback", "Debug", "debug.traceback($in.message, $in.level)",
		[str("message", "Message", ""), num("level", "Level", 1)], "string",
		"The call stack as a string, for logging a path to here without stopping."),
	{
		id: "code.custom",
		title: "Custom Code",
		category: "Debug",
		summary:
			"Escape hatch. The text is emitted verbatim as statements, so existing Luau can be wrapped rather than rebuilt.",
		inputs: [exec("in"), { ...d("code", "Code", LUAU, { t: "raw", v: "-- your Luau here" }), code: true }],
		outputs: [exec("then")],
		compilesTo: { kind: "statement", template: "$in.code!raw" },
	},
];
