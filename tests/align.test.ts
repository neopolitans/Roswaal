/**
 * Lining a selection up on the node you picked first.
 *
 * The editor could tidy a whole graph — `Realign` — and could not straighten
 * two nodes. Those are different jobs: a full layout decides every column and
 * throws away the arrangement you built, which is not what you want when one
 * node is a few pixels low.
 *
 * **The interesting rule is that pins align, not boxes.** A reroute knot is a
 * dot with both its pins at its centre; the node it feeds has an input some way
 * down a header. Matching their tops leaves the wire bent, which is the exact
 * thing the alignment was for. So where two nodes are wired, the alignment is
 * computed from `pinPosition` — the same function the wire router draws with,
 * so "flat" here means what a flat wire means.
 */

import { describe, expect, it } from "vitest";

import { alignToAnchor, selectionAnchor } from "../src/app/edits.js";
import { pinPosition } from "../src/app/geometry.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { GraphNode, NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

const at = (script: NodeScript, id: string): GraphNode =>
	script.nodes.find((n) => n.id === id)!;

/** The y a wire leaves or arrives at, in world coordinates. */
const pinY = (script: NodeScript, id: string, pin: string, side: "in" | "out"): number =>
	pinPosition(at(script, id), registry, pin, side)!.y;

describe("which node is the anchor", () => {
	it("is the first one that went into the selection", () => {
		const b = new Builder();
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		const script = b.build();

		expect(selectionAnchor(script, new Set([first, second]))).toBe(first);
		expect(selectionAnchor(script, new Set([second, first]))).toBe(second);
	});

	/**
	 * Comments share the selection with nodes and have no pins, so one picked
	 * first cannot be what the rest line up on.
	 */
	it("skips a comment that was picked first", () => {
		const b = new Builder();
		const node = b.node("debug.print");
		const script = b.build();
		script.comments = [{ id: "c1", x: 0, y: 0, w: 200, h: 120, text: "" }];

		expect(selectionAnchor(script, new Set(["c1", node]))).toBe(node);
	});

	it("has no answer when nothing but comments is selected", () => {
		const b = new Builder();
		const script = b.build();
		script.comments = [{ id: "c1", x: 0, y: 0, w: 200, h: 120, text: "" }];

		expect(selectionAnchor(script, new Set(["c1"]))).toBeNull();
	});
});

