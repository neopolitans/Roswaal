/**
 * Declaring things: `Initialize Variable`, and naming a `Declare Local`.
 *
 * Both came out of building the M103's tuning table as a graph, which is the
 * first thing anyone has built in Roswaal that a hand-written file would open
 * with. The hand-written version starts `local TUNING = { ... }`; the graph
 * could not say that at all.
 *
 * `Set Variable` gave `local Tuning: table = {}` at the top and `Tuning = {...}`
 * further down — correct, and not what anybody would write. `Initialize
 * Variable` moves the declaration to the point the value is built.
 *
 * **The constraint is the interesting part.** The declaration lands where the
 * node sits, so the node has to sit somewhere the rest of the script can see —
 * the main flow. Inside a branch, a loop or a function the `local` would go out
 * of scope and Luau would read every later mention as a nil global, silently.
 * Most of what follows is that rule refusing to be broken.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

const code = (script: NodeScript) => body(compile(script, registry).code);

describe("Initialize Variable", () => {
	/** The shape the tuning table wanted, and could not have. */
	it("is the variable's declaration, so there is no empty one above it", () => {
		const b = new Builder();
		const id = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const init = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		const value = b.node("value.expression");
		b.lit(value, "code", { t: "raw", v: "{ turnRate = 45 }" });
		b.link(start, "then", init, "in");
		b.link(value, "result", init, "value");

		const out = code(b.build());
		expect(out).toMatch(/^local Tuning[^=]*= \{ turnRate = 45 \}$/m);
		// The half that was the complaint: no `local Tuning = {}` first.
		expect(out.match(/local Tuning/g)).toHaveLength(1);
	});

	it("leaves other variables declared at the top as they were", () => {
		const b = new Builder();
		const tuning = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		b.variable("speed", "number", { t: "number", v: 44 });
		const start = b.node("script.begin");
		const init = b.node("variable.init", { config: { variable: tuning, name: "Tuning", type: "table" } });
		b.link(start, "then", init, "in");

		expect(code(b.build())).toContain("local speed: number = 44");
	});
});

/**
 * The rule, from four directions. A declaration that escapes into a block is
 * the failure this node exists to make impossible, and it fails quietly — the
 * generated Luau compiles, and the variable is nil everywhere else.
 */
describe("where it refuses to go", () => {
	function insideBranch(): NodeScript {
		const b = new Builder();
		const id = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const init = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		b.link(start, "then", branch, "in");
		b.link(branch, "true", init, "in");
		return b.build();
	}

	it("will not declare inside a branch", () => {
		expect(errors(insideBranch()).join(" ")).toContain("has to sit");
	});

	it("says what to use instead", () => {
		expect(errors(insideBranch()).join(" ")).toContain("Set Variable");
	});

	it("will not initialise the same variable twice", () => {
		const b = new Builder();
		const id = b.variable("Tuning", "table", { t: "raw", v: "{}" });
		const start = b.node("script.begin");
		const first = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		const second = b.node("variable.init", { config: { variable: id, name: "Tuning", type: "table" } });
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");

		expect(errors(b.build()).join(" ")).toContain("initialised more than once");
	});

	it("complains when it points at nothing", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const init = b.node("variable.init");
		b.link(start, "then", init, "in");
		expect(errors(b.build()).join(" ")).toContain("no variable chosen");
	});
});

describe("Declare Local", () => {
	function named(name: string) {
		const b = new Builder();
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: name });
		b.lit(declare, "value", { t: "number", v: 7 });
		b.link(start, "then", declare, "in");
		return b.build();
	}

	it("uses the name it was given", () => {
		expect(code(named("tuning"))).toContain("local tuning = 7");
	});

	/** Blank is the documented way to not care, so it must not be an error. */
	it("picks one when the name is left blank", () => {
		const out = compile(named(""), registry);
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toMatch(/^local \w+ = 7$/m);
	});

	/**
	 * An identifier is decided when the file is written, so a wire — which
	 * carries a value at runtime — has nothing to offer. Refused out loud,
	 * because a wired Name that silently did nothing is one you would only
	 * discover by testing the generated file.
	 */
	it("refuses a Name that arrives down a wire", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		const text = b.node("value.string");
		b.link(start, "then", declare, "in");
		b.link(text, "result", declare, "name");

		expect(errors(b.build()).join(" ")).toContain("typed in rather than wired");
	});

	it("keeps two locals with the same name apart", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("local.declare");
		const second = b.node("local.declare");
		for (const n of [first, second]) b.lit(n, "name", { t: "string", v: "count" });
		b.lit(first, "value", { t: "number", v: 1 });
		b.lit(second, "value", { t: "number", v: 2 });
		b.link(start, "then", first, "in");
		b.link(first, "then", second, "in");

		const out = code(b.build());
		expect(out).toContain("local count = 1");
		expect(out).not.toContain("local count = 2");
	});
});

