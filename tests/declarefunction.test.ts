/**
 * Declaring a function where the node sits, and onto a table.
 *
 * `Function` hoists to the top, which is right when a function is a thing the
 * script *has*. `Config.luau` ends on the case where it is not:
 *
 * ```lua
 * function TankConfig.read(tank: Model): Config
 * ```
 *
 * That has to come below `TankConfig`, and it is not a local at all. The graph
 * version came out as `local function read(...)` hoisted above every variable,
 * followed by `TankConfig.read = read` — the same program, and not the same
 * file, which is the whole point of a conversion you mean to compare.
 *
 * Declare Function is the other half, the way Declare Type is the other half of
 * Declare Type at Top.
 */

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bindNodeToFunction, syncFunctionRefs } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { FUNCTION_NODES } from "../src/core/nodes/flow.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/**
 * A script that declares a table, then hangs a function off it — the shape of
 * the module being converted.
 */
function onTable(options: { owner?: boolean; name?: string } = {}) {
	const b = new Builder();
	const table = b.variable("TankConfig", "table", { t: "raw", v: "{}" });

	const begin = b.node("script.begin");
	const fn = b.node("function.declareHere", {
		config: {
			name: options.name ?? "read",
			params: [{ name: "tank", type: "Model" }],
			returns: [{ name: "cfg", type: "Config" }],
		},
	});
	const ret = b.node("function.return", { config: { returns: [{ name: "cfg", type: "Config" }] } });
	b.lit(ret, "r0", { t: "raw", v: "nil" });

	b.link(begin, "then", fn, "in");
	b.link(fn, "body", ret, "in");

	if (options.owner !== false) {
		const get = b.node("variable.get", { config: { variable: table, name: "TankConfig", type: "table" } });
		b.link(get, "value", fn, "owner");
	}
	return b.build();
}

describe("Declare Function, onto a table", () => {
	/** The line the module ends on. */
	it("writes function Table.name, not a local and an assignment", () => {
		const out = code(onTable());
		expect(out).toContain("function TankConfig.read(tank: Model): Config");
		expect(out).not.toContain("TankConfig.read = ");
		expect(out).not.toContain("local function read");
	});

	it("closes the function", () => {
		expect(code(onTable())).toMatch(/function TankConfig\.read[^\n]*\n(.|\n)*?\nend/);
	});

	it("compiles without complaint", () => {
		expect(errors(onTable())).toEqual([]);
	});

	/** Unwired, it is an ordinary local function — just not a hoisted one. */
	it("is a local function when no table is wired in", () => {
		const out = code(onTable({ owner: false }));
		expect(out).toContain("local function read(tank: Model): Config");
	});

	/**
	 * Luau has no syntax for attaching a function to an expression, and
	 * `(expr).name = ...` is a different statement. Refused rather than
	 * half-written.
	 */
	it("refuses a table that is not a name", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const dict = b.node("table.dictionary", { config: { args: 1, split: { "in:p0": "keyValue" } } });
		b.lit(dict, "p0.key", { t: "string", v: "a" });
		const fn = b.node("function.declareHere", { config: { name: "read", params: [], returns: [] } });
		b.link(begin, "then", fn, "in");
		b.link(dict, "result", fn, "owner");

		expect(errors(b.build()).join(" ")).toMatch(/has to be a name/);
	});

	it("needs a name", () => {
		expect(errors(onTable({ name: "" })).join(" ")).toMatch(/needs a name/);
	});

	it("refuses a name Luau will not take", () => {
		expect(errors(onTable({ name: "2read" })).join(" ")).toMatch(/is not a name Luau will take/);
	});
});

