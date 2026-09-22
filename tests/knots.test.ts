/**
 * Reroute knots, and the type they carry.
 *
 * A knot is a bend in a wire. It has no type of its own — it has the type of
 * whatever is going through it — but the type was written into its config once,
 * when the knot was made, and then kept for good.
 *
 * So disconnecting the wire feeding a string knot left a knot that was still a
 * string knot: it refused every output but a string, and the only way to rewire
 * it was to delete it and cut the wire again. That is the bug these are about.
 * `retypeReroutes` runs after anything that changes a link and gives every knot
 * the type of what is actually feeding it, or `any` when nothing is.
 */

import { describe, expect, it } from "vitest";

import {
	canConnect, connect, deleteSelection, disconnectPin, insertReroute, removeLink,
	retypeReroutes,
} from "../src/app/edits.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { GraphNode, NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

const at = (script: NodeScript, id: string): GraphNode =>
	script.nodes.find((n) => n.id === id)!;

const typeOf = (script: NodeScript, id: string): string | undefined =>
	(at(script, id).config as { type?: string } | undefined)?.type;

/**
 * A string source feeding a knot feeding a Print, with an unwired Instance
 * source sitting to one side.
 *
 * Everything comes out of **one** `Builder`, because a Builder numbers its
 * nodes `n1`, `n2` from zero — so two of them merged into one script give two
 * nodes called `n1`, and every lookup by id silently finds the wrong one. That
 * is how the first version of these tests came to assert that an Instance fits
 * a string pin: it was quietly asking about the string source.
 */
function wired() {
	const b = new Builder();
	const source = b.node("value.string", { x: 0, y: 0 });
	const print = b.node("debug.print", { x: 400, y: 0 });
	const finder = b.node("instance.findFirstChildOfClass", { x: 0, y: 200 });
	b.link(source, "result", print, "value");
	const script = b.build();

	const link = script.links[0].id;
	const made = insertReroute(script, registry, link, { x: 200, y: 0 })!;
	return { script: made.script, knot: made.id, source, print, finder };
}

describe("a knot takes the type of what feeds it", () => {
	it("starts as the type of the wire it was dropped into", () => {
		const { script, knot } = wired();
		expect(typeOf(script, knot)).toBe("string");
	});

	/** The bug: cut the input and the knot stayed a string knot forever. */
	it("goes back to any when its input is cut", () => {
		const { script, knot } = wired();
		const out = disconnectPin(script, knot, "in", "in", registry);
		expect(typeOf(out, knot)).toBe("any");
	});

	it("goes back to any when the wire into it is removed by id", () => {
		const { script, knot } = wired();
		const into = script.links.find((l) => l.to.node === knot)!;
		expect(typeOf(removeLink(script, into.id, registry), knot)).toBe("any");
	});

	it("goes back to any when whatever fed it is deleted", () => {
		const { script, knot, source } = wired();
		const out = deleteSelection(script, new Set([source]), registry);
		expect(typeOf(out, knot)).toBe("any");
	});

	it("takes the new type when something else is wired in", () => {
		const { script, knot, finder } = wired();
		const cut = disconnectPin(script, knot, "in", "in", registry);

		const out = connect(
			cut, registry, { node: finder, pin: "result" }, { node: knot, pin: "in" },
		);
		// `Humanoid` rather than `Instance` since 0.77.0: a node that names a
		// class hands back that class, and Find First Child Of Class starts on
		// Humanoid.
		expect(typeOf(out, knot)).toBe("Humanoid");
	});

	/**
	 * The symptom this was reported as: an orphaned knot would not take a wire
	 * back, because it was still asking for the type it used to be.
	 *
	 * An Instance into a string knot, not a number — number and string are
	 * deliberately compatible, so that pair would connect either way and prove
	 * nothing about the knot.
	 */
	it("accepts a wire it used to refuse, once it has been orphaned", () => {
		const { script, knot, finder } = wired();
		const wire = { node: finder, pin: "result" };
		const into = { node: knot, pin: "in" };

		// While it is still a string knot, an Instance does not fit.
		expect(canConnect(script, registry, wire, into).ok).toBe(false);

		const cut = disconnectPin(script, knot, "in", "in", registry);
		const after = canConnect(cut, registry, wire, into);
		expect(after.ok, after.ok ? "" : after.reason).toBe(true);
	});

	/** A knot feeding a knot only learns its type once the one before it has. */
	it("carries a type down a chain of knots", () => {
		const { script, knot, print } = wired();
		const toPrint = script.links.find((l) => l.to.node === print)!;
		const second = insertReroute(script, registry, toPrint.id, { x: 300, y: 0 })!;

		// Blank both, then let one pass settle them from the source outwards.
		const blanked: NodeScript = {
			...second.script,
			nodes: second.script.nodes.map((n) =>
				n.def === "flow.reroute" ? { ...n, config: { type: "any" } } : n,
			),
		};
		const settled = retypeReroutes(blanked, registry);

		expect(typeOf(settled, knot)).toBe("string");
		expect(typeOf(settled, second.id)).toBe("string");
	});

	it("leaves a graph with no knots exactly as it was", () => {
		const b = new Builder();
		const source = b.node("value.string");
		const print = b.node("debug.print");
		b.link(source, "result", print, "value");
		const script = b.build();

		expect(retypeReroutes(script, registry)).toBe(script);
	});

	it("returns the same script when every knot is already right", () => {
		const { script } = wired();
		expect(retypeReroutes(script, registry)).toBe(script);
	});

	/** Execution knots have no type to carry, so nothing here touches them. */
	it("does not touch an execution knot", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const print = b.node("debug.print");
		b.link(begin, "then", print, "in");
		const script = b.build();

		const made = insertReroute(script, registry, script.links[0].id, { x: 100, y: 0 })!;
		expect(at(made.script, made.id).def).toBe("flow.rerouteExec");
		expect(at(made.script, made.id).config).toBeUndefined();
		expect(retypeReroutes(made.script, registry)).toBe(made.script);
	});
});
