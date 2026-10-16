/**
 * The box the wires' layer is sized to holds every wire it draws.
 *
 * The layer was a one-pixel box the wires overflowed, and Safari on an iPad
 * painted only the parts of them it judged that box to reach: a wire across a
 * comment stopped part-way and picked up again at its far edge.
 */

import { describe, expect, it } from "vitest";

import { type Rect, type Vec, wireBounds } from "../src/app/geometry.js";
import { NODE } from "../src/app/layers.js";

const inside = (box: Rect, p: Vec) =>
	p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

describe("the wires' box", () => {
	it("is nothing when there are no wires", () => {
		expect(wireBounds([])).toBeNull();
	});

	it("holds both ends of every wire", () => {
		const ends = [
			{ a: { x: -400, y: 120 }, b: { x: 900, y: -60 } },
			{ a: { x: 40, y: 700 }, b: { x: 260, y: 710 } },
		];
		const box = wireBounds(ends);
		if (!box) throw new Error("no box");
		for (const { a, b } of ends) {
			expect(inside(box, a)).toBe(true);
			expect(inside(box, b)).toBe(true);
		}
	});

	it("holds a curve's control points, which reach past a backward wire's ends", () => {
		// A wire running right to left bows out beyond both of its ends.
		const a = { x: 500, y: 0 };
		const b = { x: 100, y: 300 };
		const slack = Math.max(NODE.wireSlack, Math.abs(b.x - a.x) * 0.4);
		const box = wireBounds([{ a, b }], 0);
		if (!box) throw new Error("no box");
		expect(inside(box, { x: a.x + slack, y: a.y })).toBe(true);
		expect(inside(box, { x: b.x - slack, y: b.y })).toBe(true);
	});

	it("leaves room around them for turns and the stroke", () => {
		const box = wireBounds([{ a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }], 160);
		expect(box?.x).toBeLessThanOrEqual(-160 - NODE.wireSlack);
		expect(box?.y).toBe(-160);
		expect(box?.h).toBe(320);
	});
});
