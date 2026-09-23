/**
 * A wire dropped on a pin that wants a narrower class goes in through a Cast.
 *
 * Dropping an `Instance` on a `Model` pin used to end the drag and do nothing.
 * The drop is a request for the claim a Cast makes, so the editor builds the
 * Cast — on the canvas, where the claim can be read — and a wire no Cast can
 * carry is refused with the reason.
 */

import { describe, expect, it } from "vitest";

import { canConnect, castFor, connectThroughCast } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeDef, NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

/** A step that wants a Model, standing in for any pin typed as a class. */
const WANTS_MODEL: NodeDef = {
	id: "test.pivot", title: "Pivot", category: "Instances",
	inputs: [
		{ id: "in", name: "", kind: "exec" },
		{ id: "model", name: "Model", kind: "data", type: "Model" },
	],
	outputs: [{ id: "then", name: "", kind: "exec" }],
	compilesTo: { kind: "statement", template: "$in.model:PivotTo(CFrame.identity)" },
};
const registry = createRegistry([WANTS_MODEL]);

/** A Find First Child Of Class set to `from`, and a Pivot to drop it on. */
function scene(from: string): { script: NodeScript; find: string; pivot: string } {
	const b = new Builder();
	const start = b.node("script.begin");
	const find = b.node("instance.findFirstChildOfClass");
	b.lit(find, "instance", { t: "raw", v: "workspace" });
	b.lit(find, "className", { t: "string", v: from });
	const pivot = b.node("test.pivot");
	b.link(start, "then", pivot, "in");
	return { script: b.build(), find, pivot };
}

describe("castFor", () => {
	it("offers a Cast from a class to one derived from it", () => {
		const { script, find, pivot } = scene("PVInstance");
		const from = { node: find, pin: "result" };
		const to = { node: pivot, pin: "model" };
		expect(canConnect(script, registry, from, to).ok).toBe(false);
		expect(castFor(script, registry, from, to)).toEqual({ type: "Model" });
	});

	it("refuses two unrelated classes, and says why", () => {
		const { script, find, pivot } = scene("Humanoid");
		const cast = castFor(script, registry, { node: find, pin: "result" }, { node: pivot, pin: "model" });
		expect(cast).toEqual({ reason: "A Humanoid is never a Model, so it cannot be cast to one." });
	});

	it("has nothing to say about a wire that already fits", () => {
		const { script, find, pivot } = scene("Model");
		expect(castFor(script, registry, { node: find, pin: "result" }, { node: pivot, pin: "model" })).toBeNull();
	});

	it("leaves an execution wire on a data pin to the canvas", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const pivot = b.node("test.pivot");
		const script = b.build();
		expect(castFor(script, registry, { node: start, pin: "then" }, { node: pivot, pin: "model" })).toBeNull();
	});
});

describe("connectThroughCast", () => {
	it("places a Cast between the two and wires both halves", () => {
		const { script, find, pivot } = scene("PVInstance");
		const made = connectThroughCast(
			script, registry, { node: find, pin: "result" }, { node: pivot, pin: "model" }, "Model",
		)!;
		const cast = made.script.nodes.find((n) => n.id === made.id)!;
		expect(cast.def).toBe("cast.as");
		expect(cast.literals?.type).toEqual({ t: "string", v: "Model" });
		expect(made.script.links).toContainEqual(expect.objectContaining({
			from: { node: find, pin: "result" }, to: { node: made.id, pin: "value" },
		}));
		expect(made.script.links).toContainEqual(expect.objectContaining({
			from: { node: made.id, pin: "result" }, to: { node: pivot, pin: "model" },
		}));
	});

	it("compiles to the cast the canvas now shows", () => {
		const { script, find, pivot } = scene("PVInstance");
		const made = connectThroughCast(
			script, registry, { node: find, pin: "result" }, { node: pivot, pin: "model" }, "Model",
		)!;
		const result = compile(made.script, registry);
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(result.code)).toContain(':: Model):PivotTo(CFrame.identity)');
	});
});
