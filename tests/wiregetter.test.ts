/**
 * A local or a variable picked as a value: its getter, placed and wired in.
 *
 * Key Value Pair's Value offered String, Number, Boolean, Luau and nil, and
 * a local had to be found on the canvas and wired by hand. The value picker
 * lists the locals and variables in scope as well, and picking one places its
 * getter beside the node and wires it into the pin.
 */

import { describe, expect, it } from "vitest";

import { wireGetterInto } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const code = (script: NodeScript) => body(compile(script, registry).code);

/** A Declare Local `model`, then a table of one pair printed. */
function pairAfterLocal() {
	const b = new Builder();
	const begin = b.node("script.begin");
	const local = b.node("local.declare", { config: { type: "Model" } });
	b.lit(local, "name", { t: "string", v: "model" });
	b.lit(local, "value", { t: "raw", v: "workspace.Tank" });
	const pair = b.node("table.pair", { x: 600, y: 300, graph: undefined });
	b.lit(pair, "key", { t: "string", v: "model" });
	const dict = b.node("table.dictionary", { config: { args: 1 } });
	const print = b.node("debug.print");
	b.link(begin, "then", local, "in");
	b.link(local, "then", print, "in");
	b.link(pair, "result", dict, "p0");
	b.link(dict, "result", print, "value");
	return { b, pair, local };
}

describe("a value picked from the locals and variables", () => {
	it("wires a Get Local into the pin, and the table reads the local", () => {
		const { b, pair, local } = pairAfterLocal();
		const next = wireGetterInto(b.build(), registry, { node: pair, pin: "value" }, { local });
		const link = next.links.find((l) => l.to.node === pair && l.to.pin === "value");
		const getter = next.nodes.find((n) => n.id === link?.from.node);
		expect(getter?.def).toBe("local.get");
		expect(getter?.config).toMatchObject({ local, name: "model", type: "Model" });
		expect(code(next)).toContain("print({ model = model })");
	});

	it("wires a Get Variable for a script variable", () => {
		const { b, pair } = pairAfterLocal();
		const variable = b.variable("speed", "number", { t: "number", v: 12 });
		const next = wireGetterInto(b.build(), registry, { node: pair, pin: "value" }, { variable });
		const link = next.links.find((l) => l.to.node === pair && l.to.pin === "value");
		const getter = next.nodes.find((n) => n.id === link?.from.node);
		expect(getter?.def).toBe("variable.get");
		expect(getter?.config).toMatchObject({ variable, name: "speed", type: "number" });
	});

	it("places the getter in the node's own graph", () => {
		const { b, pair, local } = pairAfterLocal();
		const script = b.build();
		const inFunction: NodeScript = {
			...script,
			nodes: script.nodes.map((n) => (n.id === pair ? { ...n, graph: "fn" } : n)),
		};
		const next = wireGetterInto(inFunction, registry, { node: pair, pin: "value" }, { local });
		const link = next.links.find((l) => l.to.node === pair && l.to.pin === "value");
		expect(next.nodes.find((n) => n.id === link?.from.node)?.graph).toBe("fn");
	});
});
