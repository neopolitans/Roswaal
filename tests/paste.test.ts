/**
 * Where a paste lands.
 *
 * It used to land beside what it was copied from, always. That is a fine answer
 * for a node and a poor one for a **comment**: membership is worked out from the
 * geometry when a drag starts, so a comment dropped on top of the nodes it was
 * copied from really does contain both the originals and the copies, and
 * dragging it afterwards takes all of them.
 *
 * So a paste goes to the pointer, by its top-left corner, and the old offset is
 * what happens when there is no pointer to go to.
 */

import { describe, expect, it } from "vitest";

import { Builder } from "./helpers.js";
import { copySelection, pasteClipping } from "../src/app/edits.js";
import type { NodeScript } from "../src/core/schema.js";

/** Two nodes and a comment drawn around them, at known positions. */
function graph() {
	const b = new Builder();
	const left = b.node("debug.print", { id: "left", x: 200, y: 140 });
	const right = b.node("debug.print", { id: "right", x: 360, y: 100 });
	b.script.comments.push({ id: "note", x: 160, y: 60, w: 320, h: 180, text: "Around both" });
	return { script: b.build(), left, right };
}

const added = (before: NodeScript, after: NodeScript) =>
	after.nodes.filter((n) => !before.nodes.some((o) => o.id === n.id));
const addedComments = (before: NodeScript, after: NodeScript) =>
	after.comments.filter((c) => !before.comments.some((o) => o.id === c.id));

describe("a clipping pasted at a point", () => {
	/**
	 * The corner is the smallest x and the smallest y across everything in the
	 * clipping, which here is the comment's — it reaches further up and left
	 * than either node, and it is part of what is being placed.
	 */
	it("puts its top-left corner exactly there", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left", "right", "note"]));
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const corner = [...added(script, after), ...addedComments(script, after)];
		expect(Math.min(...corner.map((i) => i.x))).toBe(1000);
		expect(Math.min(...corner.map((i) => i.y))).toBe(500);
	});

	it("keeps everything in the same place relative to everything else", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left", "right", "note"]));
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const copies = added(script, after);
		// The two nodes were 160 apart across and 40 apart down; the comment's
		// corner was 40 up and left of the leftmost node.
		expect(Math.max(...copies.map((n) => n.x)) - Math.min(...copies.map((n) => n.x))).toBe(160);
		expect(Math.max(...copies.map((n) => n.y)) - Math.min(...copies.map((n) => n.y))).toBe(40);
		expect(addedComments(script, after)[0]).toMatchObject({ x: 1000, y: 500, w: 320, h: 180 });
	});

	/**
	 * The point of the change: pasted far enough away, the copied comment covers
	 * the copies and nothing else.
	 */
	it("leaves the originals outside a pasted comment", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left", "right", "note"]));
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const box = addedComments(script, after)[0];
		const inside = (n: { x: number; y: number }) =>
			n.x >= box.x && n.x <= box.x + box.w && n.y >= box.y && n.y <= box.y + box.h;
		for (const original of ["left", "right"]) {
			const node = after.nodes.find((n) => n.id === original)!;
			expect(inside(node), original).toBe(false);
		}
		for (const copy of added(script, after)) expect(inside(copy)).toBe(true);
	});

	it("falls back to the offset when there is no pointer", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left"]));
		const { script: after } = pasteClipping(script, clip);
		expect(added(script, after)[0]).toMatchObject({ x: 232, y: 172 });
	});

	/** A clipping is a set of positions, not a set of ids: pasting twice differs. */
	it("goes wherever it is told, twice over", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left"]));
		const first = pasteClipping(script, clip, { at: { x: 10, y: 20 } }).script;
		const second = pasteClipping(first, clip, { at: { x: 30, y: 40 } }).script;
		expect(added(script, second).map((n) => ({ x: n.x, y: n.y }))).toEqual([
			{ x: 10, y: 20 },
			{ x: 30, y: 40 },
		]);
	});
});

describe("a pasted function", () => {
	/**
	 * A node inside a copied function keeps its position in that function's own
	 * graph, which is not the graph being pointed at. Only the declaration moves.
	 */
	it("places the declaration and leaves its body's layout alone", () => {
		const b = new Builder();
		const fn = b.node("function.declareHere", {
			id: "fn", x: 100, y: 100, config: { name: "hide" },
		});
		b.node("debug.print", { id: "inner", x: 500, y: 300, graph: fn });
		const script = b.build();

		const clip = copySelection(script, new Set([fn]));
		const { script: after } = pasteClipping(script, clip, { at: { x: 900, y: 40 } });

		const copies = added(script, after);
		const declaration = copies.find((n) => n.def === "function.declareHere")!;
		const body = copies.find((n) => n.def === "debug.print")!;
		expect(declaration).toMatchObject({ x: 900, y: 40 });
		expect(body).toMatchObject({ x: 500, y: 300 });
		expect(body.graph).toBe(declaration.id);
	});
});