/**
 * The tuning table is ten entries. Eight was the cap every variadic node
 * shared, and there is no way to say "a table with ten keys" by adding more
 * nodes — it has to be one node or it is not that table.
 */
describe("how big a dictionary can be", () => {
	it("takes more pairs than the old limit of eight", () => {
		const b = new Builder();
		const dict = b.node("table.dictionary", { config: { args: 10 } });
		for (let i = 0; i < 10; i++) {
			b.lit(dict, `k${i}`, { t: "string", v: `key${i}` });
			b.lit(dict, `a${i}`, { t: "number", v: i });
		}
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "tuning" });
		b.link(start, "then", declare, "in");
		b.link(dict, "result", declare, "value");

		const out = code(b.build());
		expect(out).toContain("key0 = 0");
		expect(out).toContain("key9 = 9");
	});
});

/**
 * Type declarations, which have no runtime form at all.
 *
 * A ModuleScript that hands back a table usually hands back a type with it, and
 * `export type Config = { movementSpeed: number }` was not expressible: it is
 * not a value, so there was nothing to wire. The definition is written as Luau
 * for that reason rather than as a shortcut — `{ speed: number }` describes
 * something no wire can carry.
 */
describe("Declare Type at Top", () => {
	function typeNode(config: Record<string, unknown>): NodeScript {
		const b = new Builder();
		b.node("script.begin");
		b.node("type.declareTop", { config });
		return b.build();
	}

	it("writes an export type at the top of the file", () => {
		expect(code(typeNode({ name: "Config", definition: "{ movementSpeed: number }" })))
			.toContain("export type Config = { movementSpeed: number }");
	});

	/** The case that prompted it: a type following a variable it cannot see. */
	it("takes a typeof as its definition, because the definition is Luau", () => {
		expect(code(typeNode({ name: "Tuning", definition: "typeof(Tuning)" })))
			.toContain("export type Tuning = typeof(Tuning)");
	});

	it("keeps it to the module when export is off", () => {
		const out = code(typeNode({ name: "Internal", definition: "number", export: false }));
		expect(out).toContain("type Internal = number");
		expect(out).not.toContain("export type");
	});

	it("comes before the variables, which may be annotated with it", () => {
		const b = new Builder();
		b.variable("speed", "number", { t: "number", v: 44 });
		b.node("script.begin");
		b.node("type.declareTop", { config: { name: "Speed", definition: "number" } });
		const out = code(b.build());
		expect(out.indexOf("export type Speed")).toBeLessThan(out.indexOf("local speed"));
	});

	it("is not reported as unconnected, having nothing to connect to", () => {
		const out = compile(typeNode({ name: "Config", definition: "number" }), registry);
		expect(out.diagnostics.map((d) => d.message).join(" ")).not.toContain("not connected");
	});
});

describe("what Declare Type at Top refuses", () => {
	const only = (config: Record<string, unknown>) => {
		const b = new Builder();
		b.node("script.begin");
		b.node("type.declareTop", { config });
		return errors(b.build()).join(" ");
	};

	it("wants both halves before it writes anything", () => {
		expect(only({ name: "Config" })).toContain("needs both a name and a definition");
		expect(only({ definition: "number" })).toContain("needs both a name and a definition");
	});

	/** Whatever is typed here lands in the file verbatim, so the name is checked. */
	it("will not take a name Luau would reject", () => {
		expect(only({ name: "2Fast", definition: "number" })).toContain("not a name Luau will take");
		expect(only({ name: "has space", definition: "number" })).toContain("not a name Luau will take");
	});

	it("will not declare the same type twice", () => {
		const b = new Builder();
		b.node("script.begin");
		b.node("type.declareTop", { config: { name: "Config", definition: "number" } });
		b.node("type.declareTop", { config: { name: "Config", definition: "string" } });
		expect(errors(b.build()).join(" ")).toContain("declared more than once");
	});
});

