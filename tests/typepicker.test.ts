/**
 * What the type control offers, and where it draws the line.
 *
 * Two shapes were wrong before this one. A `<select>` of twelve names could not
 * say `Model` at all. A text field with every name attached could say anything,
 * and made picking `number` — the thing you do most — a matter of typing it.
 *
 * So the list holds what is reached often and **Other…** opens a field that
 * takes any Luau type. These test the split, which is the only part that is a
 * decision: the component itself is a `<select>` and an `<input>`, and there is
 * no DOM here to render either into.
 */

import { describe, expect, it } from "vitest";

import { declaredTypes, listGroups, listedTypes, searchTypes } from "../src/app/TypePicker.js";
import { INSTANCE_CLASSES } from "../src/core/roblox.js";
import { pinTypeOf } from "../src/core/nodes/variables.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

/** A graph declaring two types, the way the M103's Config module does. */
function declaring(...names: string[]): NodeScript {
	const b = new Builder();
	for (const name of names) b.node("type.declareTop", { config: { name } });
	return b.build();
}

describe("the types a graph declares", () => {
	it("finds them on both Declare Type nodes", () => {
		const b = new Builder();
		b.node("type.declareTop", { config: { name: "Config" } });
		b.node("type.declareHere", { config: { name: "Tuning" } });
		expect(declaredTypes(b.build())).toEqual(["Config", "Tuning"]);
	});

	it("ignores one with no name yet", () => {
		expect(declaredTypes(declaring("Config", "", "  "))).toEqual(["Config"]);
	});

	it("says nothing when there is no graph", () => {
		expect(declaredTypes(undefined)).toEqual([]);
	});
});

describe("the list", () => {
	/** This graph's own vocabulary is the nearest thing to hand. */
	it("puts the graph's own types first", () => {
		expect(listGroups(declaring("Config"))[0]).toEqual({
			label: "This graph",
			types: ["Config"],
		});
	});

	it("has no group for them when there are none", () => {
		expect(listGroups(undefined).map((g) => g.label)).toEqual([
			"Basic", "Roblox values", "Instances",
		]);
	});

	/** The reason the first `<select>` was replaced, and the reason it came back. */
	it("holds the everyday types and the everyday classes", () => {
		const types = listedTypes(undefined);
		for (const t of ["any", "number", "string", "table", "Instance", "Vector3", "Model"]) {
			expect(types, t).toContain(t);
		}
	});

	/**
	 * A list nobody can scan is not a shortcut. Fifty-odd classes belong behind
	 * a search field, not in a dropdown. 42 since 0.74.3, when Luau's `unknown`
	 * and `never` joined the basic types.
	 */
	it("stays short enough to read", () => {
		expect(listedTypes(undefined).length).toBeLessThan(42);
		expect(listedTypes(undefined).length).toBeLessThan(INSTANCE_CLASSES.length + 10);
	});

	it("lists nothing twice", () => {
		const types = listedTypes(declaring("Config", "Tuning"));
		expect(new Set(types).size).toBe(types.length);
	});

	/** Every class it offers has to be one the wire rules know about. */
	it("only offers classes that count as Instances", () => {
		const classes = listGroups(undefined).find((g) => g.label === "Instances")!.types;
		expect(classes.filter((c) => !INSTANCE_CLASSES.includes(c))).toEqual([]);
	});
});

describe("what is behind Other", () => {
	it("suggests every class, not just the common ones", () => {
		const all = searchTypes(undefined);
		for (const c of INSTANCE_CLASSES) expect(all, c).toContain(c);
	});

	it("keeps the list's own types too, so nothing is lost by opening it", () => {
		const all = new Set(searchTypes(declaring("Config")));
		for (const t of listedTypes(declaring("Config"))) expect(all.has(t), t).toBe(true);
	});

	it("suggests nothing twice", () => {
		const all = searchTypes(declaring("Model"));
		expect(new Set(all).size).toBe(all.length);
	});

	/** It is a shortcut, not a limit — the field takes anything. */
	it("is bigger than the list", () => {
		expect(searchTypes(undefined).length).toBeGreaterThan(listedTypes(undefined).length);
	});
});

/** Luau's top and bottom types: offered, and wired as anything is. */
describe("unknown and never", () => {
	it("are offered with the basic types", () => {
		const types = listedTypes(undefined);
		expect(types).toContain("unknown");
		expect(types).toContain("never");
	});

	it("give a pin that takes any wire", () => {
		expect(pinTypeOf("unknown")).toBe("any");
		expect(pinTypeOf("never")).toBe("any");
		expect(pinTypeOf("unknown?")).toBe("any");
	});
});

describe("unknown and never, written out", () => {
	it("annotate a parameter as chosen, though the pin is any", () => {
		const b = new Builder();
		b.node("script.begin");
		b.node("function.entry", {
			config: { name: "check", params: [{ name: "packet", type: "unknown" }], returns: [{ name: "out", type: "never" }] },
		});
		const script = { ...b.build(), mode: "strict" } as NodeScript;
		const out = compile(script, createRegistry()).code;
		expect(out).toContain("packet: unknown");
		expect(out).toContain("): never");
	});
});
