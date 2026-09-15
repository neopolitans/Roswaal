/**
 * Operator pills.
 *
 * A comparison is `a == b`, and a full node says that in three rows under a
 * header whose title repeats what the symbol says. These nodes are drawn as the
 * expression instead: pins down the left, the Luau operator in the middle, the
 * result on the right.
 *
 * The sizes are asserted through `nodeBounds` and `pinPosition` — the canvas's
 * own — because the documentation draws these too, and a second opinion about
 * the width would put the picture and the node a few pixels apart.
 */

import { describe, expect, it } from "vitest";

import { isOperator, nodeBounds, pinPosition } from "../src/app/geometry.js";
import { NODE } from "../src/app/layers.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import {
	operatorEditorWidth, operatorFields, operatorLayout,
} from "../src/core/operatorLayout.js";
import type { GraphNode, NodeConfig } from "../src/core/schema.js";

const registry = createRegistry();

const node = (def: string, config?: NodeConfig): GraphNode => ({ id: "n", def, x: 0, y: 0, config });
const fieldsOf = (id: string) => operatorFields(resolveNodePins(registry.get(id)!, undefined).inputs);

describe("which nodes are pills", () => {
	it("is the thirteen whose whole meaning is one symbol", () => {
		const ids = [...registry.values()]
			.filter((def) => def.display === "operator")
			.map((def) => def.id)
			.sort();
		expect(ids).toEqual([
			"cast.any", "cast.array", "cast.as",
			"compare.eq", "compare.gt", "compare.gte", "compare.lt", "compare.lte", "compare.neq",
			"logic.and", "logic.not", "logic.or", "value.nil",
		]);
	});

	it("shows what Luau will say, not a word for it", () => {
		expect(registry.get("compare.neq")!.operator).toBe("~=");
		expect(registry.get("compare.gte")!.operator).toBe(">=");
		expect(registry.get("logic.and")!.operator).toBe("and");
		expect(registry.get("value.nil")!.operator).toBe("nil");
		expect(registry.get("cast.as")!.operator).toBe("::");
	});

	/**
	 * A cast is `value :: T`: two operands and a symbol, which is what a pill
	 * draws. The type is the second row's field, so the pill carries the claim
	 * on its face — which is the point, since a cast is the one node that
	 * asserts without checking.
	 */
	it("includes the casts, each saying which cast it is", () => {
		expect(registry.get("cast.array")!.operator).toBe(":: { }");
		expect(registry.get("cast.any")!.operator).toBe(":: any ::");
		// Value takes a wire and has no editor; Type is typed in, so one field.
		expect(fieldsOf("cast.as")).toEqual(["field"]);
	});

	it("is a shape the canvas knows", () => {
		expect(isOperator(registry.get("compare.eq"))).toBe(true);
		expect(isOperator(registry.get("debug.print"))).toBe(false);
	});
});

describe("a pill's size", () => {
	it("is a capsule's height with one row", () => {
		expect(nodeBounds(node("value.nil"), registry).h).toBe(NODE.compactHeight);
		expect(nodeBounds(node("logic.not"), registry).h).toBe(NODE.compactHeight);
	});

	/**
	 * A constant, not half the height. `border-radius: 999px` clamps to half the
	 * shorter side: a capsule at one row, an *ellipse* at three — and an
	 * ellipse's sides curve away from the pins sitting against them, so a wire
	 * ends at a point outside the shape it is meant to touch.
	 */
	it("keeps one corner size whatever its height", () => {
		// Half a capsule's height, so a one-row pill is still exactly a capsule.
		expect(NODE.operatorRadius).toBe(NODE.compactHeight / 2);
		expect(nodeBounds(node("logic.and", { args: 4 }), registry).h)
			.toBeGreaterThan(NODE.operatorRadius * 2);
	});

	it("takes a row for each operand", () => {
		expect(nodeBounds(node("compare.lt"), registry).h)
			.toBe(2 * NODE.rowHeight + NODE.operatorPad * 2);
		const two = nodeBounds(node("logic.and", { args: 2 }), registry).h;
		const four = nodeBounds(node("logic.and", { args: 4 }), registry).h;
		expect(four - two).toBe(2 * NODE.rowHeight);
	});

	it("is wider when its rows carry a field than when they carry nothing", () => {
		// Less Than takes numbers and shows two boxes; Equal takes anything and
		// shows none, because an `any` pin has no value to type.
		expect(nodeBounds(node("compare.lt"), registry).w)
			.toBeGreaterThan(nodeBounds(node("compare.eq"), registry).w);
	});

	it("measures that field from the pin's default, not from what is wired", () => {
		expect(operatorEditorWidth(fieldsOf("compare.lt"), NODE)).toBe(NODE.fieldWidth);
		expect(operatorEditorWidth(fieldsOf("logic.and"), NODE)).toBe(NODE.checkWidth);
		expect(operatorEditorWidth(fieldsOf("compare.eq"), NODE)).toBe(0);
	});

	it("leaves room for the − and + only on a node that grows", () => {
		const shape = { symbol: "and", editor: 0, rows: 2, growable: true };
		const plain = operatorLayout({ ...shape, growable: false }, NODE);
		expect(operatorLayout(shape, NODE).width - plain.width).toBe(NODE.growButton + 6);
	});

	it("never narrows its symbol past a readable column", () => {
		const layout = operatorLayout({ symbol: "<", editor: 0, rows: 2, growable: false }, NODE);
		expect(layout.symbolWidth).toBe(NODE.operatorMinSymbol);
	});
});

describe("where a pill's wires meet it", () => {
	it("runs its operands down the left", () => {
		const lt = node("compare.lt");
		const a = pinPosition(lt, registry, "a", "in")!;
		const b = pinPosition(lt, registry, "b", "in")!;
		expect(a.x).toBe(0);
		expect(b.x).toBe(0);
		expect(b.y - a.y).toBe(NODE.rowHeight);
	});

	it("puts its result level with the middle rather than with a row", () => {
		const lt = node("compare.lt");
		const box = nodeBounds(lt, registry);
		const out = pinPosition(lt, registry, "result", "out")!;
		expect(out).toEqual({ x: box.w, y: box.h / 2 });
	});

	it("centres the one row of a Nil on its own middle", () => {
		const nil = node("value.nil");
		const box = nodeBounds(nil, registry);
		expect(pinPosition(nil, registry, "result", "out")).toEqual({ x: box.w, y: box.h / 2 });
	});
});
