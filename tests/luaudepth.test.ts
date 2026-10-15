/**
 * Luau nested deeper than the parser reads is a syntax error, not a crash,
 * and so is a graph nested deeper than the compiler writes.
 *
 * The parser is recursive. Text nested deeply enough -- brackets, blocks,
 * tables, calls, types -- would run the stack out, and every place that reads
 * Luau would throw: Import as graph, the editor's checking and completion, a
 * pack's hover. Past `MAX_DEPTH` it says so once and reads on.
 */

import { describe, expect, it } from "vitest";
import { MAX_GRAPH_DEPTH } from "../src/core/compiler/emitter.js";
import { compile } from "../src/core/compiler/index.js";
import { importLuau } from "../src/core/import/fromLuau.js";
import { argumentProblems } from "../src/core/luau/argumentTypes.js";
import { checkLuau } from "../src/core/luau/check.js";
import { hoverAt } from "../src/core/luau/hover.js";
import { MAX_DEPTH, parseChunk, parseExpression, parseType } from "../src/core/luau/parser.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

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

/**
 * Chains are read in a loop, not by recursion, but the tree they make is as
 * deep as they are long, and what walks the tree recurses: the checks behind
 * hover, completion and a Code Block's warnings, and Import as graph. A chain
 * taller than `MAX_DEPTH` is the same syntax error as nesting that deep.
 */
const CHAINS: [string, (n: number) => string][] = [
	["fields", (n) => `local x = workspace${".a".repeat(n)}\n`],
	["methods", (n) => `workspace${":f()".repeat(n)}:MoveTo(1)\n`],
	["calls", (n) => `local x = f${"()".repeat(n)}\n`],
	["sums", (n) => `local x = ${Array(n).fill("1").join(" + ")}\n`],
	["ands", (n) => `local x = ${Array(n).fill("a").join(" and ")}\n`],
	["casts", (n) => `local x = a${" :: any".repeat(n)}\n`],
	["optionals", (n) => `type T = number${"?".repeat(n)}\n`],
];

describe.each(CHAINS)("a chain of %s too long", (_shape, make) => {
	const source = make(DEEP);

	it("is one error rather than a thrown stack overflow", () => {
		const { errors } = parseChunk(source);
		expect(errors.filter((e) => tooDeep(e.message))).toHaveLength(1);
	});

	it("still parses cleanly up to the limit", () => {
		expect(parseChunk(make(MAX_DEPTH - 10)).errors).toEqual([]);
	});

	it("is answered, not thrown, by hover, the argument check and import", () => {
		expect(() => hoverAt(source, source.length - 4)).not.toThrow();
		expect(() => argumentProblems(source, "block")).not.toThrow();
		const imported = importLuau(source, { name: "Deep", scriptClass: "Script", target: "roblox" });
		expect(imported.ok).toBe(false);
	});

	it("is a problem in the Code Block that holds it, not a crash of the compile", () => {
		const b = new Builder("Main");
		const code = b.node("code.custom");
		b.lit(code, "code", { t: "raw", v: source });
		b.link(b.node("script.begin"), "then", code, "in");
		const result = compile(b.build(), registry, {});
		expect(result.ok).toBe(false);
		expect(result.diagnostics.some((d) => d.node === code && tooDeep(d.message))).toBe(true);
	});
});

describe("chains inside brackets inside chains", () => {
	it("count the whole height, not each chain on its own", () => {
		// Four hundred bracketed chains of a hundred: each short, together 40,000 deep.
		let fields = "a";
		let sums = "1";
		for (let i = 0; i < 400; i++) {
			fields = `(${fields})${".a".repeat(100)}`;
			sums = `(${sums}${" + 1".repeat(100)})`;
		}
		for (const source of [`local x = ${fields}\n`, `local x = ${sums}\n`]) {
			expect(parseChunk(source).errors.some((e) => tooDeep(e.message))).toBe(true);
			expect(() => hoverAt(source, source.length - 4)).not.toThrow();
		}
	});
});

describe("a graph nested too deeply", () => {
	const tooDeepToCompile = (message: string) =>
		message.includes(`more than ${MAX_GRAPH_DEPTH} deep, which is too deep to compile`);

	/** `count` Branches, each in the True of the one before. */
	const branches = (count: number) => {
		const b = new Builder("Main");
		let from = b.node("script.begin");
		let pin = "then";
		for (let i = 0; i < count; i++) {
			const branch = b.node("flow.branch");
			b.lit(branch, "condition", { t: "boolean", v: true });
			b.link(from, pin, branch, "in");
			from = branch;
			pin = "true";
		}
		return b.build();
	};

	it("is one problem, not a stack overflow, for bodies within bodies", () => {
		const result = compile(branches(2000), registry, {});
		expect(result.ok).toBe(false);
		expect(result.diagnostics.filter((d) => tooDeepToCompile(d.message))).toHaveLength(1);
	});

	it("is one problem for values read from values", () => {
		const b = new Builder("Main");
		const print = b.node("debug.print");
		b.link(b.node("script.begin"), "then", print, "in");
		let value = b.node("math.add");
		for (let i = 0; i < 2000; i++) {
			const add = b.node("math.add");
			b.link(value, "result", add, "a0");
			value = add;
		}
		b.link(value, "result", print, "value");
		const result = compile(b.build(), registry, {});
		expect(result.ok).toBe(false);
		expect(result.diagnostics.filter((d) => tooDeepToCompile(d.message))).toHaveLength(1);
	});

	it("still compiles a graph nested within the limit", () => {
		const result = compile(branches(MAX_GRAPH_DEPTH - 10), registry, {});
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});
