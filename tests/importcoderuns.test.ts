/**
 * One Code Block for a run of code (0.181.0).
 *
 * In Tidy and Modern, statements kept as code one after another share a Code
 * Block, up to the six lines its face shows, and compile back as the file had
 * them. A statement with a comment starts a block, which the run after it
 * joins: the comment heads it, as a comment over a paragraph does. The import setting turns it off; Verbatim and
 * Node-Prioritized keep a block each.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, type ImportOptions, importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

function imported(src: string, options: Partial<ImportOptions> = {}): NodeScript {
	const { name, scriptClass } = graphNameOf("Test.server.luau");
	const result = importLuau(src, {
		name,
		scriptClass,
		target: "roblox",
		idPrefix: "t",
		...options,
	});
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

const body = (s: NodeScript) =>
	compile(s, registry, { comments: true }).code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");
const blocks = (s: NodeScript) => s.nodes.filter((n) => n.def === "code.custom");

/** `count` statements Tidy keeps as code: several names set at once. */
const kept = (count: number) =>
	Array.from({ length: count }, (_, i) => `local a${i}, b${i} = ${i}, ${i + 1}`).join("\n");

describe("a run of code", () => {
	it("shares one Code Block, and compiles back as the file had it", () => {
		const src = `${kept(3)}\nprint(a0)\n`;
		const script = imported(src);
		expect(blocks(script)).toHaveLength(1);
		expect(body(script)).toBe(src);
	});

	it("keeps a blank line inside the block", () => {
		const src = "local a, b = 1, 2\n\nlocal c, d = 3, 4\nprint(a)\n";
		const script = imported(src);
		expect(blocks(script)).toHaveLength(1);
		expect(body(script)).toBe(src);
	});

	it("starts a new block past the six lines a face shows", () => {
		const src = `${kept(8)}\nprint(a0)\n`;
		const script = imported(src);
		const lines = blocks(script).map((n) => {
			const code = n.literals?.code;
			return code && "v" in code ? String(code.v).split("\n").length : 0;
		});
		expect(lines).toEqual([6, 2]);
		expect(body(script)).toBe(src);
	});

	it("starts a block at a statement with a comment, which the run after it joins", () => {
		const src =
			"local a, b = 1, 2\n\n-- the second pair\nlocal c, d = 3, 4\nlocal e, f = 5, 6\nprint(a)\n";
		const script = imported(src);
		expect(blocks(script)).toHaveLength(2);
		expect(script.comments).toHaveLength(1);
		expect(body(script)).toBe(src);
	});

	it("stays a block each when the setting is off, and in Verbatim and Node-Prioritized", () => {
		const src = `${kept(3)}\nprint(a0)\n`;
		expect(blocks(imported(src, { codeRuns: false }))).toHaveLength(3);
		expect(blocks(imported(src, { mode: "verbatim" }))).toHaveLength(3);
		expect(blocks(imported(src, { mode: "nodes" }))).toHaveLength(3);
		expect(blocks(imported(src, { mode: "modern" }))).toHaveLength(1);
	});

	it("is recorded with the import's settings, for Reimport", () => {
		expect(imported(kept(2), { codeRuns: false }).importedAs).toEqual({
			mode: "tidy",
			locals: "variable",
			codeRuns: false,
		});
		expect(imported(kept(2), { mode: "verbatim" }).importedAs).toEqual({
			mode: "verbatim",
			locals: "variable",
		});
	});
});