describe("Declare Function, where it sits", () => {
	/**
	 * The reason it exists. A hoisted function goes above every variable; this
	 * one goes where you put it, so it can come after the table it needs.
	 */
	it("emits after the statements before it, not above them", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const before = b.node("debug.print");
		b.lit(before, "value", { t: "string", v: "first" });
		const fn = b.node("function.declareHere", { config: { name: "later", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "inside" });
		b.link(begin, "then", before, "in");
		b.link(before, "then", fn, "in");
		b.link(fn, "body", inner, "in");

		const out = code(b.build());
		expect(out.indexOf('print("first")')).toBeLessThan(out.indexOf("local function later"));
	});

	/** The hoisted one still hoists, so nothing built before this moved. */
	it("leaves the hoisted Function where it was", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const hoisted = b.node("function.entry", { config: { name: "early", params: [], returns: [] } });
		const hoistedBody = b.node("debug.print");
		b.lit(hoistedBody, "value", { t: "string", v: "hoisted" });
		b.link(hoisted, "then", hoistedBody, "in");

		const before = b.node("debug.print");
		b.lit(before, "value", { t: "string", v: "first" });
		b.link(begin, "then", before, "in");

		const out = code(b.build());
		expect(out.indexOf("local function early")).toBeLessThan(out.indexOf('print("first")'));
	});

	/** Flow carries on after the function, in the block the node sits in. */
	it("carries on after the end", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", { config: { name: "f", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "inside" });
		const after = b.node("debug.print");
		b.lit(after, "value", { t: "string", v: "after" });
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(fn, "then", after, "in");

		const out = code(b.build());
		expect(out.indexOf('print("inside")')).toBeLessThan(out.indexOf('print("after")'));
		expect(out).toMatch(/^print\("after"\)$/m);
	});

	/** Parameters reach the body, which is the only way they are any use. */
	it("binds its parameters inside the body", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const print = b.node("debug.print");
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", print, "in");
		b.link(fn, "p0", print, "value");

		expect(code(b.build())).toContain("print(who)");
	});

	/** Named before the body is walked, so it can call itself. */
	it("can call itself", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", { config: { name: "again", params: [], returns: [] } });
		const ref = b.node("function.get", { config: { function: undefined, name: "again" } });
		const call = b.node("call.function", { config: { args: 0 } });
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", call, "in");
		b.link(ref, "fn", call, "fn");

		// The reference has to name this node, which the Builder cannot do until
		// the id exists.
		const script = b.build();
		const refNode = script.nodes.find((n) => n.id === ref)!;
		refNode.config = { function: fn, name: "again" };

		expect(code(script)).toContain("again()");
	});

	/** Two of them cannot become one local. */
	it("keeps two functions with the same name apart", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const first = b.node("function.declareHere", { config: { name: "f", params: [], returns: [] } });
		const second = b.node("function.declareHere", { config: { name: "f", params: [], returns: [] } });
		b.link(begin, "then", first, "in");
		b.link(first, "then", second, "in");

		const declared = code(b.build()).match(/^local function (\w+)/gm) ?? [];
		expect(declared).toHaveLength(2);
		expect(new Set(declared).size).toBe(2);
	});
});

describe("its function, as a value", () => {
	/**
	 * The bug: `self` was special-cased to the hoisted node, so Declare
	 * Function's fell through to the impure check and was reported as out of
	 * scope. Which is what an impure node's *output* is outside its block, and
	 * is not what a function's name is anywhere.
	 */
	it("wires into Call Function", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "readNumber", params: [], returns: [{ name: "n", type: "number" }] },
		});
		const inner = b.node("function.return", { config: { returns: [{ name: "n", type: "number" }] } });
		b.lit(inner, "r0", { t: "number", v: 1 });
		const call = b.node("call.function", { config: { args: 0 } });

		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(fn, "then", call, "in");
		b.link(fn, "self", call, "fn");

		const script = b.build();
		expect(errors(script)).toEqual([]);
		// Nothing reads the result, so it is a statement rather than a local —
		// the ordinary rule for a call, and nothing to do with the wire.
		expect(code(script)).toMatch(/^readNumber\(\)$/m);
	});

	it("wires into Call For Value, where a value is wanted", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "roll", params: [], returns: [{ name: "n", type: "number" }] },
		});
		const inner = b.node("function.return", { config: { returns: [{ name: "n", type: "number" }] } });
		b.lit(inner, "r0", { t: "number", v: 1 });
		const call = b.node("call.value", { config: { args: 0 } });
		const print = b.node("debug.print");

		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(fn, "then", print, "in");
		b.link(fn, "self", call, "fn");
		b.link(call, "result", print, "value");

		expect(errors(b.build())).toEqual([]);
		expect(code(b.build())).toContain("print(roll())");
	});

	/** An owned function is a value too: `TankConfig.read` is a name. */
	it("gives the table-qualified name when it has an owner", () => {
		const b = new Builder();
		const table = b.variable("TankConfig", "table", { t: "raw", v: "{}" });
		const begin = b.node("script.begin");
		const get = b.node("variable.get", { config: { variable: table, name: "TankConfig", type: "table" } });
		const fn = b.node("function.declareHere", { config: { name: "read", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "x" });
		const print = b.node("debug.print");

		b.link(begin, "then", fn, "in");
		b.link(get, "value", fn, "owner");
		b.link(fn, "body", inner, "in");
		b.link(fn, "then", print, "in");
		b.link(fn, "self", print, "value");

		expect(code(b.build())).toContain("print(TankConfig.read)");
	});

	/**
	 * Read above its own declaration it does not exist yet, which is a different
	 * mistake from a function that is not in the graph and has a different fix.
	 */
	it("says so when it is read above its own declaration", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const print = b.node("debug.print");
		const fn = b.node("function.declareHere", { config: { name: "later", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "x" });

		b.link(begin, "then", print, "in");
		b.link(print, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(fn, "self", print, "value");

		expect(errors(b.build()).join(" ")).toMatch(/does not exist yet/);
	});

	/** The hoisted node's own `self` still works, which is what it was for. */
	it("has not changed for the hoisted Function", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.entry", { config: { name: "early", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "x" });
		const print = b.node("debug.print");

		b.link(fn, "then", inner, "in");
		b.link(begin, "then", print, "in");
		b.link(fn, "self", print, "value");

		expect(errors(b.build())).toEqual([]);
		expect(code(b.build())).toContain("print(early)");
	});
});

