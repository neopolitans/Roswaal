/**
 * What a copy takes, and where a paste lands.
 *
 * The two halves are one feature and were fixed one at a time, which is why
 * they are tested together. Landing the paste at the pointer is no use if the
 * clipping is an empty rectangle; carrying a comment's contents is no use if
 * they land back on top of the originals.
 *
 * Comment membership is worked out from the geometry when a drag starts — a
 * deliberate decision, so a node dragged out of a comment is simply out. The
 * cost is that a comment drawn over two copies of the same thing genuinely
 * contains both, which is what both halves exist to avoid.
 */

import { describe, expect, it } from "vitest";

import { Builder } from "./helpers.js";
import {
	commentContents, copySelection, pasteClipping, withCommentContents,
} from "../src/app/edits.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { LOGIC_INPUTS, LOGIC_OUTPUTS } from "../src/core/nodes/logic.js";
import { removable, withoutEnds } from "../src/app/designer/LogicCanvas.jsx";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();

/** Two wired nodes with a comment drawn around them, at known positions. */
function graph() {
	const b = new Builder();
	const left = b.node("debug.print", { id: "left", x: 200, y: 140 });
	const right = b.node("debug.print", { id: "right", x: 360, y: 100 });
	b.link(left, "then", right, "in");
	// Wide and tall enough to contain both nodes' full bounds, which are
	// NODE.width across rather than a point.
	b.script.comments.push({ id: "note", x: 160, y: 60, w: 500, h: 260, text: "Around both" });
	return { script: b.build(), left, right };
}

const added = (before: NodeScript, after: NodeScript) =>
	after.nodes.filter((n) => !before.nodes.some((o) => o.id === n.id));
const addedComments = (before: NodeScript, after: NodeScript) =>
	after.comments.filter((c) => !before.comments.some((o) => o.id === c.id));

describe("copying a comment", () => {
	/** The report: it copied the rectangle and nothing that was in it. */
	it("takes the nodes it is drawn around", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["note"]), registry);
		expect(clip.comments.map((c) => c.id)).toEqual(["note"]);
		expect(clip.nodes.map((n) => n.id).sort()).toEqual(["left", "right"]);
	});

	/** Both ends are inside the clipping, so the wire comes too. */
	it("takes the wires between them", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["note"]), registry);
		expect(clip.links).toHaveLength(1);
	});

	it("takes a nested comment and everything in it", () => {
		const { script } = graph();
		script.comments.push({ id: "inner", x: 180, y: 80, w: 120, h: 120, text: "Inner" });
		const clip = copySelection(script, new Set(["note"]), registry);
		expect(clip.comments.map((c) => c.id).sort()).toEqual(["inner", "note"]);
		expect(clip.nodes.map((n) => n.id).sort()).toEqual(["left", "right"]);
	});

	/** Only in this direction: a node does not drag its comment along. */
	it("does not happen the other way round", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left"]), registry);
		expect(clip.comments).toEqual([]);
		expect(clip.nodes.map((n) => n.id)).toEqual(["left"]);
	});

	it("leaves a node outside the box alone", () => {
		const { script } = graph();
		script.nodes.push({ id: "far", def: "debug.print", x: 2000, y: 2000 });
		expect([...withCommentContents(script, new Set(["note"]), registry)].sort())
			.toEqual(["left", "note", "right"]);
	});
});

describe("a clipping pasted at a point", () => {
	/**
	 * The corner is the smallest x and the smallest y across everything in the
	 * clipping, which here is the comment's — it reaches further up and left
	 * than either node, and it is part of what is being placed.
	 */
	it("puts its top-left corner exactly there", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["note"]), registry);
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const corner = [...added(script, after), ...addedComments(script, after)];
		expect(Math.min(...corner.map((i) => i.x))).toBe(1000);
		expect(Math.min(...corner.map((i) => i.y))).toBe(500);
	});

	it("keeps everything in the same place relative to everything else", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["note"]), registry);
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const copies = added(script, after);
		// The two nodes were 160 apart across and 40 apart down.
		expect(Math.max(...copies.map((n) => n.x)) - Math.min(...copies.map((n) => n.x))).toBe(160);
		expect(Math.max(...copies.map((n) => n.y)) - Math.min(...copies.map((n) => n.y))).toBe(40);
		expect(addedComments(script, after)[0]).toMatchObject({ x: 1000, y: 500, w: 500, h: 260 });
	});

	/**
	 * The whole point, stated as the thing that was wrong: a pasted comment
	 * contains the copies and nothing else.
	 */
	it("encloses the copies and leaves the originals outside", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["note"]), registry);
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const box = addedComments(script, after)[0];
		const inside = new Set(withCommentContents(after, new Set([box.id]), registry));
		inside.delete(box.id);
		expect([...inside].sort()).toEqual(added(script, after).map((n) => n.id).sort());
		for (const original of ["left", "right"]) expect(inside.has(original), original).toBe(false);
	});

	it("falls back to the offset when there is no pointer", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left"]), registry);
		const { script: after } = pasteClipping(script, clip);
		expect(added(script, after)[0]).toMatchObject({ x: 232, y: 172 });
	});

	/** A clipping is a set of positions, not a set of ids: pasting twice differs. */
	it("goes wherever it is told, twice over", () => {
		const { script } = graph();
		const clip = copySelection(script, new Set(["left"]), registry);
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

		const clip = copySelection(script, new Set([fn]), registry);
		const { script: after } = pasteClipping(script, clip, { at: { x: 900, y: 40 } });

		const copies = added(script, after);
		const declaration = copies.find((n) => n.def === "function.declareHere")!;
		const body = copies.find((n) => n.def === "debug.print")!;
		expect(declaration).toMatchObject({ x: 900, y: 40 });
		expect(body).toMatchObject({ x: 500, y: 300 });
		expect(body.graph).toBe(declaration.id);
	});
});

