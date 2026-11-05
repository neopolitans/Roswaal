/**
 * Make Array: a list written out in one node, `{ a, b, c }` (0.206.0).
 *
 * The array half of a table constructor, which Make Dictionary is the keyed
 * half of. The case that asked for it is a function that hands back a list of
 * one thing -- `return { rig.model }` -- which was New Table and Insert, or
 * Luau typed in.
 */

import { describe, expect, it } from "vitest";

import { aliasScore } from "../src/core/aliases.js";
import { elementOf, retypeArrays } from "../src/core/arrayTypes.js";
import { compile } from "../src/core/compiler/index.js";
import { typesCompatible } from "../src/core/compiler/validate.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { growthRule } from "../src/core/nodes/growth.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const array = registry.get("table.array")!;
const code = (script: NodeScript) => body(compile(script, registry).code);

describe("Make Array", () => {
	it("returns a new list from a function, as written by hand", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: {
				name: "ownParts",
				params: [{ name: "rig", type: "table" }],
				returns: [{ name: "parts", type: "table" }],
			},
		});
		const ret = b.node("function.return", {
			graph: fn,
			config: { returns: [{ name: "parts", type: "table" }] },
		});
		const model = b.node("table.getKey", { graph: fn });
		b.lit(model, "key", { t: "string", v: "model" });
		const list = b.node("table.array", { graph: fn });
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", ret, "in");
		b.link(fn, "p0", model, "table");
		b.link(model, "result", list, "a0");
		b.link(list, "result", ret, "r0");
		expect(code(b.build())).toContain("return { rig.model }");
	});

	it("writes each value in order, typed in or wired", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const list = b.node("table.array", { config: { args: 3 } });
		b.lit(list, "a0", { t: "string", v: "Hull" });
		b.lit(list, "a1", { t: "number", v: 2 });
		b.lit(list, "a2", { t: "boolean", v: true });
		const p = b.node("debug.print");
		b.link(begin, "then", p, "in");
		b.link(list, "result", p, "value");
		expect(code(b.build())).toContain('print({ "Hull", 2, true })');
	});

	it("numbers its pins by index, and grows by values", () => {
		expect(resolveNodePins(array, { args: 3 }).inputs.map((p) => [p.id, p.name])).toEqual([
			["a0", "1"],
			["a1", "2"],
			["a2", "3"],
		]);
		expect(growthRule(array)).toMatchObject({ prefix: "a", one: "value", min: 1 });
	});

	it("is found by array, list and table literal", () => {
		for (const query of ["array", "list", "table literal"]) {
			expect(aliasScore("table.array", query), query).toBeGreaterThan(0);
		}
	});
});

describe("a list written out, imported", () => {
	function imported(src: string): NodeScript {
		const { name, scriptClass } = graphNameOf("Test.server.luau");
		const result = importLuau(src, {
			name,
			scriptClass,
			target: "roblox",
			idPrefix: "t",
			mode: "nodes",
		});
		if (!result.ok) throw new Error(result.error);
		return result.script;
	}
	const arrays = (script: NodeScript) => script.nodes.filter((n) => n.def === "table.array");
	const out = (script: NodeScript) =>
		compile(script, registry).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");

	it("becomes Make Array, and compiles back to the file", () => {
		const src = 'local speed = 4\nlocal list = { speed, "Scout", speed * 2 }\nprint(list)\n';
		const script = imported(src);
		expect(arrays(script)).toHaveLength(1);
		expect(out(script)).toBe(src);
	});

	it("stays as code when it is not written as the node writes it", () => {
		for (const src of [
			"local tight = {1, 2}\nprint(tight)\n",
			"local trailing = { 1, 2, }\nprint(trailing)\n",
			"local lines = {\n\t1,\n\t2,\n}\nprint(lines)\n",
			"local noted = { 1, --[[ two ]] 2 }\nprint(noted)\n",
		]) {
			const script = imported(src);
			expect(arrays(script), src).toHaveLength(0);
			expect(out(script)).toBe(src);
		}
	});
});

/**
 * What the list holds, from what goes into it (0.207.0): `{ Model }` rather
 * than a table that says nothing, so a function can return `{ Instance }`.
 */
describe("what a Make Array holds", () => {
	it("is the one type its values share, and a plain table otherwise", () => {
		expect(elementOf(["string", "string"])).toBe("string");
		expect(elementOf(["Part", "BasePart"])).toBe("BasePart");
		expect(elementOf(["Model", "Part"])).toBe("Instance");
		expect(elementOf(["string", "number"])).toBeUndefined();
		expect(elementOf(["Model", "any"])).toBeUndefined();
	});

	it("goes where any table does, and into a list of what it derives from", () => {
		expect(typesCompatible("{ Model }", "table")).toBe(true);
		expect(typesCompatible("{ Model }", "{ Instance }")).toBe(true);
		expect(typesCompatible("{ Instance }", "{ Model }")).toBe(false);
		expect(typesCompatible("table", "{ Model }")).toBe(false);
	});

	/** Rig's `ownParts`, typed as the hand-written one is. */
	it("returns { Instance } from a function that says it does", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: {
				name: "ownParts",
				params: [{ name: "model", type: "Model" }],
				returns: [{ name: "parts", type: "{ Instance }" }],
			},
		});
		const ret = b.node("function.return", {
			graph: fn,
			config: { returns: [{ name: "parts", type: "{ Instance }" }] },
		});
		const list = b.node("table.array", { graph: fn });
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", ret, "in");
		b.link(fn, "p0", list, "a0");
		b.link(list, "result", ret, "r0");
		const result = compile(b.build(), registry);
		expect(result.diagnostics).toEqual([]);
		expect(body(result.code)).toContain(
			"local function ownParts(model: Model): { Instance }\n\treturn { model }\nend",
		);
		const typed = retypeArrays(b.build(), registry).nodes.find((n) => n.id === list);
		expect(resolveNodePins(array, typed?.config).outputs[0].type).toBe("{ Model }");
	});
});