describe("Get Function can point at one", () => {
	/**
	 * The tenth place written against `"function.entry"`, and the one the other
	 * nine did not cover: the validator built its set of valid targets from that
	 * string alone. A Get Function pointing at a Declare Function was reported as
	 * pointing at "a function that is no longer in the graph" — about a node
	 * plainly on the canvas, which sends you looking for the wrong thing.
	 */
	it("does not call it a function that is no longer in the graph", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", { config: { name: "readNumber", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "x" });
		const ref = b.node("function.get");
		const call = b.node("call.function", { config: { args: 0 } });

		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(fn, "then", call, "in");
		b.link(ref, "fn", call, "fn");

		const script = b.build();
		script.nodes.find((n) => n.id === ref)!.config = { function: fn, name: "readNumber" };

		expect(errors(script)).toEqual([]);
		expect(code(script)).toMatch(/^readNumber\(\)$/m);
	});

	/** A reference to something genuinely gone is still reported. */
	it("still reports one that really is gone", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const ref = b.node("function.get", { config: { function: "deleted-id", name: "gone" } });
		const call = b.node("call.function", { config: { args: 0 } });
		b.link(begin, "then", call, "in");
		b.link(ref, "fn", call, "fn");

		expect(errors(b.build()).join(" ")).toMatch(/no longer in the graph/);
	});
});

/**
 * Everywhere that has to mean "a function".
 *
 * These went wrong one at a time. Nine places compared `def.id` against the
 * string `"function.entry"`, `FUNCTION_NODES` replaced those, and then three
 * more turned up — the validator, which reported a live Declare Function as one
 * "no longer in the graph"; `bindNodeToFunction`, so choosing one in the
 * inspector was taken and silently discarded; and `syncFunctionRefs`, so
 * renaming one left every reference showing the old name.
 *
 * The reason all three were missed is worth writing down: the grep that found
 * the first nine was piped through `head`. So this asks the *source* rather
 * than trusting a search — a comparison against that string, anywhere outside
 * the places that legitimately mean the hoisted node alone, is a bug waiting
 * for someone to build a graph that hits it.
 */
describe("nothing still means only the hoisted node", () => {
	const SOURCES = [
		"src/app/edits.ts",
		"src/app/Inspector.tsx",
		"src/app/NodeMenu.tsx",
		"src/app/luauCompletions.ts",
		"src/core/compiler/validate.ts",
	];

	it("compares against the string in none of the places that mean any function", () => {
		const offenders: string[] = [];
		for (const file of SOURCES) {
			const text = readFileSync(path.join(ROOT, file), "utf8");
			text.split("\n").forEach((line, i) => {
				if (!line.includes('"function.entry"')) return;
				// A `case` in a switch is fine: the sibling case is right beside it
				// and a reader sees both at once.
				if (line.trim().startsWith("case ")) return;
				offenders.push(`${file}:${i + 1} ${line.trim()}`);
			});
		}
		expect(offenders).toEqual([]);
	});

	/** And the switch cases that are fine are fine because both are listed. */
	it("lists both wherever it switches on one", () => {
		for (const file of SOURCES) {
			const text = readFileSync(path.join(ROOT, file), "utf8");
			if (!text.includes('case "function.entry":')) continue;
			expect(text, file).toContain('case "function.declareHere":');
		}
	});
});

describe("choosing one, and renaming it", () => {
	/** The inspector offered it, took the click, and did nothing. */
	it("can be bound to a Get Function", () => {
		const b = new Builder();
		const fn = b.node("function.declareHere", { config: { name: "readNumbers", params: [], returns: [] } });
		const ref = b.node("function.get");
		const bound = bindNodeToFunction(b.build(), ref, fn);

		expect((bound.nodes.find((n) => n.id === ref)!.config as Record<string, unknown>))
			.toEqual({ function: fn, name: "readNumbers" });
	});

	it("still refuses a node that is not a function at all", () => {
		const b = new Builder();
		const print = b.node("debug.print");
		const ref = b.node("function.get");
		const script = b.build();

		expect(bindNodeToFunction(script, ref, print)).toBe(script);
	});

	/** A rename has to reach the references, or they show a name that is gone. */
	it("keeps a reference's cached name in step with a rename", () => {
		const b = new Builder();
		const fn = b.node("function.declareHere", { config: { name: "readNumbers", params: [], returns: [] } });
		const ref = b.node("function.get", { config: { function: fn, name: "oldName" } });

		const synced = syncFunctionRefs(b.build());
		expect((synced.nodes.find((n) => n.id === ref)!.config as { name?: string }).name)
			.toBe("readNumbers");
	});
});

