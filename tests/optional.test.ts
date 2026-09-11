/**
 * Optional arguments, dictionaries, and the multi-output trap.
 *
 * The three of these are unrelated features with one thing in common: each was
 * a place where the generated Luau was *nearly* right, and nearly is the state
 * that does not announce itself. A default passed explicitly, a table built by
 * hand in three nodes, an output assigned to a global — none of them errors,
 * and two of them produce code that runs until it does not.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeDef } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

/** One value into `print`, which is the shortest way to see an expression. */
function shows(b: Builder, node: string, pin = "result"): string {
	const start = b.node("script.begin");
	const print = b.node("debug.print");
	b.link(start, "then", print, "in").link(node, pin, print, "value");
	return body(compile(b.build(), registry).code);
}

describe("optional arguments", () => {
	/**
	 * The case that asked for the feature. `TweenInfo.new` has three optional
	 * arguments, and passing the engine's own defaults back to it is at best
	 * noise and at worst a different call — several Roblox constructors reject
	 * an explicit `nil` where they accept a missing argument.
	 */
	it("passes nothing at all when nothing was set", () => {
		const b = new Builder();
		const info = b.node("tweeninfo.new");
		expect(shows(b, info)).toContain(
			"TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)",
		);
	});

	it("passes what was set, and stops there", () => {
		const b = new Builder();
		const info = b.node("tweeninfo.new");
		b.lit(info, "repeatCount", { t: "number", v: 2 });
		expect(shows(b, info)).toContain("Enum.EasingDirection.Out, 2)");
	});

	/**
	 * The one case where an untouched optional pin still has to appear. Dropping
	 * it would shift every argument after it left, so `delay` would arrive as
	 * `repeatCount` — a wrong call that compiles.
	 */
	it("holds an unset gap open with nil when something after it is set", () => {
		const b = new Builder();
		const info = b.node("tweeninfo.new");
		b.lit(info, "delayTime", { t: "number", v: 0.5 });
		expect(shows(b, info)).toContain("Enum.EasingDirection.Out, nil, nil, 0.5)");
	});

	/**
	 * Every combination, because the rule is positional and the interesting
	 * cases are the ones with a hole in the middle.
	 *
	 * Setting only the *last* optional argument is the case worth being sure
	 * about: both pins before it have to be written out as `nil`, or the delay
	 * arrives where the repeat count was expected. Testing one arrangement
	 * would have left three of these eight untried.
	 */
	it.each([
		[[], ""],
		[["repeatCount"], ", 2"],
		[["reverses"], ", nil, true"],
		[["repeatCount", "reverses"], ", 2, true"],
		[["delayTime"], ", nil, nil, 0.5"],
		[["repeatCount", "delayTime"], ", 2, nil, 0.5"],
		[["reverses", "delayTime"], ", nil, true, 0.5"],
		[["repeatCount", "reverses", "delayTime"], ", 2, true, 0.5"],
	])("emits %j as %j", (set, tail) => {
		const values: Record<string, { t: "number"; v: number } | { t: "boolean"; v: boolean }> = {
			repeatCount: { t: "number", v: 2 },
			reverses: { t: "boolean", v: true },
			delayTime: { t: "number", v: 0.5 },
		};
		const b = new Builder();
		const info = b.node("tweeninfo.new");
		for (const pin of set as string[]) b.lit(info, pin, values[pin]);

		expect(shows(b, info)).toContain(`Enum.EasingDirection.Out${tail})`);
	});

	/** A wire counts as setting it, exactly as typing a value does. */
	it("treats a wired optional pin as set", () => {
		const b = new Builder();
		const info = b.node("tweeninfo.new");
		const n = b.node("value.number");
		b.lit(n, "value", { t: "number", v: 3 });
		b.link(n, "result", info, "repeatCount");
		expect(shows(b, info)).toContain("Enum.EasingDirection.Out, 3)");
	});

	/**
	 * The distinction the whole feature rests on. A default is what the call
	 * would have used anyway; an optional pin's job is to not say it.
	 */
	it("does not treat a definition's own default as having been set", () => {
		const def = registry.get("tweeninfo.new")!;
		const repeat = def.inputs.find((p) => p.id === "repeatCount")!;
		expect(repeat.optional).toBe(true);
		expect(repeat.default, "the default is still there, as a starting point")
			.toBeDefined();

		const b = new Builder();
		const info = b.node("tweeninfo.new");
		expect(shows(b, info)).not.toContain(", 0)");
	});
});