describe("aligning to the anchor", () => {
	/** A knot feeding a Print: the case the whole thing exists for. */
	function knotIntoPrint(knotY: number, printY: number) {
		const b = new Builder();
		const knot = b.node("flow.reroute", { x: 100, y: knotY, config: { type: "string" } });
		const print = b.node("debug.print", { x: 300, y: printY });
		b.link(knot, "out", print, "value");
		return { script: b.build(), knot, print };
	}

	it("straightens the wire out of a knot", () => {
		const { script, knot, print } = knotIntoPrint(200, 340);
		const out = alignToAnchor(script, registry, new Set([knot, print]), knot);

		expect(pinY(out, print, "value", "in")).toBeCloseTo(pinY(out, knot, "out", "out"), 5);
	});

	/**
	 * The boxes do *not* end up level, and that is the point — a knot is 14-odd
	 * pixels tall and a Print's Value pin sits below its header.
	 */
	it("does not just line the boxes up", () => {
		const { script, knot, print } = knotIntoPrint(200, 340);
		const out = alignToAnchor(script, registry, new Set([knot, print]), knot);

		expect(at(out, print).y).not.toBe(at(out, knot).y);
	});

	it("leaves the anchor exactly where it was", () => {
		const { script, knot, print } = knotIntoPrint(200, 340);
		const out = alignToAnchor(script, registry, new Set([knot, print]), knot);

		expect(at(out, knot)).toEqual(at(script, knot));
	});

	/** Columns are information: a node moved sideways claims a different order. */
	it("moves nothing horizontally", () => {
		const { script, knot, print } = knotIntoPrint(200, 340);
		const out = alignToAnchor(script, registry, new Set([knot, print]), knot);

		expect(at(out, print).x).toBe(at(script, print).x);
	});

	/** Aligning something already aligned should not push it a pixel. */
	it("is idempotent", () => {
		const { script, knot, print } = knotIntoPrint(200, 340);
		const once = alignToAnchor(script, registry, new Set([knot, print]), knot);
		const twice = alignToAnchor(once, registry, new Set([knot, print]), knot);

		expect(twice.nodes).toEqual(once.nodes);
	});

	/** Works the other way round the wire, so either end can be the anchor. */
	it("moves the knot onto the node when the node is the anchor", () => {
		const { script, knot, print } = knotIntoPrint(200, 340);
		const out = alignToAnchor(script, registry, new Set([print, knot]), print);

		expect(at(out, print)).toEqual(at(script, print));
		expect(pinY(out, knot, "out", "out")).toBeCloseTo(pinY(out, print, "value", "in"), 5);
	});

	/** One anchor, several things hanging off it, one keystroke. */
	it("straightens every wire out of the anchor at once", () => {
		const b = new Builder();
		const knot = b.node("flow.reroute", { x: 100, y: 200, config: { type: "string" } });
		const first = b.node("debug.print", { x: 300, y: 40 });
		const second = b.node("debug.print", { x: 520, y: 700 });
		b.link(knot, "out", first, "value");
		b.link(knot, "out", second, "value");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([knot, first, second]), knot);
		const level = pinY(out, knot, "out", "out");
		expect(pinY(out, first, "value", "in")).toBeCloseTo(level, 5);
		expect(pinY(out, second, "value", "in")).toBeCloseTo(level, 5);
	});

	/**
	 * With no wire there is no pin to agree with, so the top edges go together.
	 * Which is what "align" means everywhere else, and the only reading left.
	 */
	it("lines the tops up when the two are not connected", () => {
		const b = new Builder();
		const anchor = b.node("debug.print", { x: 100, y: 200 });
		const loose = b.node("debug.print", { x: 400, y: 615 });
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([anchor, loose]), anchor);
		expect(at(out, loose).y).toBe(200);
	});

	it("leaves nodes that are not selected alone", () => {
		const b = new Builder();
		const anchor = b.node("debug.print", { x: 100, y: 200 });
		const moved = b.node("debug.print", { x: 400, y: 615 });
		const other = b.node("debug.print", { x: 700, y: 900 });
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([anchor, moved]), anchor);
		expect(at(out, other)).toEqual(at(script, other));
	});

	/**
	 * A comment is a box drawn around nodes. Sliding it off them to line its
	 * top up with a node is not a tidy-up, so it stays.
	 */
	it("does not move comments", () => {
		const b = new Builder();
		const anchor = b.node("debug.print", { x: 100, y: 200 });
		const script = b.build();
		script.comments = [{ id: "c1", x: 0, y: 800, w: 200, h: 120, text: "" }];

		const out = alignToAnchor(script, registry, new Set([anchor, "c1"]), anchor);
		expect(out.comments).toEqual(script.comments);
	});

	it("returns the same script when there is nothing to move", () => {
		const b = new Builder();
		const anchor = b.node("debug.print", { x: 100, y: 200 });
		const script = b.build();

		expect(alignToAnchor(script, registry, new Set([anchor]), anchor)).toBe(script);
	});

	it("returns the same script when the anchor is gone", () => {
		const b = new Builder();
		const node = b.node("debug.print", { x: 100, y: 200 });
		const script = b.build();

		expect(alignToAnchor(script, registry, new Set([node]), "no-such-node")).toBe(script);
	});

	/** Exec wires straighten the same way, which is what a spine is made of. */
	it("straightens an execution wire too", () => {
		const b = new Builder();
		const begin = b.node("script.begin", { x: 0, y: 100 });
		const print = b.node("debug.print", { x: 260, y: 480 });
		b.link(begin, "then", print, "in");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([begin, print]), begin);
		expect(pinY(out, print, "in", "in")).toBeCloseTo(pinY(out, begin, "then", "out"), 5);
	});

	/**
	 * The reason alignment walks the selection instead of pointing everything at
	 * the anchor. A source feeds a knot and the knot feeds a Print: the Print is
	 * wired to the knot and to nothing else, so anchoring it on the source would
	 * leave it with no pin to agree with and fall back to a top edge.
	 */
	it("straightens a chain link by link", () => {
		const b = new Builder();
		const source = b.node("value.string", { x: 0, y: 100 });
		const knot = b.node("flow.reroute", { x: 240, y: 500, config: { type: "string" } });
		const print = b.node("debug.print", { x: 460, y: 30 });
		b.link(source, "result", knot, "in");
		b.link(knot, "out", print, "value");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([source, knot, print]), source);

		expect(pinY(out, knot, "in", "in")).toBeCloseTo(pinY(out, source, "result", "out"), 5);
		expect(pinY(out, print, "value", "in")).toBeCloseTo(pinY(out, knot, "out", "out"), 5);
	});

	/**
	 * And the third node lands on where the second was *put*, not where it
	 * started — which is the difference between a chain and three separate
	 * moves onto stale positions.
	 */
	it("aligns the third node to the second's new home", () => {
		const b = new Builder();
		const source = b.node("value.string", { x: 0, y: 100 });
		const knot = b.node("flow.reroute", { x: 240, y: 500, config: { type: "string" } });
		const print = b.node("debug.print", { x: 460, y: 30 });
		b.link(source, "result", knot, "in");
		b.link(knot, "out", print, "value");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([source, knot, print]), source);
		const stale = alignToAnchor(script, registry, new Set([source, knot]), source);

		// The knot moved, so a Print aligned to the knot's old y would be wrong.
		expect(at(out, knot).y).not.toBe(at(script, knot).y);
		expect(pinY(out, print, "value", "in"))
			.toBeCloseTo(pinPosition(at(stale, knot), registry, "out", "out")!.y, 5);
	});

	/**
	 * Walking the selection must not break the fan-out: both consumers are wired
	 * to the knot, and the second is not wired to the first, so the search past
	 * its predecessor is what finds the knot again.
	 */
	it("still straightens a fan-out when the consumers are picked in turn", () => {
		const b = new Builder();
		const knot = b.node("flow.reroute", { x: 100, y: 200, config: { type: "string" } });
		const first = b.node("debug.print", { x: 300, y: 40 });
		const second = b.node("debug.print", { x: 520, y: 700 });
		b.link(knot, "out", first, "value");
		b.link(knot, "out", second, "value");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([knot, first, second]), knot);
		const level = pinY(out, knot, "out", "out");
		expect(pinY(out, first, "value", "in")).toBeCloseTo(level, 5);
		expect(pinY(out, second, "value", "in")).toBeCloseTo(level, 5);
	});

	/**
	 * No wired path to the anchor means no pin to agree with, so it takes the
	 * anchor's top edge. The anchor rather than whatever happened to be picked
	 * before it, because pick order is the thing this stopped depending on.
	 */
	it("falls back to the anchor's top edge when no wire reaches it", () => {
		const b = new Builder();
		const source = b.node("value.string", { x: 0, y: 100 });
		const knot = b.node("flow.reroute", { x: 240, y: 500, config: { type: "string" } });
		const loose = b.node("debug.print", { x: 460, y: 900 });
		b.link(source, "result", knot, "in");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([source, knot, loose]), source);
		expect(at(out, loose).y).toBe(100);
		// The knot still straightens; being unreachable is per node, not per run.
		expect(pinY(out, knot, "in", "in")).toBeCloseTo(pinY(out, source, "result", "out"), 5);
	});

	/** Which node you picked first is the whole input, so it has to matter. */
	it("gives a different answer when the chain is picked backwards", () => {
		const b = new Builder();
		const source = b.node("value.string", { x: 0, y: 100 });
		const knot = b.node("flow.reroute", { x: 240, y: 500, config: { type: "string" } });
		const print = b.node("debug.print", { x: 460, y: 30 });
		b.link(source, "result", knot, "in");
		b.link(knot, "out", print, "value");
		const script = b.build();

		const forwards = alignToAnchor(script, registry, new Set([source, knot, print]), source);
		const backwards = alignToAnchor(script, registry, new Set([print, knot, source]), print);

		expect(at(backwards, print)).toEqual(at(script, print));
		expect(at(forwards, source)).toEqual(at(script, source));
		// Both straighten the chain; they just straighten it onto different ends.
		expect(pinY(backwards, source, "result", "out"))
			.toBeCloseTo(pinY(backwards, knot, "in", "in"), 5);
	});

	/** A chain that is already straight is a chain nothing touches. */
	it("is idempotent over a chain", () => {
		const b = new Builder();
		const source = b.node("value.string", { x: 0, y: 100 });
		const knot = b.node("flow.reroute", { x: 240, y: 500, config: { type: "string" } });
		const print = b.node("debug.print", { x: 460, y: 30 });
		b.link(source, "result", knot, "in");
		b.link(knot, "out", print, "value");
		const script = b.build();
		const ids = new Set([source, knot, print]);

		const once = alignToAnchor(script, registry, ids, source);
		expect(alignToAnchor(once, registry, ids, source).nodes).toEqual(once.nodes);
	});

	/**
	 * The bug that made this follow wires instead of pick order.
	 *
	 * A knot feeding Get Full Name feeding Concatenate, with Concatenate picked
	 * first. Aligning each node to the most recently placed one put the knot
	 * down before Get Full Name, so Get Full Name found a wired neighbour and
	 * Concatenate — wired only to Get Full Name, which had not been placed yet
	 * — found none and fell back to a top edge. The first two hops came out
	 * flat and the last one did not, which is exactly what it looked like.
	 */
	it("straightens the whole chain however it was picked", () => {
		const b = new Builder();
		const knot = b.node("flow.reroute", { x: 0, y: 60, config: { type: "Instance" } });
		const full = b.node("instance.getFullName", { x: 200, y: 20 });
		const cat = b.node("string.concat", { x: 460, y: 55 });
		b.link(knot, "out", full, "instance");
		b.link(full, "result", cat, "a0");
		const script = b.build();

		for (const order of [
			[knot, full, cat], [cat, knot, full], [full, cat, knot],
			[cat, full, knot], [knot, cat, full], [full, knot, cat],
		]) {
			const out = alignToAnchor(script, registry, new Set(order), order[0]);
			expect(pinY(out, full, "instance", "in"), order.join(","))
				.toBeCloseTo(pinY(out, knot, "out", "out"), 5);
			expect(pinY(out, cat, "a0", "in"), order.join(","))
				.toBeCloseTo(pinY(out, full, "result", "out"), 5);
		}
	});

	/**
	 * Which node is the anchor is the one thing pick order still decides — a
	 * marquee hands over a set in file order, and that has to stay harmless.
	 */
	it("gives the same shape from any order, anchored wherever it starts", () => {
		const b = new Builder();
		const knot = b.node("flow.reroute", { x: 0, y: 60, config: { type: "Instance" } });
		const full = b.node("instance.getFullName", { x: 200, y: 20 });
		const cat = b.node("string.concat", { x: 460, y: 55 });
		b.link(knot, "out", full, "instance");
		b.link(full, "result", cat, "a0");
		const script = b.build();

		// Same anchor, different order behind it: identical result.
		const a = alignToAnchor(script, registry, new Set([knot, full, cat]), knot);
		const c = alignToAnchor(script, registry, new Set([knot, cat, full]), knot);
		expect(c.nodes).toEqual(a.nodes);
	});

	/** Reached two ways, aligned on the shorter path — not on whichever was last. */
	it("takes the neighbour nearest the anchor when a node is reachable twice", () => {
		const b = new Builder();
		const source = b.node("value.string", { x: 0, y: 100 });
		const near = b.node("string.concat", { x: 240, y: 400 });
		b.link(source, "result", near, "a0");
		b.link(source, "result", near, "a1");
		const script = b.build();

		const out = alignToAnchor(script, registry, new Set([source, near]), source);
		// The first link wins, so A is the pin that goes flat.
		expect(pinY(out, near, "a0", "in")).toBeCloseTo(pinY(out, source, "result", "out"), 5);
	});

	/** Whole coordinates: half a pixel of node position helps nobody. */
	it("leaves positions on whole numbers", () => {
		const { script, knot, print } = knotIntoPrint(207, 341);
		const out = alignToAnchor(script, registry, new Set([knot, print]), knot);

		expect(Number.isInteger(at(out, print).y)).toBe(true);
	});
});