describe("room around a declaration", () => {
	/** Two functions run together read as one block with an `end` in the middle. */
	function twoFunctions() {
		const b = new Builder();
		const begin = b.node("script.begin");
		const first = b.node("function.declareHere", { config: { name: "one", params: [], returns: [] } });
		const firstBody = b.node("debug.print");
		b.lit(firstBody, "value", { t: "string", v: "a" });
		const second = b.node("function.declareHere", { config: { name: "two", params: [], returns: [] } });
		const secondBody = b.node("debug.print");
		b.lit(secondBody, "value", { t: "string", v: "b" });

		b.link(begin, "then", first, "in");
		b.link(first, "body", firstBody, "in");
		b.link(first, "then", second, "in");
		b.link(second, "body", secondBody, "in");
		return b.build();
	}

	it("puts a blank line between two of them", () => {
		expect(code(twoFunctions())).toContain("end\n\nlocal function two()");
	});

	/** One line, not two — `blank` does not stack. */
	it("does not stack blank lines", () => {
		expect(code(twoFunctions())).not.toMatch(/\n\n\n/);
	});

	it("separates it from the statement above it", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const before = b.node("debug.print");
		b.lit(before, "value", { t: "string", v: "x" });
		const fn = b.node("function.declareHere", { config: { name: "after", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "y" });
		b.link(begin, "then", before, "in");
		b.link(before, "then", fn, "in");
		b.link(fn, "body", inner, "in");

		expect(code(b.build())).toContain('print("x")\n\nlocal function after()');
	});

	it("separates it from the statement below it", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", { config: { name: "before", params: [], returns: [] } });
		const inner = b.node("debug.print");
		b.lit(inner, "value", { t: "string", v: "y" });
		const after = b.node("debug.print");
		b.lit(after, "value", { t: "string", v: "z" });
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", inner, "in");
		b.link(fn, "then", after, "in");

		expect(code(b.build())).toContain('end\n\nprint("z")');
	});

	/** The hoisted node already did this, and still does. */
	it("matches what a hoisted Function gets", () => {
		const b = new Builder();
		const first = b.node("function.entry", { config: { name: "one", params: [], returns: [] } });
		const firstBody = b.node("debug.print");
		b.lit(firstBody, "value", { t: "string", v: "a" });
		const second = b.node("function.entry", { config: { name: "two", params: [], returns: [] } });
		const secondBody = b.node("debug.print");
		b.lit(secondBody, "value", { t: "string", v: "b" });
		b.link(first, "then", firstBody, "in");
		b.link(second, "then", secondBody, "in");

		expect(code(b.build())).toContain("end\n\nlocal function two()");
	});
});

describe("what the node says it is", () => {
	/**
	 * Function gives its name away to the header, because a node headed
	 * `readNumber` is obviously a function. This one is one of *two* kinds of
	 * declaration, and which kind is what you are looking at it to find out.
	 */
	it("keeps its own name beside the function's", () => {
		const def = registry.get("function.declareHere")!;
		expect(def.defaultLabel?.({ name: "read" })).toBe("Declare Function (read)");
	});

	it("has no name to show until one is typed", () => {
		const def = registry.get("function.declareHere")!;
		expect(def.defaultLabel?.({})).toBeUndefined();
		expect(def.defaultLabel?.({ name: "" })).toBeUndefined();
	});

	it("shows the signature underneath, like the hoisted one", () => {
		const def = registry.get("function.declareHere")!;
		const sig = { name: "read", params: [{ name: "tank", type: "Model" }], returns: [{ name: "c", type: "Config" }] };
		expect(def.subtitle?.(sig)).toBe("(tank: Model) → Config");
		expect(def.subtitle?.(sig)).toBe(registry.get("function.entry")!.subtitle?.(sig));
	});
});

describe("both nodes count as a function", () => {
	it("is what FUNCTION_NODES is for", () => {
		expect([...FUNCTION_NODES].sort()).toEqual(["function.declareHere", "function.entry"]);
	});

	/** A Return inside the body has to belong to this function's signature. */
	it("gives a Return inside it the right returns", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "one", params: [], returns: [{ name: "n", type: "number" }] },
		});
		const ret = b.node("function.return", { config: { returns: [{ name: "n", type: "number" }] } });
		b.lit(ret, "r0", { t: "number", v: 7 });
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", ret, "in");

		expect(code(b.build())).toContain("return 7");
		expect(errors(b.build())).toEqual([]);
	});
});
