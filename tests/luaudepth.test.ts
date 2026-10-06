/**
 * Luau nested deeper than the parser reads is a syntax error, not a crash.
 *
 * The parser is recursive. Text nested deeply enough -- brackets, blocks,
 * tables, calls, types -- would run the stack out, and every place that reads
 * Luau would throw: Import as graph, the editor's checking and completion, a
 * pack's hover. Past `MAX_DEPTH` it says so once and reads on.
 */

import { describe, expect, it } from "vitest";

import { importLuau } from "../src/core/import/fromLuau.js";
import { checkLuau } from "../src/core/luau/check.js";
import { MAX_DEPTH, parseChunk, parseExpression, parseType } from "../src/core/luau/parser.js";

const DEEP = 20_000;

const SHAPES: [string, (n: number) => string][] = [
	["brackets", (n) => `local x = ${"(".repeat(n)}1${")".repeat(n)}`],
	["blocks", (n) => `${"do ".repeat(n)}${"end ".repeat(n)}`],
	["tables", (n) => `local t = ${"{".repeat(n)}${"}".repeat(n)}`],
	["calls", (n) => `local x = ${"f(".repeat(n)}1${")".repeat(n)}`],
	["types", (n) => `type T = ${"{ x: ".repeat(n)}number${" }".repeat(n)}`],
];

const tooDeep = (message: string) => message.includes(`more than ${MAX_DEPTH} deep`);

describe.each(SHAPES)("%s nested too deeply", (_shape, make) => {
	it("is one error rather than a thrown stack overflow", () => {
		const { errors } = parseChunk(make(DEEP));
		expect(errors.filter((e) => tooDeep(e.message))).toHaveLength(1);
	});

	it("still parses cleanly up to the limit", () => {
		expect(parseChunk(make(MAX_DEPTH - 10)).errors).toEqual([]);
	});
});

describe("the rest of the file", () => {
	it("is still read after the part that is too deep", () => {
		const source = `local a = ${"(".repeat(DEEP)}1${")".repeat(DEEP)}\nlocal b = = 2\n`;
		const { errors } = parseChunk(source);
		expect(errors.some((e) => tooDeep(e.message))).toBe(true);
		// The mistake on the next line is still found.
		expect(errors.length).toBeGreaterThan(1);
	});
});

describe("every way Luau is read", () => {
	const deep = `${"(".repeat(DEEP)}1${")".repeat(DEEP)}`;

	it("answers with a syntax error when checking a value or a type", () => {
		expect(parseExpression(deep).errors.some((e) => tooDeep(e.message))).toBe(true);
		expect(parseType(`${"{ x: ".repeat(DEEP)}number${" }".repeat(DEEP)}`).errors.length).toBe(1);
		expect(checkLuau(`local x = ${deep}`, "block").some((p) => tooDeep(p.message))).toBe(true);
	});

	it("imports without throwing", () => {
		expect(() =>
			importLuau(`local x = ${deep}\n`, { name: "Deep", scriptClass: "Script", target: "roblox" }),
		).not.toThrow();
	});
});
