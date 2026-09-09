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

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { FUNCTION_NODES } from "../src/core/nodes/flow.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

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
		const dict = b.node("table.dictionary", { config: { args: 1 } });
		b.lit(dict, "k0", { t: "string", v: "a" });
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
