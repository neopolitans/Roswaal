/**
 * Picking a wire up off a data input and dropping it on empty canvas puts the
 * node you pick in between: the value feeds the new node, and the new node
 * feeds the input the wire came off. Without it the input was left bare, to be
 * wired back by hand.
 *
 * The data half of `insertIntoChain`. An output fans out, so dragging off one
 * still adds a reader; only the input end, which takes one wire, inserts.
 */

import { afterEach, describe, expect, it } from "vitest";

import { addNode, connect, insertIntoWire, landingPins, removeLink } from "../src/app/edits.js";
import { fitFor, libraryItems, type WireFrom } from "../src/app/menuSearch.js";
import { store } from "../src/app/store.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript, PinRef } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** `speed` (a number local) read into a Print, which Begin runs. */
function readIntoPrint() {
	const b = new Builder();
	const begin = b.node("script.begin");
	const speed = b.node("local.declare");
	b.lit(speed, "name", { t: "string", v: "speed" }).lit(speed, "value", { t: "number", v: 16 });
	const get = b.node("local.get", { config: { local: speed, name: "speed", type: "number" } });
	const print = b.node("debug.print");
	b.link(begin, "then", speed, "in").link(speed, "then", print, "in");
	b.link(get, "value", print, "value");
	return { script: b.build(), get, print, speed };
}

/**
 * What the canvas and the menu do between them: the wire into `reader` is
 * picked up, a `def` is placed, the value goes into its first input that fits,
 * and the node is put in between.
 */
function pickUpAndInsert(script: NodeScript, reader: PinRef, defId: string) {
	const wire = script.links.find((l) => l.to.node === reader.node && l.to.pin === reader.pin)!;
	const lifted = removeLink(script, wire.id, registry);
	const def = registry.get(defId)!;
	const placed = addNode(lifted, def, 400, 200);
	const node = placed.script.nodes.find((n) => n.id === placed.id)!;
	const source = placed.script.nodes.find((n) => n.id === wire.from.node)!;
	const sourcePin = resolveNodePins(registry.get(source.def)!, source.config).outputs.find(
		(p) => p.id === wire.from.pin,
	)!;
	const landing = landingPins(def, resolveNodePins(def, node.config).inputs, sourcePin, "in")[0];
	const fed = connect(placed.script, registry, wire.from, { node: placed.id, pin: landing.id });
	return { script: insertIntoWire(fed, registry, placed.id, reader), id: placed.id, landing };
}

const wires = (script: NodeScript, names: Record<string, string>) => {
	const name = (id: string) => Object.entries(names).find(([, v]) => v === id)?.[0] ?? "?";
	return script.links
		.map((l) => `${name(l.from.node)}.${l.from.pin} -> ${name(l.to.node)}.${l.to.pin}`)
		.sort();
};

describe("inserting a node into a data wire", () => {
	it("puts a pure node between the value and the input it fed", () => {
		const { script, get, print, speed } = readIntoPrint();
		const out = pickUpAndInsert(script, { node: print, pin: "value" }, "math.round");
		expect(out.landing.id).toBe("a");
		const names = { get, print, speed, round: out.id, begin: script.nodes[0].id };
		expect(wires(out.script, names)).toEqual([
			"begin.then -> speed.in",
			"get.value -> round.a",
			"round.result -> print.value",
			"speed.then -> print.in",
		]);
	});

	it("removes the old wire rather than adding beside it", () => {
		const { script, get, print } = readIntoPrint();
		const out = pickUpAndInsert(script, { node: print, pin: "value" }, "math.round");
		expect(out.script.links.some((l) => l.from.node === get && l.to.node === print)).toBe(false);
		expect(
			out.script.links.filter((l) => l.to.node === print && l.to.pin === "value"),
		).toHaveLength(1);
	});

	/** A step goes on the reader's chain just before it, so its value is made where it is used. */
	it("runs a step just before the reader, when the reader has one way in", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const get = b.node("roblox.getService", {});
		b.lit(get, "service", { t: "string", v: "Workspace" });
		const print = b.node("debug.print");
		b.link(begin, "then", print, "in").link(get, "service", print, "value");
		const script = b.build();
		const out = pickUpAndInsert(script, { node: print, pin: "value" }, "instance.clone");
		const names = { begin, get, print, clone: out.id };
		expect(wires(out.script, names)).toEqual([
			"begin.then -> clone.in",
			"clone.result -> print.value",
			"clone.then -> print.in",
			"get.service -> clone.instance",
		]);
	});

	it("wires only the data when the reader has several ways in", () => {
		const b = new Builder();
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		const get = b.node("roblox.getService", {});
		b.lit(get, "service", { t: "string", v: "Workspace" });
		const print = b.node("debug.print");
		b.link(a, "then", print, "in")
			.link(c, "then", print, "in")
			.link(get, "service", print, "value");
		const out = pickUpAndInsert(b.build(), { node: print, pin: "value" }, "instance.clone");
		const names = { a, c, get, print, clone: out.id };
		expect(wires(out.script, names)).toEqual([
			"a.then -> print.in",
			"c.then -> print.in",
			"clone.result -> print.value",
			"get.service -> clone.instance",
		]);
	});

	/** Today's behaviour, unchanged: the new node takes the wire, the input is left bare. */
	it("leaves the input bare when the new node's output does not fit it", () => {
		const b = new Builder();
		const get = b.node("local.get", { config: { local: "x", name: "speed", type: "number" } });
		const round = b.node("math.round");
		const find = b.node("roblox.findFirstChild");
		b.link(get, "value", round, "a");
		const script = b.build();
		// A number cannot go into Find First Child's Instance.
		expect(insertIntoWire(script, registry, round, { node: find, pin: "parent" })).toBe(script);
	});
});

describe("the menu, for a wire picked up off an input", () => {
	const items = libraryItems(registry, "roblox", []);
	const item = (id: string) => items.find((i) => i.def.id === id && !i.config)!;
	const numberOut = resolveNodePins(registry.get("local.get")!, { type: "number" }).outputs[0];
	const from = (readerType: string): WireFrom => ({
		ref: { node: "get", pin: "value" },
		side: "out",
		pin: numberOut,
		reader: {
			ref: { node: "reader", pin: "x" },
			pin: { id: "x", name: "x", kind: "data", type: readerType },
		},
	});
	const plain: WireFrom = { ref: { node: "get", pin: "value" }, side: "out", pin: numberOut };

	it("ranks a node that fits both ends above one that only takes the wire", () => {
		expect(fitFor(item("math.round"), from("number"))).toBe(fitFor(item("math.round"), plain) + 2);
	});

	it("gives nothing extra to a node that cannot feed the input back", () => {
		expect(fitFor(item("math.round"), from("Instance"))).toBe(fitFor(item("math.round"), plain));
	});
});

describe("undoing it", () => {
	afterEach(() => store.close());

	it("puts the wire back as it was", () => {
		const { script, print } = readIntoPrint();
		store.open("/insert.nodescript", script);
		const before = store
			.getSnapshot()
			.script!.links.map((l) => l.id)
			.sort();
		store.edit((s) => pickUpAndInsert(s, { node: print, pin: "value" }, "math.round").script);
		expect(
			store
				.getSnapshot()
				.script!.links.map((l) => l.id)
				.sort(),
		).not.toEqual(before);
		store.undo();
		expect(
			store
				.getSnapshot()
				.script!.links.map((l) => l.id)
				.sort(),
		).toEqual(before);
	});
});
