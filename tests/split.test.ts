/**
 * Splitting a struct pin into its components, and putting it back.
 *
 * The nodes here come from a *pack* rather than the built-in library, on
 * purpose. Splitting is applied by the registry after `derivePins` rather than
 * by the node itself, precisely so a pack's node — data, never executed — gets
 * it too. If these tests passed only for built-ins the feature would be half
 * built and look finished.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeDef } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const PACK: NodeDef[] = [
	{
		id: "test.move",
		title: "Move",
		category: "Custom",
		inputs: [
			{ id: "in", name: "", kind: "exec" },
			{
				id: "target", name: "Target", kind: "data", type: "Vector3",
				default: { t: "raw", v: "Vector3.zero" },
			},
		],
		outputs: [{ id: "then", name: "", kind: "exec" }],
		compilesTo: { kind: "statement", template: "move($in.target)" },
	},
	{
		id: "test.place",
		title: "Place",
		category: "Custom",
		inputs: [
			{ id: "in", name: "", kind: "exec" },
			{
				id: "at", name: "At", kind: "data", type: "CFrame",
				default: { t: "raw", v: "CFrame.identity" },
			},
		],
		outputs: [{ id: "then", name: "", kind: "exec" }],
		compilesTo: { kind: "statement", template: "place($in.at)" },
	},
	{
		id: "test.origin",
		title: "Origin",
		category: "Custom",
		pure: true,
		inputs: [],
		outputs: [{ id: "cf", name: "CFrame", kind: "data", type: "CFrame" }],
		compilesTo: { kind: "expr", outputs: { cf: "getOrigin()" } },
	},
	{
		id: "test.spawn",
		title: "Spawn",
		category: "Custom",
		inputs: [{ id: "in", name: "", kind: "exec" }],
		outputs: [
			{ id: "then", name: "", kind: "exec" },
			{ id: "where", name: "Where", kind: "data", type: "Vector3" },
		],
		compilesTo: { kind: "statement", template: "$out.where = spawnPoint()" },
	},
];

const registry = createRegistry(PACK);

function errors(result: { diagnostics: { severity: string; message: string }[] }): string[] {
	return result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
}

describe("pin derivation", () => {
	it("replaces a split pin with one pin per component", () => {
		const { inputs, baseInputs } = resolveNodePins(registry.get("test.move")!, {
			split: { "in:target": "xyz" },
		});

		expect(inputs.map((p) => p.id)).toEqual(["in", "target.x", "target.y", "target.z"]);
		expect(inputs.filter((p) => p.kind === "data").every((p) => p.type === "number")).toBe(true);
		// The templates still see the pin they were written against.
		expect(baseInputs.map((p) => p.id)).toEqual(["in", "target"]);
	});

	it("leaves a pin alone when its type is not splittable", () => {
		const { inputs } = resolveNodePins(registry.get("debug.print")!, {
			split: { "in:value": "xyz" },
		});
		expect(inputs.map((p) => p.id)).toContain("value");
	});

	/**
	 * Get Service takes a `service` and gives one back. Keying a split on the pin
	 * id alone would split both sides at once, which is the same trap that once
	 * made wiring an output hide the input's editor.
	 */
	it("keys the split by side, so an input and output sharing an id stay apart", () => {
		const { inputs, outputs } = resolveNodePins(registry.get("test.origin")!, {
			split: { "in:cf": "transform" },
		});
		expect(inputs).toHaveLength(0);
		expect(outputs.map((p) => p.id)).toEqual(["cf"]);
	});
});

