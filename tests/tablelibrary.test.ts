/**
 * Luau's table library as nodes (0.175.0).
 *
 * Freeze, Is Frozen, Clone, Clear, Find, Sort and Table Concat join Insert and
 * Remove. An import reads a call to any of them as the node, whether the call
 * is a statement or a value, and with or without the arguments Luau lets a
 * call leave off. `return table.freeze(M)` is Freeze then Module Exports, and
 * compiles back to the one line.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

function imported(src: string, file = "Test.server.luau"): NodeScript {
	const { name, scriptClass } = graphNameOf(file);
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t" });
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

/** The compiled file below its generated banner, and its errors. */
function roundTrip(src: string, file?: string): { code: string; errors: string[] } {
	const out = compile(imported(src, file), registry);
	return {
		code: out.code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, ""),
		errors: out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message),
	};
}

const defs = (src: string, file?: string) => imported(src, file).nodes.map((n) => n.def);

describe("the table library", () => {
	it("has a node for each call", () => {
		for (const id of [
			"table.freeze",
			"table.isFrozen",
			"table.clone",
			"table.clear",
			"table.find",
			"table.sort",
			"table.concat",
		]) {
			expect(registry.get(id), id).toBeDefined();
		}
	});

	it("imports each call as its node, and compiles back to it", () => {
		const src = [
			'local names = { "b", "a" }',
			"table.sort(names)",
			"table.sort(names, function(a, b) return a > b end)",
			'print(table.concat(names), table.concat(names, ", "), table.find(names, "a"), table.find(names, "a", 2))',
			"local copy = table.clone(names)",
			"table.clear(copy)",
			"table.freeze(names)",
			"print(table.isfrozen(names))",
			"",
		].join("\n");
		const made = defs(src);
		for (const id of [
			"table.sort",
			"table.concat",
			"table.find",
			"table.clone",
			"table.clear",
			"table.freeze",
			"table.isFrozen",
		]) {
			expect(made, id).toContain(id);
		}
		const { code, errors } = roundTrip(src);
		expect(errors).toEqual([]);
		expect(code).toContain(
			'print(table.concat(names), table.concat(names, ", "), table.find(names, "a"), table.find(names, "a", 2))',
		);
		expect(code).toContain("table.freeze(names)\n");
	});

	it("reads a pure library call in a value as its node", () => {
		expect(defs("local n = math.floor(2.5)\nprint(n)\n")).toContain("math.floor");
	});

	it("writes return table.freeze(M) as the one line it was", () => {
		const src = "local M = {}\n\nreturn table.freeze(M)\n";
		expect(defs(src, "M.luau")).toContain("table.freeze");
		const { code, errors } = roundTrip(src, "M.luau");
		expect(errors).toEqual([]);
		expect(code).toBe("local M = {}\n\nreturn table.freeze(M)\n");
	});

	it("keeps a local when something runs between the step and the return", () => {
		const src = "local M = {}\nlocal frozen = table.freeze(M)\nprint(frozen)\n\nreturn frozen\n";
		const { code } = roundTrip(src, "M.luau");
		expect(code).toContain("local frozen = table.freeze(M)");
		expect(code).toContain("return frozen");
	});
});
