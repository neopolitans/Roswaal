/**
 * A knot has the type of what it is carrying.
 *
 * It is a *cache* of the source pin's type, stored on the knot so the wire
 * router and the palette can read it without walking back up the graph. Like
 * every cache the interesting question is when it goes stale, and the answer
 * used to be "whenever anything but a wire changed".
 *
 * `retypeReroutes` was called by the four edits that add or remove a link, on
 * the theory that a knot's type only changes when its source changes. It also
 * changes when the source stays where it is and says something different — a
 * local given a type, a loop value given one, a function's parameter retyped —
 * and none of the twenty-odd edits that can do that called it. So these go
 * through the store, which is where the rule lives now, because that is the one
 * place every edit passes through.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { Builder } from "./helpers.js";
import { connect, setConfig, updateVariable, wireLanding } from "../src/app/edits.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { store } from "../src/app/store.js";
import { retypeReroutes } from "../src/core/reroutes.js";
import { graphSvg } from "../src/core/docs/preview.js";
import { NODE } from "../src/app/layers.js";
import { nodeColor, pinColor } from "../src/app/palette.js";
import type { NodeScript } from "../src/core/schema.js";

const registry = createRegistry();
const PATH = "scripts/Knots.nodescript";

beforeEach(() => {
	store.closeAll();
	store.setLocked(false);
	store.setRegistry(registry);
});

/**
 * A knot's type, reading an absent one as `any` — which is what it means, and
 * what `retypeReroutes` leaves rather than writing the word out.
 */
const typeOf = (id: string) =>
	(store.getSnapshot().script?.nodes.find((n) => n.id === id)?.config as { type?: string })?.type
	?? "any";

/** A Declare Local feeding a knot, which feeds a second knot. */
function chain(): NodeScript {
	const b = new Builder();
	const start = b.node("script.begin");
	const local = b.node("local.declare", { id: "local" });
	b.lit(local, "name", { t: "string", v: "thing" });
	b.node("flow.reroute", { id: "knot" });
	b.node("flow.reroute", { id: "knot2" });
	b.link(start, "then", local, "in");
	return b.build();
}

describe("a knot wired to an output", () => {
	beforeEach(() => {
		store.open(PATH, chain());
		store.edit((s) => connect(s, registry, { node: "local", pin: "ref" }, { node: "knot", pin: "in" }));
		store.edit((s) => connect(s, registry, { node: "knot", pin: "out" }, { node: "knot2", pin: "in" }));
	});

	it("takes the type it is given when the wire is drawn", () => {
		expect(typeOf("knot")).toBe("any");
	});

	/** The report: the source said something different and the knot did not hear. */
	it("follows the source being retyped, without the wire moving", () => {
		store.edit((s) => setConfig(s, "local", { type: "BasePart" }));
		expect(typeOf("knot")).toBe("BasePart");
	});

	it("carries the change down a chain of knots", () => {
		store.edit((s) => setConfig(s, "local", { type: "BasePart" }));
		expect(typeOf("knot2")).toBe("BasePart");
	});

	it("goes back to any when the type is taken away", () => {
		store.edit((s) => setConfig(s, "local", { type: "BasePart" }));
		store.edit((s) => setConfig(s, "local", { type: undefined }));
		expect(typeOf("knot")).toBe("any");
	});

	/** Undo restores what was there rather than working it out again. */
	it("comes back with an undo", () => {
		store.edit((s) => setConfig(s, "local", { type: "BasePart" }));
		store.undo();
		expect(typeOf("knot")).toBe("any");
		store.redo();
		expect(typeOf("knot")).toBe("BasePart");
	});
});

describe("a knot wired to a loop's value", () => {
	/** The 0.36.3 fields: a loop's bindings can be typed, so its pins change. */
	it("follows the Value type", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const table = b.node("table.new", { id: "table" });
		const loop = b.node("flow.forEach", { id: "loop" });
		b.node("flow.reroute", { id: "knot" });
		b.link(start, "then", table, "in");
		b.link(table, "then", loop, "in");
		b.link(table, "result", loop, "table");
		store.open(PATH, b.build());
		store.edit((s) => connect(s, registry, { node: "loop", pin: "value" }, { node: "knot", pin: "in" }));

		expect(typeOf("knot")).toBe("any");
		store.edit((s) => setConfig(s, "loop", { valueType: "BasePart" }));
		expect(typeOf("knot")).toBe("BasePart");
	});
});

