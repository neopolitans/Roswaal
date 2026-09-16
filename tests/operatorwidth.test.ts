/**
 * An operator pill is as wide as what is drawn on it.
 *
 * The pill's width is decided by `operatorFields`, and what actually appears
 * on a row is decided, separately, when the node is drawn. They have to agree,
 * and for most operators they did by accident: `math.add`'s pins default to
 * `0`, so the editor column was reserved whether or not anybody had typed in
 * it.
 *
 * `compare.eq` is where they came apart. Its pins are `any` with no default —
 * there is no sensible value to compare against — so the pill was measured as
 * having no editor column at all. Type a `0` into one and the field was drawn
 * regardless, hanging off the left-hand side of a node with no room for it and
 * over the top of whatever was beside it.
 *
 * So this pins the rule rather than the symptom: **a row that will be drawn
 * with an editor is a row the width knows about**, whether that editor comes
 * from the pin's default or from a value on this particular node.
 */

import { describe, expect, it } from "vitest";

import { BUILTIN_NODES } from "../src/core/nodes/index.js";
import { NODE } from "../src/core/nodeMetrics.js";
import {
	operatorEditorWidth, operatorFields, operatorLayout,
} from "../src/core/operatorLayout.js";
import type { Literal, NodeDef } from "../src/core/schema.js";

const def = (id: string): NodeDef => {
	const found = BUILTIN_NODES.find((one) => one.id === id);
	if (!found) throw new Error(`no such node: ${id}`);
	return found;
};

/** The pill's width, as the canvas and the docs both compute it. */
function widthOf(id: string, literals?: Record<string, Literal>): number {
	const node = def(id);
	return operatorLayout(
		{
			symbol: "==",
			editor: operatorEditorWidth(operatorFields(node.inputs, literals), NODE),
			rows: node.inputs.filter((p) => p.kind === "data").length,
			growable: node.variadic !== undefined,
		},
		NODE,
	).width;
}

describe("a pill leaves room for the fields it draws", () => {
	it("has no editor column on Equal until something is typed", () => {
		// The state the bug hid in: nothing typed, nothing drawn, no column.
		expect(operatorFields(def("compare.eq").inputs)).toEqual([]);
	});

	it("gains one the moment a value is on a pin", () => {
		const fields = operatorFields(def("compare.eq").inputs, { b: { t: "number", v: 0 } });
		expect(fields).toEqual(["field"]);
	});

	it("is wider with the value than without it", () => {
		const bare = widthOf("compare.eq");
		const typed = widthOf("compare.eq", { b: { t: "number", v: 0 } });
		expect(typed).toBeGreaterThan(bare);
		// Wide enough for the field itself, not merely a pixel or two.
		expect(typed - bare).toBeGreaterThanOrEqual(NODE.fieldWidth);
	});

	/**
	 * The property the original docblock was protecting. A literal stays on the
	 * node when a wire lands on its pin — the field stops being drawn and the
	 * column stays empty — so the pill does not resize under a wire that has
	 * just been connected to it.
	 */
	it("does not change width when a pin is wired", () => {
		const literals: Record<string, Literal> = { b: { t: "number", v: 0 } };
		expect(widthOf("compare.eq", literals)).toBe(widthOf("compare.eq", literals));
	});

	it("leaves an operator whose pins have defaults exactly as it was", () => {
		// `math.add` defaults both pins to 0, so its column never depended on
		// this and must not have moved.
		const before = operatorFields(def("math.add").inputs);
		const after = operatorFields(def("math.add").inputs, { a0: { t: "number", v: 7 } });
		expect(after).toEqual(before);
		expect(widthOf("math.add", { a0: { t: "number", v: 7 } })).toBe(widthOf("math.add"));
	});

	/**
	 * Every operator in the palette, against every kind of value that can be
	 * typed on it. The failure was one node and one type; the rule is general.
	 */
	it.each(BUILTIN_NODES.filter((one) => one.display === "operator").map((one) => one.id))(
		"%s is never narrower with a value than without one",
		(id) => {
			const node = def(id);
			const first = node.inputs.find((p) => p.kind === "data" && p.required !== true);
			if (!first) return;
			for (const literal of [
				{ t: "number", v: 1 },
				{ t: "string", v: "x" },
				{ t: "boolean", v: true },
			] as Literal[]) {
				expect([id, literal.t, widthOf(id, { [first.id]: literal }) >= widthOf(id)])
					.toEqual([id, literal.t, true]);
			}
		},
	);
});