describe("Type Of", () => {
	it("is Roblox's typeof, not Lua's type", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const value = b.node("value.string");
		const kind = b.node("value.typeof");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "kind" });
		b.link(start, "then", declare, "in");
		b.link(value, "result", kind, "value");
		b.link(kind, "result", declare, "value");

		expect(code(b.build())).toMatch(/local kind = typeof\(/);
	});
});

/**
 * The in-flow one, which exists because of a single line in the M103's
 * hand-written Config module:
 *
 *     local TUNING = { ... }
 *     export type Tuning = typeof(TUNING)
 *
 * A type built from `typeof` has to come *after* the thing it is the type of,
 * and a node that always hoists to the top of the file can never do that.
 * Splitting it in two was the author's suggestion and is the right shape: one
 * node hoists, the other sits where you put it.
 *
 * The value arrives by wire rather than as typed text, so the identifier in the
 * generated file is the one the compiler actually chose — renaming the local
 * later cannot leave the type pointing at a name that is gone.
 */
describe("Declare Type, in the flow", () => {
	function afterLocal(config: Record<string, unknown>, localName = "Tuning") {
		const b = new Builder();
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		const type = b.node("type.declareHere", { config });
		b.lit(declare, "name", { t: "string", v: localName });
		b.lit(declare, "value", { t: "raw", v: "{ turnRate = 45 }" });
		b.link(start, "then", declare, "in");
		b.link(declare, "then", type, "in");
		b.link(declare, "ref", type, "value");
		return b.build();
	}

	/** The exact pair of lines the native module opens with. */
	it("names the type of the local above it", () => {
		const out = code(afterLocal({ name: "Tuning" }));
		expect(out).toContain("local Tuning = { turnRate = 45 }");
		expect(out).toContain("export type Tuning = typeof(Tuning)");
	});

	it("comes after the value, not at the top", () => {
		const out = code(afterLocal({ name: "Tuning" }));
		expect(out.indexOf("local Tuning")).toBeLessThan(out.indexOf("export type Tuning"));
	});

	/** The identifier is the compiler's, so a renamed local cannot strand it. */
	it("follows the identifier the compiler chose, not the one you typed", () => {
		expect(code(afterLocal({ name: "Config" }, "settings")))
			.toContain("export type Config = typeof(settings)");
	});

	it("keeps it to the module when export is off", () => {
		const out = code(afterLocal({ name: "Tuning", export: false }));
		expect(out).toContain("type Tuning = typeof(Tuning)");
		expect(out).not.toContain("export type");
	});

	it("wants a name", () => {
		expect(errors(afterLocal({})).join(" ")).toContain("needs a name");
	});

	/**
	 * `export type` is only legal at the top level of a module. A plain `type`
	 * inside a block is fine and stays scoped to it, so only the export is
	 * refused — the node is still useful in there.
	 */
	it("will not export from inside a branch", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const value = b.node("value.number");
		const type = b.node("type.declareHere", { config: { name: "Inner" } });
		b.link(start, "then", branch, "in");
		b.link(branch, "true", type, "in");
		b.link(value, "result", type, "value");

		expect(errors(b.build()).join(" ")).toContain("only allows that at the top level");
	});

	it("allows a plain type inside a branch", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const value = b.node("value.number");
		const type = b.node("type.declareHere", { config: { name: "Inner", export: false } });
		b.link(start, "then", branch, "in");
		b.link(branch, "true", type, "in");
		b.link(value, "result", type, "value");

		expect(errors(b.build())).toEqual([]);
	});

	/** One namespace, whichever node declared it. */
	it("collides with a type declared at the top", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const value = b.node("value.number");
		const type = b.node("type.declareHere", { config: { name: "Config" } });
		b.node("type.declareTop", { config: { name: "Config", definition: "number" } });
		b.link(start, "then", type, "in");
		b.link(value, "result", type, "value");

		expect(errors(b.build()).join(" ")).toContain("declared more than once");
	});
});

/**
 * A table type built from a list of fields rather than typed out.
 *
 * `{ movementSpeed: number, hp: number }` is a list of pairs written on one
 * line, and a list of pairs is what an editor is good at. The written-out box
 * stays for everything the shape cannot say — unions, function types, generics
 * — which is most of Luau's type language and not worth a second grammar.
 */