describe("Make Dictionary", () => {
	it("builds a table literal in one node", () => {
		const b = new Builder();
		const dict = b.node("table.dictionary", {
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" } },
		});
		b.lit(dict, "p0.key", { t: "string", v: "Position" });
		b.lit(dict, "p0.value", { t: "number", v: 1 });
		b.lit(dict, "p1.key", { t: "string", v: "Transparency" });
		b.lit(dict, "p1.value", { t: "number", v: 0 });

		const luau = shows(b, dict);
		// Plain keys, as anybody would write them. `["Position"]` is the same
		// access and is what this emitted until the key style became a setting.
		expect(luau).toContain("Position = 1");
		expect(luau).toContain("Transparency = 0");
	});

	/**
	 * Growing the node gives you a blank row, and a row you have not filled in
	 * should not become `[""] = nil` in the output.
	 */
	it("leaves out a pair whose key is still blank", () => {
		const b = new Builder();
		const dict = b.node("table.dictionary", {
			config: { args: 2, split: { "in:p0": "keyValue", "in:p1": "keyValue" } },
		});
		b.lit(dict, "p0.key", { t: "string", v: "Size" });
		b.lit(dict, "p0.value", { t: "number", v: 5 });

		const luau = shows(b, dict);
		expect(luau).toContain("Size = 5");
		expect(luau).not.toContain('[""]');
	});

	it("emits an empty table rather than a pair of spaces", () => {
		const b = new Builder();
		const dict = b.node("table.dictionary");
		expect(shows(b, dict)).toContain("print({})");
	});

	/** The reason it exists: one node instead of three plus an execution wire. */
	it("drives a tween without a table built by hand", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const target = b.node("value.expression");
		b.lit(target, "code", { t: "raw", v: "workspace.Part" });
		const dict = b.node("table.dictionary", { config: { split: { "in:p0": "keyValue" } } });
		b.lit(dict, "p0.key", { t: "string", v: "Transparency" });
		b.lit(dict, "p0.value", { t: "number", v: 1 });
		const info = b.node("tweeninfo.new");
		const create = b.node("tween.create");
		const play = b.node("tween.play");

		b.link(start, "then", create, "in");
		b.link(target, "result", create, "instance");
		b.link(info, "result", create, "info");
		b.link(dict, "result", create, "properties");
		b.link(create, "then", play, "in");
		b.link(create, "result", play, "tween");

		const result = compile(b.build(), registry);
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(result.code)).toContain("{ Transparency = 1 }");
	});
});

/**
 * ## The multi-output statement node
 *
 * Nothing in the built-in library is one — the datatype nodes that return
 * several values are pure and use `select`, because a colour conversion should
 * not be an execution step. So this is tested through a definition made here,
 * which is also the honest way to test it: the point is that the machinery
 * works for whoever writes the first real one.
 */
describe("a statement node with several outputs", () => {
	const multi: NodeDef = {
		id: "test.three",
		title: "Three Values",
		category: "Debug",
		inputs: [{ id: "in", name: "", kind: "exec" }],
		outputs: [
			{ id: "then", name: "", kind: "exec" },
			{ id: "a", name: "A", kind: "data", type: "number" },
			{ id: "b", name: "B", kind: "data", type: "number" },
			{ id: "c", name: "C", kind: "data", type: "number" },
		],
		compilesTo: { kind: "statement", template: "$out.a, $out.b, $out.c = three()" },
	};
	const withMulti = createRegistry([multi]);

	function emit(wire: string[]): string {
		const b = new Builder();
		const start = b.node("script.begin");
		const node = b.node("test.three");
		let previous = b.node("debug.print");
		b.link(start, "then", node, "in").link(node, "then", previous, "in");
		wire.forEach((pin, i) => {
			if (i > 0) {
				const next = b.node("debug.print");
				b.link(previous, "then", next, "in");
				previous = next;
			}
			b.link(node, pin, previous, "value");
		});
		return body(compile(b.build(), withMulti).code);
	}

	/**
	 * The bug this exists for. Declaring only the *consumed* outputs left the
	 * rest as bare names on the left of an assignment, which in Luau creates
	 * globals — silently, and across scripts.
	 */
	it("declares every output the template assigns to, not just the wired ones", () => {
		const luau = emit(["a"]);
		expect(luau).toMatch(/local \w+, _, _/);

		// The property that matters: every name on the left of the assignment
		// was declared on the line above it. Anything not declared is a global,
		// which is the whole bug and is invisible in the emitted text unless you
		// go looking for the declaration.
		const declared = luau.match(/local (.+)$/m)![1].split(", ");
		const assigned = luau.match(/^(.+) = three\(\)$/m)![1].split(", ");
		expect(assigned).toEqual(declared);
	});

	it("names the ones nobody reads `_`, which is what Lua uses for a discard", () => {
		expect(emit(["b"])).toMatch(/local _, \w+, _/);
		expect(emit(["c"])).toMatch(/local _, _, \w+/);
	});

	it("keeps the positions lined up when all three are wired", () => {
		const luau = emit(["a", "b", "c"]);
		expect(luau).not.toContain("_");
		const declaration = luau.match(/local (\w+), (\w+), (\w+)/);
		expect(declaration).not.toBeNull();
		expect(luau).toContain(
			`${declaration![1]}, ${declaration![2]}, ${declaration![3]} = three()`,
		);
	});
});