describe("splitting an input", () => {
	it("rebuilds the value from the components' literals", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const move = b.node("test.move", { config: { split: { "in:target": "xyz" } } });
		b.link(start, "then", move, "in");
		b.lit(move, "target.x", { t: "number", v: 1 });
		b.lit(move, "target.y", { t: "number", v: 2 });
		b.lit(move, "target.z", { t: "number", v: 3 });

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe("move(Vector3.new(1, 2, 3))");
	});

	/** A part left alone still contributes — there is no half a Vector3. */
	it("falls back to each part's default when a component is untouched", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const move = b.node("test.move", { config: { split: { "in:target": "xyz" } } });
		b.link(start, "then", move, "in");
		b.lit(move, "target.y", { t: "number", v: 5 });

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe("move(Vector3.new(0, 5, 0))");
	});

	it("takes a wired component from its wire", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("math.add");
		const move = b.node("test.move", { config: { split: { "in:target": "xyz" } } });
		b.lit(add, "a0", { t: "number", v: 2 }).lit(add, "a1", { t: "number", v: 3 });
		b.link(start, "then", move, "in");
		b.link(add, "result", move, "target.y");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe("move(Vector3.new(0, (2 + 3), 0))");
	});

	it("builds a CFrame from a position and a rotation", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const place = b.node("test.place", { config: { split: { "in:at": "transform" } } });
		b.link(start, "then", place, "in");
		b.lit(place, "at.position", { t: "raw", v: "Vector3.new(0, 10, 0)" });

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe("place((CFrame.identity + Vector3.new(0, 10, 0)))");
	});
});

/**
 * The pack nodes above prove the mechanism. These prove it on the library the
 * project actually ships, which is a different claim: it needs the CFrame and
 * Vector pins to carry real types and real defaults.
 */
describe("on the built-in library", () => {
	it("splits Look At's position inputs into components", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const look = b.node("cframe.lookAt", {
			config: { split: { "in:from": "xyz", "in:to": "xyz" } },
		});
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(look, "result", print, "value");
		b.lit(look, "from.y", { t: "number", v: 10 });
		b.lit(look, "to.z", { t: "number", v: -5 });

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			"print(CFrame.lookAt(Vector3.new(0, 10, 0), Vector3.new(0, 0, -5), Vector3.yAxis))",
		);
	});

	it("takes a position straight off a split CFrame output", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const identity = b.node("cframe.identity", {
			config: { split: { "out:result": "transform" } },
		});
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(identity, "result.position", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["local CFrame_Identity = CFrame.identity", "print(CFrame_Identity.Position)"].join("\n"),
		);
	});
});

describe("splitting an output", () => {
	/**
	 * The invariant every `get` template leans on: the whole value is bound to a
	 * local first, so reading three components cannot call `getOrigin()` three
	 * times, and `$v.Position` never needs defensive parentheses.
	 */
	it("binds the whole value once, then reads the component off it", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const origin = b.node("test.origin", { config: { split: { "out:cf": "transform" } } });
		const move = b.node("test.move");
		b.link(start, "then", move, "in");
		b.link(origin, "cf.position", move, "target");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe(
			["local Origin = getOrigin()", "move(Origin.Position)"].join("\n"),
		);
	});

	it("does not re-evaluate the source once per component", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const origin = b.node("test.origin", { config: { split: { "out:cf": "axes" } } });
		const a = b.node("test.move");
		const c = b.node("test.move");
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(origin, "cf.position", a, "target");
		b.link(origin, "cf.up", c, "target");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code).match(/getOrigin\(\)/g)).toHaveLength(1);
		expect(body(out.code)).toContain(".Position");
		expect(body(out.code)).toContain(".UpVector");
	});

	/** An impure node's output is already a local; splitting reads parts off it. */
	it("splits an impure node's output without binding it twice", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const spawn = b.node("test.spawn", { config: { split: { "out:where": "xyz" } } });
		const move = b.node("test.move");
		b.link(start, "then", spawn, "in");
		b.link(spawn, "then", move, "in");
		b.link(spawn, "where.y", move, "target");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code).match(/spawnPoint\(\)/g)).toHaveLength(1);
		expect(body(out.code)).toContain(".Y");
	});

	/**
	 * Roblox exposes rotation components only through GetComponents(), so a
	 * single one has to select out of the tuple. Verbose, but honest about what
	 * the API costs rather than hiding it.
	 */
	it("reads a rotation component through GetComponents", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const origin = b.node("test.origin", { config: { split: { "out:cf": "components" } } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(origin, "cf.r01", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("select(5, Origin:GetComponents())");
	});
});
