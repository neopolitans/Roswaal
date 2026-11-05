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
import { compile } from "../src/core/compiler/index.js";
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
