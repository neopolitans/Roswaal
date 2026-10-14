/**
 * Tables written out, imported as Make Dictionary (0.176.0; Node-Prioritized
 * only since 0.179.0).
 *
 * In Node-Prioritized, `{ name = value }` becomes Make Dictionary with a row
 * for each entry, a table inside it a node of its own, and compiles back to
 * the table as written: on one line or a key to a line, brackets where the
 * file had them, and the last separator as it was. Tidy, Modern and Verbatim
 * keep the table as code, and so does any table whose keys could not come
 * back as written.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, type ImportOptions, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

function imported(src: string, mode: ImportOptions["mode"] = "nodes"): NodeScript {
	const { name, scriptClass } = graphNameOf("Test.server.luau");
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t", mode });
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

function body(script: NodeScript): string {
	return compile(script, registry).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");
}

const dictionaries = (script: NodeScript) =>
	script.nodes.filter((n) => n.def === "table.dictionary");

describe("a table written out", () => {
	it("imports as Make Dictionary, a table inside it as one of its own", () => {
		const src = [
			"local icons = {",
			'\tRecruit = { File = "Crate.png", Glyph = "C" },',
			'\tMap = { File = "Map.png", Glyph = "M" },',
			"}",
			"print(icons)",
			"",
		].join("\n");
		const script = imported(src);
		expect(dictionaries(script)).toHaveLength(3);
		expect(body(script)).toBe(src);
	});

	it("keeps brackets, and the last separator, as the file wrote them", () => {
		for (const src of [
			'local rooms = { ["House"] = true, [2] = false }\nprint(rooms)\n',
			"local t = { a = 1, b = 2, }\nprint(t)\n",
			"local t = {\n\ta = 1,\n\tb = 2\n}\nprint(t)\n",
		]) {
			const script = imported(src);
			expect(dictionaries(script), src).toHaveLength(1);
			expect(body(script)).toBe(src);
		}
	});

	it("wires a value worked out, and types in one written", () => {
		const script = imported(
			'local speed = 4\nlocal t = { speed = speed * 2, name = "Scout" }\nprint(t)\n',
		);
		const dict = dictionaries(script)[0];
		expect(dict.literals?.["p1.value"]).toEqual({ t: "string", v: "Scout" });
		expect(script.links.some((l) => l.to.node === dict.id && l.to.pin === "p0.value")).toBe(true);
	});

	it("stays as code where its keys could not come back as written", () => {
		for (const src of [
			"local list = { 1, 2, 3 }\nprint(list)\n",
			'local mixed = { a = 1, ["b"] = 2 }\nprint(mixed)\n',
			"local noted = {\n\ta = 1, -- the first\n}\nprint(noted)\n",
			"local empty = {}\nprint(empty)\n",
		]) {
			const script = imported(src);
			expect(dictionaries(script), src).toHaveLength(0);
			expect(body(script)).toBe(src);
		}
	});

	it("stays as code in Tidy, Modern and Verbatim", () => {
		const src = "local t = { a = 1 }\nprint(t)\n";
		for (const mode of ["tidy", "modern", "verbatim"] as const) {
			expect(dictionaries(imported(src, mode)), mode).toHaveLength(0);
		}
		expect(dictionaries(imported(src, "nodes"))).toHaveLength(1);
	});
});