describe("a knot wired to a variable", () => {
	it("follows the variable being retyped in the panel", () => {
		const b = new Builder();
		const id = b.variable("health", "number", { t: "number", v: 100 });
		b.node("variable.get", { id: "get", config: { variable: id, name: "health", type: "number" } });
		b.node("flow.reroute", { id: "knot" });
		store.open(PATH, b.build());
		store.edit((s) => connect(s, registry, { node: "get", pin: "value" }, { node: "knot", pin: "in" }));

		expect(typeOf("knot")).toBe("number");
		store.edit((s) => updateVariable(s, id, { type: "string" }));
		expect(typeOf("knot")).toBe("string");
	});
});

describe("a graph with no knots", () => {
	/** The rule runs on every edit, so it has to cost nothing when it has nothing to do. */
	it("is handed back untouched", () => {
		const b = new Builder();
		b.node("script.begin");
		const before = b.build();
		store.open(PATH, before);
		const script = store.getSnapshot().script!;
		store.edit((s) => ({ ...s, name: "renamed" }));
		expect(store.getSnapshot().script?.nodes).toBe(script.nodes);
	});
});

/**
 * The fourth surface: the documentation draws graphs too, and the paragraph
 * under "Reroute knots" says a knot takes the type of whatever is wired into
 * it. A scene is written by hand and never edited, so it is asked once, where
 * it is drawn.
 */
describe("a knot in a drawn graph", () => {
	it("is coloured by what it carries", () => {
		const b = new Builder();
		const id = b.variable("health", "number", { t: "number", v: 100 });
		const get = b.node("variable.get", {
			id: "get", config: { variable: id, name: "health", type: "number" },
		});
		const knot = b.node("flow.reroute", { id: "knot" });
		b.link(get, "value", knot, "in");

		const typed = retypeReroutes(b.build(), registry);
		expect((typed.nodes.find((n) => n.id === "knot")?.config as { type?: string }).type)
			.toBe("number");
	});

	/** Reached through the function every docs graph is drawn by. */
	it("reaches the drawn picture", () => {
		const b = new Builder();
		const code = b.node("value.expression", {
			id: "code", literals: { code: { t: "raw", v: "health" } },
		});
		const knot = b.node("flow.reroute", { id: "knot", x: 300, y: 0 });
		b.link(code, "result", knot, "in");

		const svg = graphSvg(b.build(), registry, { geometry: NODE, nodeColor, pinColor });
		// The knot is drawn in its carried colour rather than the `any` grey.
		expect(svg).toContain(pinColor("luau", "data"));
		expect(svg).not.toBe("");
	});
});

/**
 * A knot's two pins are stacked at its centre so the wire enters and leaves at
 * the same point. The drop therefore lands on whichever is painted last — the
 * output — whatever you aimed at, so dragging an output onto a knot arrived at
 * the knot's output, the sides matched, and nothing happened. Dragging an input
 * onto the same knot worked, which is why it looked like knots *sometimes* take
 * wires.
 */
describe("a wire dropped on a knot", () => {
	const knotOf = (def: string) => ({ id: "knot", def, x: 0, y: 0 });
	const pins = (def: string) => resolveNodePins(registry.get(def)!, {});

	for (const def of ["flow.reroute", "flow.rerouteExec"]) {
		it(`${def} takes a wire dragged from an output`, () => {
			const out = pins(def).outputs[0];
			// The drop lands on the knot's output; the drag started at an output.
			const landing = wireLanding(knotOf(def), registry, out, "out", "out");
			expect(landing?.side).toBe("in");
			expect(landing?.pin.id).toBe(pins(def).inputs[0].id);
		});

		it(`${def} still takes a wire dragged from an input`, () => {
			const out = pins(def).outputs[0];
			const landing = wireLanding(knotOf(def), registry, out, "out", "in");
			expect(landing).toEqual({ pin: out, side: "out" });
		});
	}

	/** A node with rows has pins you can aim at; moving the wire would be worse. */
	it("does not redirect a drop on an ordinary node", () => {
		const node = { id: "print", def: "debug.print", x: 0, y: 0 };
		const out = resolveNodePins(registry.get("debug.print")!, {}).outputs[0];
		expect(wireLanding(node, registry, out, "out", "out")).toBeNull();
	});

	it("is not this node's drop when there is no node", () => {
		const out = pins("flow.reroute").outputs[0];
		expect(wireLanding(undefined, registry, out, "out", "out")).toBeNull();
	});
});
