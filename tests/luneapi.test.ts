/**
 * The Lune standard library catalogue.
 *
 * Generated from the `types.d.luau` files Lune ships, so what is worth testing
 * is not "does the data look plausible" — it came from Lune — but the two ways
 * a generated catalogue goes wrong: it is **regenerated badly**, or it is
 * **regenerated against a different version** and nothing says so.
 *
 * The spot checks below are signatures chosen because a parser that broke would
 * break them: one plain function, one with an optional argument, one generic,
 * one returning nothing, and one method that Lune declares with no doc block at
 * all — which an earlier parser dropped silently, along with two of its
 * siblings, while reporting nothing missing.
 */

import { describe, expect, it } from "vitest";

import { LUNE_MODULES, LUNE_VERSION, type LuneFunction } from "../src/core/luneApi.js";

const byAlias = new Map(LUNE_MODULES.map((module) => [module.alias, module]));

function fn(alias: string, name: string): LuneFunction | undefined {
	return byAlias.get(alias)?.functions.find((one) => one.name === name);
}

function method(alias: string, className: string, name: string): LuneFunction | undefined {
	return byAlias.get(alias)?.classes
		.find((one) => one.name === className)?.methods
		.find((one) => one.name === name);
}

describe("which Lune it describes", () => {
	/** A catalogue that cannot say which version it is is a catalogue of nothing. */
	it("records the release it was built from", () => {
		expect(LUNE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("has the ten standard library modules", () => {
		expect([...byAlias.keys()].sort()).toEqual([
			"datetime", "fs", "luau", "net", "process",
			"regex", "roblox", "serde", "stdio", "task",
		]);
	});

	it("gives every module something to offer", () => {
		for (const module of LUNE_MODULES) {
			const methods = module.classes.reduce((sum, one) => sum + one.methods.length, 0);
			expect(module.functions.length + methods, module.alias).toBeGreaterThan(0);
			expect(module.what, module.alias).not.toBe("");
		}
	});
});

describe("what it captured", () => {
	it("reads a plain signature", () => {
		const read = fn("fs", "readFile");
		expect(read?.params).toEqual([
			{ name: "path", type: "string", optional: false, what: "The path to the file to read" },
		]);
		expect(read?.returns).toBe("string");
		// Lune says the point of this call is the value, which is what makes it
		// a pure node rather than one on the execution chain.
		expect(read?.mustUse).toBe(true);
	});

	it("keeps an optional argument optional", () => {
		const wait = fn("task", "wait");
		expect(wait?.params[0]).toMatchObject({ name: "duration", type: "number", optional: true });
	});

	/** Four of `task`'s five are generic, and a parser once found one of them. */
	it("reads a generic signature", () => {
		for (const name of ["spawn", "defer", "delay"]) {
			expect(fn("task", name), name).toBeDefined();
		}
		expect(fn("task", "spawn")?.returns).toBe("thread");
	});

	it("knows a call that returns nothing", () => {
		const write = fn("fs", "writeFile");
		expect(write?.returns).toBe("");
		expect(write?.mustUse).toBe(false);
	});

	/**
	 * A module's own functions and the methods of the types it hands back are
	 * different things: `regex.new` gives you a `Regex`, and `find` is asked of
	 * that value rather than of the module.
	 */
	it("keeps a class's methods off the module", () => {
		expect(byAlias.get("regex")?.functions.map((one) => one.name)).toEqual(["new"]);
		expect(method("regex", "Regex", "find")).toBeDefined();
	});

	/** Declared with no doc block. Three of these were dropped in silence. */
	it("takes a function Lune documents nowhere", () => {
		const get = method("regex", "RegexCaptures", "get");
		expect(get).toBeDefined();
		expect(get?.summary).toBe("");
		// `self` is the receiver, not an argument anybody passes.
		expect(get?.params.map((one) => one.name)).toEqual(["index"]);
	});

	it("carries Lune's own words for a parameter", () => {
		expect(fn("fs", "writeFile")?.params[1].what).toBe("The contents of the file");
	});
});

describe("as node definitions will read it", () => {
	it("names every parameter and every function", () => {
		for (const module of LUNE_MODULES) {
			const all = [...module.functions, ...module.classes.flatMap((one) => one.methods)];
			for (const one of all) {
				expect(one.name, module.alias).toMatch(/^\w+$/);
				for (const param of one.params) {
					expect(param.name, `${module.alias}.${one.name}`).not.toBe("");
					expect(param.type, `${module.alias}.${one.name}.${param.name}`).not.toBe("");
				}
			}
		}
	});

	/**
	 * `must_use` is the pure/impure split, so a module where nothing is tagged
	 * would silently make every one of its nodes sit on the execution chain.
	 */
	it("has both kinds of call", () => {
		const all = LUNE_MODULES.flatMap((module) => module.functions);
		expect(all.some((one) => one.mustUse)).toBe(true);
		expect(all.some((one) => !one.mustUse)).toBe(true);
	});
});
