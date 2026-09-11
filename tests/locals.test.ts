/**
 * Reaching a local from somewhere its wire does not easily go.
 *
 * Found converting `Occupancy.luau`: `restores` is declared in one step of a
 * Sequence and read inside a function declared in the next. The compiler
 * already had it in scope — a wire from Declare Local's output compiled — but
 * nothing in the editor offered it. There was no Get node for a local, no entry
 * in the palette, and no completion inside Custom Code.
 */

import { describe, expect, it } from "vitest";

import { addNode, bindNodeToLocal, setLiteral, surfacesIn } from "../src/app/edits.js";
import { precedingLocals } from "../src/app/luauCompletions.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { localNameOf, typedLocalName } from "../src/core/nodes/variables.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/** Occupancy's shape: a local under Then 0, a function on a table under Then 1. */
function occupancy() {
	const b = new Builder();
	const table = b.variable("Occupancy", "table", { t: "raw", v: "{}" });

	const begin = b.node("script.begin");
	const seq = b.node("flow.sequence");
	const declare = b.node("local.declare");
	b.lit(declare, "name", { t: "string", v: "restores" });
	b.lit(declare, "value", { t: "raw", v: "{}" });

	const owner = b.node("variable.get", { config: { variable: table, name: "Occupancy", type: "table" } });
	const fn = b.node("function.declareHere", {
		config: { name: "hide", params: [{ name: "character", type: "Model" }], returns: [] },
	});
	const read = b.node("local.get", { config: { local: declare, name: "restores" } });
	const get = b.node("table.get");
	const print = b.node("debug.print");

	b.link(begin, "then", seq, "in");
	b.link(seq, "s0", declare, "in");
	b.link(seq, "s1", fn, "in");
	b.link(owner, "value", fn, "owner");
	b.link(fn, "body", print, "in");
	b.link(read, "value", get, "table");
	b.link(fn, "p0", get, "key");
	b.link(get, "result", print, "value");

	return { script: b.build(), b, declare, read, fn, print };
}

describe("Get Local", () => {
	it("reads a local from a function declared in a later step", () => {
		const { script } = occupancy();
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain("local restores = {}");
		expect(code(script)).toContain("print(restores[character])");
	});

	it("refuses a local from the other arm of a branch", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const branch = b.node("flow.branch");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "saved" });
		const read = b.node("local.get", { config: { local: declare, name: "saved" } });
		const print = b.node("debug.print");
		b.link(begin, "then", branch, "in");
		b.link(branch, "true", declare, "in");
		b.link(branch, "false", print, "in");
		b.link(read, "value", print, "value");

		expect(errors(b.build()).join(" ")).toMatch(/"saved" is not in scope here/);
	});

	/** A hoisted function is written above the main flow, before any of its locals. */
	it("refuses a main-flow local inside a hoisted Function", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "saved" });
		b.link(begin, "then", declare, "in");

		const fn = b.node("function.entry", { config: { name: "later", params: [], returns: [] } });
		const read = b.node("local.get", { config: { local: declare, name: "saved" } });
		const print = b.node("debug.print");
		b.link(fn, "then", print, "in");
		b.link(read, "value", print, "value");

		expect(errors(b.build()).join(" ")).toMatch(/not in scope/);
	});

	it("says when its Declare Local has gone", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const read = b.node("local.get", { config: { local: "gone", name: "saved" } });
		const print = b.node("debug.print");
		b.link(begin, "then", print, "in");
		b.link(read, "value", print, "value");

		expect(errors(b.build()).join(" ")).toMatch(/no longer in this graph/);
	});

	it("follows its Declare Local when the name changes", () => {
		const { script, declare, read } = occupancy();
		const renamed = setLiteral(script, declare, "name", { t: "string", v: "saved" });

		expect(renamed.nodes.find((n) => n.id === read)!.config).toMatchObject({ name: "saved" });
		expect(code(renamed)).toContain("print(saved[character])");
	});

	it("points at the graph's first local when placed", () => {
		const { script, declare } = occupancy();
		const added = addNode(script, registry.get("local.get")!, 0, 0);
		const placed = added.script.nodes.find((n) => n.id === added.id)!;
		expect(placed.config).toMatchObject({ local: declare, name: "restores" });
	});

	it("can be pointed at another", () => {
		const { script, b, read } = occupancy();
		const other = b.node("local.declare");
		b.lit(other, "name", { t: "string", v: "count" });
		const bound = bindNodeToLocal(b.build(), read, other);
		expect(bound.nodes.find((n) => n.id === read)!.config).toMatchObject({ local: other, name: "count" });
		// Pointing at something that is not a Declare Local changes nothing.
		expect(bindNodeToLocal(script, read, read)).toBe(script);
	});

	it("names an unnamed local the way the emitter does", () => {
		expect(localNameOf({ literals: { name: { t: "string", v: "  " } } })).toBe("local");
		expect(localNameOf({ label: "cache" })).toBe("cache");
		expect(localNameOf({ label: "cache", literals: { name: { t: "string", v: "saved" } } })).toBe("saved");
	});

	/**
	 * The node's header wants only the half that was typed.
	 *
	 * `localNameOf` answers "what will this local be called", and always has an
	 * answer -- the label, else `local`. The header is asking something else:
	 * "has this been named", where the fallback is not a name anybody chose and
	 * showing it would read as one.
	 */
	it("separates the name that was typed from the one fallen back to", () => {
		expect(typedLocalName({ literals: { name: { t: "string", v: "saved" } } })).toBe("saved");
		expect(typedLocalName({ literals: { name: { t: "string", v: "  " } } })).toBe("");
		expect(typedLocalName({})).toBe("");
		// A label names the local for the emitter without being a typed name.
		expect(typedLocalName({ literals: {} })).toBe("");
		expect(localNameOf({ label: "cache" })).toBe("cache");
	});
});

describe("completion inside a function declared after a local", () => {
	it("offers the local and the function's parameters in Custom Code", () => {
		const { b, fn, print } = occupancy();
		const custom = b.node("code.custom");
		b.link(print, "then", custom, "in");
		const labels = precedingLocals(b.build(), registry, custom).map((c) => c.label);

		expect(labels).toContain("restores");
		expect(labels).toContain("character");
		expect(fn).toBeDefined();
	});

	it("offers them in a Luau Expression, which runs where it is read", () => {
		const { b, print } = occupancy();
		const expr = b.node("value.expression");
		const second = b.node("debug.print");
		b.link(print, "then", second, "in");
		b.link(expr, "result", second, "value");
		const script = b.build();

		expect([...surfacesIn(script, registry, expr)]).toEqual([second]);
		const labels = precedingLocals(script, registry, expr).map((c) => c.label);
		expect(labels).toContain("restores");
		expect(labels).toContain("character");
	});

	it("offers nothing for an expression nothing reads", () => {
		const { b } = occupancy();
		const expr = b.node("value.expression");
		expect(precedingLocals(b.build(), registry, expr)).toEqual([]);
	});
});