describe("a type built from fields", () => {
	const fromFields = (fields: { name: string; type: string }[], extra = {}) => {
		const b = new Builder();
		b.node("script.begin");
		b.node("type.declareTop", { config: { name: "Config", fields, ...extra } });
		return b.build();
	};

	it("writes the pairs out as a table type", () => {
		expect(code(fromFields([
			{ name: "movementSpeed", type: "number" },
			{ name: "hp", type: "number" },
		]))).toContain("export type Config = { movementSpeed: number, hp: number }");
	});

	/** Free text, because a closed list could not offer `Instance?` or `{ Player }`. */
	it("takes any Luau type text for a field", () => {
		expect(code(fromFields([{ name: "parts", type: "{ BasePart }" }])))
			.toContain("export type Config = { parts: { BasePart } }");
	});

	it("refuses a field name Luau would not take", () => {
		expect(errors(fromFields([{ name: "2fast", type: "number" }])).join(" "))
			.toContain("not a name Luau will take for a field");
	});

	it("refuses a field with half of itself missing", () => {
		expect(errors(fromFields([{ name: "speed", type: "" }])).join(" "))
			.toContain("no name or no type");
	});

	/**
	 * The escape hatch has to win when it is chosen, or a node that has both —
	 * because you filled in fields and then switched — would emit the wrong one.
	 */
	it("uses the written definition when that shape is chosen", () => {
		const out = code(fromFields(
			[{ name: "speed", type: "number" }],
			{ shape: "written", definition: '"idle" | "driving"' },
		));
		expect(out).toContain('export type Config = "idle" | "driving"');
		expect(out).not.toContain("speed");
	});

	/** Nodes made before the field list existed carry only a definition. */
	it("still writes a definition from a node with no fields at all", () => {
		const b = new Builder();
		b.node("script.begin");
		b.node("type.declareTop", { config: { name: "Config", definition: "number" } });
		expect(code(b.build())).toContain("export type Config = number");
	});
});

/**
 * How a string key is written.
 *
 * `TankConfig["tuning"] = TUNING` and `TankConfig.tuning = TUNING` are the same
 * assignment and Luau takes both — but only one of them is what anybody writes,
 * and the generated file is read beside hand-written Luau. Which one reads
 * better depends on the table, so it is a setting on the node rather than a
 * rule in the compiler.
 *
 * The cases that must stay bracketed matter more than the ones that shorten:
 * getting those wrong emits Luau that does not compile.
 */
describe("string keys, plain or bracketed", () => {
	function dictionary(key: string, keys?: string) {
		const b = new Builder();
		const dict = b.node("table.dictionary", { config: { args: 1, ...(keys ? { keys } : {}) } });
		b.lit(dict, "k0", { t: "string", v: key });
		b.lit(dict, "a0", { t: "number", v: 1 });
		const start = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "t" });
		b.link(start, "then", declare, "in");
		b.link(dict, "result", declare, "value");
		return code(b.build());
	}

	it("writes a plain name plainly", () => {
		expect(dictionary("turnRate")).toContain("{ turnRate = 1 }");
	});

	it("brackets it when asked to", () => {
		expect(dictionary("turnRate", "brackets")).toContain('{ ["turnRate"] = 1 }');
	});

	it("brackets a key with a space in it, whatever the setting", () => {
		expect(dictionary("turn rate")).toContain('["turn rate"] = 1');
	});

	it("brackets a key that starts with a digit", () => {
		expect(dictionary("2fast")).toContain('["2fast"] = 1');
	});

	/** `t.end` does not compile. */
	it("brackets a reserved word", () => {
		expect(dictionary("end")).toContain('["end"] = 1');
	});

	function setIndex(keyLiteral: { t: string; v: unknown } | null, keys?: string) {
		const b = new Builder();
		const start = b.node("script.begin");
		const table = b.node("table.new");
		const set = b.node("table.set", { config: keys ? { keys } : {} });
		b.link(start, "then", table, "in");
		b.link(table, "then", set, "in");
		b.link(table, "result", set, "table");
		if (keyLiteral) b.lit(set, "key", keyLiteral as never);
		else {
			const computed = b.node("value.string");
			b.link(computed, "result", set, "key");
		}
		b.lit(set, "value", { t: "number", v: 1 });
		return code(b.build());
	}

	it("writes Set Index as a dot", () => {
		expect(setIndex({ t: "string", v: "tuning" })).toMatch(/\.tuning = 1$/m);
	});

	it("brackets Set Index when asked to", () => {
		expect(setIndex({ t: "string", v: "tuning" }, "brackets")).toContain('["tuning"] = 1');
	});

	/** A key that is worked out at runtime has no name to write. */
	it("brackets a computed key, which has no plain form", () => {
		expect(setIndex(null)).toContain("[");
	});
});
