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

import {
	LUNE_MODULES, LUNE_ROBLOX_DATATYPES, LUNE_VERSION, type LuneFunction,
} from "../src/core/luneApi.js";
import { requiresLuneRoblox } from "../src/core/luneTypes.js";
import { listedTypes, listGroups, searchTypes } from "../src/app/TypePicker.jsx";
import {
	categoryLabel, emptyScript, ENGINE_TYPES, ROBLOX_NAMED_CATEGORIES, type NodeScript,
} from "../src/core/schema.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { readFileSync } from "node:fs";

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

/**
 * Which types a graph is offered, which is a question about its target.
 *
 * The picker was built when there was one target, so it offered Luau's
 * primitives, then Roblox's datatypes, then Instance classes — the whole world,
 * if the whole world is Roblox. A Lune graph got `CFrame` and `Humanoid` and
 * had never heard of `DateTime`, which made the one runtime you would have to
 * type a type by hand for the one Roswaal is adding support for.
 */
describe("the types a graph can pick from", () => {
	const graph = (target: "roblox" | "lune", extra: Partial<NodeScript> = {}): NodeScript => ({
		...emptyScript("Example", "example"),
		target,
		...extra,
	});

	const labels = (script: NodeScript) => listGroups(script).map((one) => one.label);

	it("offers Roblox's own to a Roblox graph", () => {
		expect(labels(graph("roblox"))).toContain("Roblox values");
		expect(labels(graph("roblox"))).toContain("Instances");
		expect(labels(graph("roblox"))).not.toContain("Lune");
	});

	it("offers Lune's to a Lune graph, and not the engine's", () => {
		const found = labels(graph("lune"));
		expect(found).toContain("Lune");
		expect(found).not.toContain("Roblox values");
		expect(found).not.toContain("Instances");
	});

	it("has the types the standard library actually deals in", () => {
		const offered = listedTypes(graph("lune"));
		for (const type of ["DateTime", "Regex", "WebSocket", "Metadata", "ChildProcess"]) {
			expect(offered, type).toContain(type);
		}
	});

	/** Luau's own, and all three were missing from a list written by hand. */
	it("offers buffer, thread and nil to both", () => {
		for (const target of ["roblox", "lune"] as const) {
			for (const type of ["buffer", "thread", "nil"]) {
				expect(listedTypes(graph(target)), `${target}: ${type}`).toContain(type);
			}
		}
	});

	/**
	 * `@lune/roblox` genuinely gives a Lune program `Instance` and the
	 * datatypes, so they are conditional there rather than wrong — and the
	 * condition is a require somebody wrote.
	 */
	it("keeps Roblox's types out of a Lune graph that has not required them", () => {
		expect(listedTypes(graph("lune"))).not.toContain("Instance");
		expect(searchTypes(graph("lune"))).not.toContain("Humanoid");
	});

	it("offers them once the graph requires `@lune/roblox`", () => {
		const required = graph("lune", {
			modules: [{ id: "m1", name: "roblox", specifier: "@lune/roblox" }],
		});
		expect(labels(required)).toContain("From @lune/roblox");
		expect(listedTypes(required)).toContain("Instance");
		expect(searchTypes(required)).toContain("Humanoid");
	});

	/** The canvas is the other way of asking, and counts the same. */
	it("counts a Require at Top as having asked", () => {
		const onCanvas = graph("lune", {
			nodes: [{
				id: "n1", def: "module.requireTop", x: 0, y: 0,
				literals: { specifier: { t: "raw", v: "@lune/roblox" } },
			}],
		});
		expect(requiresLuneRoblox(onCanvas)).toBe(true);
		expect(listedTypes(onCanvas)).toContain("Instance");
	});
});

/**
 * What the Roblox-facing categories are called.
 *
 * They were "Engine" and "Engine Types", which is unambiguous only while there
 * is one engine. A Lune developer reading "Engine Types" has to already know it
 * means Roblox's — and naming the platform a node is *for* is what a name is
 * for.
 *
 * Held here because the change has two halves that must stay together: the
 * label may move and the key may not. A category name is slugged into a
 * published documentation URL, so renaming the key would move every one of
 * those pages, and moving them back would move them twice.
 */
describe("naming the Roblox categories", () => {
	it("says Roblox on screen", () => {
		expect(categoryLabel("Engine")).toBe("Roblox");
		expect(categoryLabel(ENGINE_TYPES)).toBe("Roblox Types");
	});

	/** The stored key is what a URL and a runtime table are built from. */
	it("leaves the key alone", () => {
		expect(ENGINE_TYPES).toBe("Engine Types");
		const engine = [...createRegistry().values()].filter((def) => def.category === "Engine");
		expect(engine.length).toBeGreaterThan(0);
	});

	it("leaves every other category as it is", () => {
		for (const name of ["Flow", "Variables", "Instances", "Modules", "Debug"]) {
			expect(categoryLabel(name), name).toBe(name);
		}
	});

	/**
	 * One flag, because it may have to go back. Flipping it must put every
	 * label back and touch nothing else — which is only true while the labels
	 * are a lookup rather than the keys themselves.
	 */
	it("is one flag away from being Engine again", () => {
		const source = readFileSync(new URL("../src/core/schema.ts", import.meta.url), "utf8");
		expect(source).toContain("ROBLOX_NAMED_CATEGORIES");
		expect(ROBLOX_NAMED_CATEGORIES).toBe(true);
		// The guard is the first thing the function does, so `false` is a
		// straight passthrough rather than a second table to keep in step.
		expect(source).toContain("if (!ROBLOX_NAMED_CATEGORIES) return category;");
	});
});

/**
 * What `@lune/roblox` actually implements.
 *
 * It gives a Lune program *some* of Roblox's datatypes and not all of them, so
 * "Roblox Types" is not one answer in a Lune graph — it is a list with a line
 * through part of it. Offering the whole group once the module is required errs
 * toward showing a constructor the runtime has not got, which is the wrong way
 * round: better to hide something that would have worked than to offer
 * something that cannot.
 *
 * Generated from the crate's own module listing, so a Lune release that adds a
 * datatype adds it here.
 */
describe("the datatypes @lune/roblox has", () => {
	it("has the ones a Lune program really can make", () => {
		for (const name of ["Vector3", "CFrame", "Color3", "UDim2", "BrickColor", "Font"]) {
			expect(LUNE_ROBLOX_DATATYPES, name).toContain(name);
		}
	});

	/** The point of asking rather than assuming. */
	it("does not have TweenInfo or Tween", () => {
		expect(LUNE_ROBLOX_DATATYPES).not.toContain("TweenInfo");
		expect(LUNE_ROBLOX_DATATYPES).not.toContain("Tween");
	});

	it("offers them to a Lune graph only once the module is required", () => {
		const bare = { ...emptyScript("A", "a"), target: "lune" as const };
		const asked = {
			...bare,
			modules: [{ id: "m1", name: "roblox", specifier: "@lune/roblox" }],
		};
		expect(listedTypes(bare)).not.toContain("Vector3");
		expect(listedTypes(asked)).toContain("Vector3");
	});

	/** And never the ones it cannot make, however the graph asks. */
	it("never offers a datatype the module does not implement", () => {
		const asked = {
			...emptyScript("A", "a"),
			target: "lune" as const,
			modules: [{ id: "m1", name: "roblox", specifier: "@lune/roblox" }],
		};
		const offered = listGroups(asked).find((one) => one.label === "From @lune/roblox");
		expect(offered).toBeDefined();
		expect(offered?.types).not.toContain("TweenInfo");
	});
});