/**
 * Every graph of a file has its own coordinate space and they all start at the
 * same origin, so the same numbers mean different places in different graphs.
 * Both of these were one question asked without saying which graph it was about.
 */
describe("a file with more than one graph", () => {
	/** A comment in the script's graph, and a function's nodes at the same numbers. */
	function overlapping() {
		const b = new Builder();
		const here = b.node("debug.print", { id: "here", x: 200, y: 140 });
		const fn = b.node("function.declareHere", {
			id: "fn", x: 900, y: 900, inner: { x: 40, y: 40 }, config: { name: "value" },
		});
		// Deliberately at the same coordinates as the comment in the other graph.
		b.node("debug.print", { id: "elsewhere", x: 220, y: 150, graph: fn });
		b.script.comments.push({ id: "note", x: 160, y: 60, w: 500, h: 260, text: "Around here" });
		return { script: b.build(), here, fn };
	}

	it("only takes what is in the comment's own graph", () => {
		const { script } = overlapping();
		const clip = copySelection(script, new Set(["note"]), registry);
		expect(clip.nodes.map((n) => n.id)).toEqual(["here"]);
	});

	it("asks the same question of a drag, which moves what it is handed", () => {
		const { script } = overlapping();
		expect([...commentContents(script, registry, "note")]).toEqual(["here"]);
	});

	/**
	 * The paste used to test "was this copied from the nodescript's own graph",
	 * which is no for everything copied while a function's graph is open — so
	 * the landing set came out empty and the pointer was ignored in exactly the
	 * graphs most of the work happens in.
	 */
	it("pastes at the pointer for something copied inside a function's graph", () => {
		const { script, fn } = overlapping();
		const clip = copySelection(script, new Set(["elsewhere"]), registry);
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const copy = added(script, after)[0];
		expect(copy).toMatchObject({ x: 1000, y: 500 });
		// Its function was not copied, so it lands in whichever graph is open —
		// which the store fills in — rather than claiming the original's.
		expect(copy.graph).toBeUndefined();
		expect(fn).toBe("fn");
	});

	/** A function that *is* copied keeps its own graph's layout, as before. */
	it("still leaves a copied function's body where it was", () => {
		const { script } = overlapping();
		const clip = copySelection(script, new Set(["fn"]), registry);
		const { script: after } = pasteClipping(script, clip, { at: { x: 1000, y: 500 } });

		const copies = added(script, after);
		const declaration = copies.find((n) => n.def === "function.declareHere")!;
		const body = copies.find((n) => n.id !== declaration.id)!;
		expect(declaration).toMatchObject({ x: 1000, y: 500 });
		expect(body).toMatchObject({ x: 220, y: 150 });
		expect(body.graph).toBe(declaration.id);
	});
});

/**
 * The node designer's canvas is the graph editor's canvas, and is meant to
 * behave like it. Copy and paste live in the editor's shell, which the designer
 * page does not have — so they were missing there until 0.36.6, in the one way
 * you notice while building a node out of three copies of the same pair.
 */
describe("a node's logic canvas", () => {
	function logic() {
		const b = new Builder();
		b.node(LOGIC_INPUTS, { id: "logic-inputs", x: 80, y: 120 });
		b.node(LOGIC_OUTPUTS, { id: "logic-outputs", x: 640, y: 120 });
		const step = b.node("debug.print", { id: "step", x: 300, y: 120 });
		b.link("logic-inputs", "then", step, "in");
		b.link(step, "then", "logic-outputs", "in");
		b.script.comments.push({ id: "all", x: 40, y: 60, w: 900, h: 260, text: "Everything" });
		return b.build();
	}

	/** A second Node Inputs is a thing `compileLogic` refuses outright. */
	it("will not copy the two ends", () => {
		const script = logic();
		const clip = withoutEnds(copySelection(script, new Set(["all"]), registry));
		expect(clip.nodes.map((n) => n.id)).toEqual(["step"]);
		// The wires to the ends go with them; nothing dangles.
		expect(clip.links).toEqual([]);
	});

	it("keeps the comment, which is ordinary", () => {
		const script = logic();
		const clip = withoutEnds(copySelection(script, new Set(["all"]), registry));
		expect(clip.comments.map((c) => c.id)).toEqual(["all"]);
	});

	it("will not take the ends away either", () => {
		const script = logic();
		const picked = new Set(["logic-inputs", "logic-outputs", "step"]);
		expect([...removable(script, picked)]).toEqual(["step"]);
	});

	it("pastes what is left at the pointer", () => {
		const script = logic();
		const clip = withoutEnds(copySelection(script, new Set(["step"]), registry));
		const { script: after } = pasteClipping(script, clip, { at: { x: 500, y: 400 } });
		expect(added(script, after)[0]).toMatchObject({ x: 500, y: 400 });
	});
});
