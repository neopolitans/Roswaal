/**
 * Auto-layout, and specifically the execution-pin alignment pass.
 *
 * The plain column tidy is a heuristic and asserting on its exact output would
 * make it unimprovable. What is worth pinning down is the alignment pass, which
 * makes a precise promise — a node sits where its incoming execution wire comes
 * out flat — and a sweep that has to break that promise safely when two nodes
 * want the same height.
 */

import { describe, expect, it } from "vitest";

import { createRegistry } from "../src/core/nodes/index.js";
import { autoLayout } from "../src/app/layout.js";
import { nodeBounds, pinPosition } from "../src/app/geometry.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** World Y of one pin, after a layout has moved things around. */
function pinY(script: NodeScript, nodeId: string, pin: string, side: "in" | "out"): number {
	const node = script.nodes.find((n) => n.id === nodeId)!;
	return pinPosition(node, registry, pin, side)!.y;
}

function nodeAt(script: NodeScript, id: string) {
	const node = script.nodes.find((n) => n.id === id)!;
	return { node, box: nodeBounds(node, registry) };
}

describe("execution pin alignment", () => {
	/**
	 * Script Start is one row tall and Destroy is two, so centring their columns
	 * against each other leaves the two execution pins at different heights.
	 * That is exactly the staircase the pass exists to remove.
	 */
	it("puts a node where its incoming execution wire comes out flat", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const destroy = b.node("roblox.destroy");
		b.link(begin, "then", destroy, "in");

		const aligned = autoLayout(b.build(), registry, { alignExec: true });

		expect(pinY(aligned, destroy, "in", "in")).toBe(pinY(aligned, begin, "then", "out"));
	});

	it("leaves that staircase alone when the option is off", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const destroy = b.node("roblox.destroy");
		b.link(begin, "then", destroy, "in");

		const plain = autoLayout(b.build(), registry, { alignExec: false });

		// Not a demand that it be wrong — a demand that the two modes differ, so
		// a pass that silently did nothing would fail here rather than pass both.
		expect(pinY(plain, destroy, "in", "in")).not.toBe(pinY(plain, begin, "then", "out"));
	});

	/**
	 * A Branch's two execution outputs are one row apart, but the nodes they feed
	 * are far taller than a row. Both ask for a height 24px apart; only one can
	 * have it, and the other must end up clear rather than on top of it.
	 */
	it("resolves two nodes competing for the same height without overlapping them", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const branch = b.node("flow.branch");
		const onTrue = b.node("local.set");
		const onFalse = b.node("roblox.destroy");
		b.link(begin, "then", branch, "in");
		b.link(branch, "true", onTrue, "in");
		b.link(branch, "false", onFalse, "in");

		const aligned = autoLayout(b.build(), registry, { alignExec: true });

		// The upper claim is the one that survives: True leaves the Branch above
		// False, so it is swept first and gets the height it asked for.
		expect(pinY(aligned, onTrue, "in", "in")).toBe(pinY(aligned, branch, "true", "out"));

		const upper = nodeAt(aligned, onTrue);
		const lower = nodeAt(aligned, onFalse);
		expect(lower.node.y).toBeGreaterThanOrEqual(upper.node.y + upper.box.h);
	});

	/**
	 * A loop wires an exec output backwards into something to its left. Following
	 * that wire would drag a node up onto the node it feeds, so the pass has to
	 * ignore it — and, more importantly, must not hang trying.
	 */
	it("ignores execution wires that point backwards", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const loop = b.node("flow.while");
		const body = b.node("roblox.destroy");
		b.link(begin, "then", loop, "in");
		b.link(loop, "body", body, "in");
		b.link(body, "then", loop, "in");

		const aligned = autoLayout(b.build(), registry, { alignExec: true });

		expect(aligned.nodes).toHaveLength(3);
		for (const node of aligned.nodes) {
			expect(Number.isFinite(node.x)).toBe(true);
			expect(Number.isFinite(node.y)).toBe(true);
		}
	});
});
