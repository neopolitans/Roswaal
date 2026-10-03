/**
 * One reading per source: the tokens, tree and errors every question about
 * the same text shares.
 */

import { describe, expect, it } from "vitest";

import { luauFile } from "../src/core/luau/file.js";
import { tokenize } from "../src/core/luau/lexer.js";
import { parseChunk } from "../src/core/luau/parser.js";

describe("luauFile", () => {
	it("reads a source as the lexer and parser do", () => {
		const src = "local x = 1\nif x then\n\tprint(x)\n";
		const file = luauFile(src);
		expect(file.tokens).toEqual(tokenize(src));
		expect(file.block).toEqual(parseChunk(src).value);
		expect(file.errors).toEqual(parseChunk(src).errors);
		expect(file.lineIndex(src.indexOf("print"))).toEqual({ line: 3, column: 2 });
	});

	it("gives the same reading for the same text, and a new one for new text", () => {
		const a = luauFile("return 1");
		expect(luauFile("return 1")).toBe(a);
		expect(luauFile("return 2")).not.toBe(a);
	});

	it("keeps only the last few sources", () => {
		const first = luauFile("local first = true");
		for (let i = 0; i < 40; i++) luauFile(`local n = ${i}`);
		expect(luauFile("local first = true")).not.toBe(first);
	});
});
