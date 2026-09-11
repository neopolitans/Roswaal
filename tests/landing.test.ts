/**
 * Where a wire may land, asked the same way everywhere.
 *
 * Three places answered this on their own until 0.30.0: the canvas's drag
 * highlighting, the compile's wire check, and the palette a dropped wire opens.
 * Each knew a little less than `canConnect`, and each was found by the 0.25.0
 * docs rewrite saying one thing while the editor did another.
 */

import { describe, expect, it } from "vitest";

import { canConnect, growNode, landingPins } from "../src/app/edits.js";
import { typesCompatible, validate } from "../src/core/compiler/validate.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeDef, PinDef } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();
const stringOut: PinDef = { id: "result", name: "", kind: "data", type: "string" };

describe("one rule for what fits", () => {
	it("lets a Model into an Instance pin, and not the other way", () => {
		expect(typesCompatible("Model", "Instance")).toBe(true);
		expect(typesCompatible("Instance", "Model")).toBe(false);
		expect(typesCompatible("number", "string")).toBe(true);
		expect(typesCompatible("Config", "Instance")).toBe(false);
	});

	it("does not warn at compile about a wire the editor made", () => {
		const takesInstance: NodeDef = {
			id: "test.takesInstance",
			title: "Takes Instance",
			category: "Custom",
			inputs: [
				{ id: "in", name: "", kind: "exec" },
				{ id: "target", name: "Target", kind: "data", type: "Instance" },
			],
			outputs: [{ id: "then", name: "", kind: "exec" }],
			compilesTo: { kind: "statement", template: "print($in.target)" },
		};
		const withPack = createRegistry([takesInstance]);

		const b = new Builder();
		const tank = b.variable("tank", "Model", { t: "nil" });
		const begin = b.node("script.begin");
		const read = b.node("variable.get", { config: { variable: tank, name: "tank", type: "Model" } });
		const use = b.node("test.takesInstance");
		b.link(begin, "then", use, "in");
		b.link(read, "value", use, "target");

		const script = b.build();
		expect(canConnect(script, withPack, { node: read, pin: "value" }, { node: use, pin: "target" }).ok)
			.toBe(true);
		expect(validate(script, withPack).filter((d) => /expects/.test(d.message))).toEqual([]);
	});
});

describe("pins a dropped wire is offered", () => {
	it("leaves out a pin whose text is pasted into the source", () => {
		const cast = registry.get("cast.as")!;
		expect(landingPins(cast, cast.inputs, stringOut, "in").map((p) => p.id)).toEqual(["value"]);
	});

	it("agrees with the drop it would lead to", () => {
		const b = new Builder();
		const text = b.node("value.string");
		const cast = b.node("cast.as");
		const script = b.build();
		expect(canConnect(script, registry, { node: text, pin: "result" }, { node: cast, pin: "type" }).ok)
			.toBe(false);
		expect(canConnect(script, registry, { node: text, pin: "result" }, { node: cast, pin: "value" }).ok)
			.toBe(true);
	});

	/**
	 * The canvas grows a node a data wire is dropped on, then connects. A
	 * Sequence grows an execution output, which nothing can connect a data
	 * wire to — so the canvas now checks before keeping the pin.
	 */
	it("gives a Sequence nothing a data wire can land on", () => {
		const b = new Builder();
		const text = b.node("value.string");
		const seq = b.node("flow.sequence");
		const grown = growNode(b.build(), registry, seq, 1, {});
		expect(grown.pin).toBeDefined();
		expect(
			canConnect(grown.script, registry, { node: text, pin: "result" }, { node: seq, pin: grown.pin! }).ok,
		).toBe(false);
	});
});
