/**
 * A custom node's logic, built from nodes and compiled to its template.
 *
 * The test that matters most is the last kind: a node compiled from a logic
 * graph, placed in an ordinary graph, and that graph compiled. A template that
 * looks right and breaks once it is spliced into a real script is the failure
 * this design has to rule out.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { compileLogic, defaultLogic, type LogicGraph } from "../src/core/compiler/logic.js";
import { createRegistry, parseNodePack } from "../src/core/nodes/index.js";
import { LOGIC_INPUTS, LOGIC_NODES, LOGIC_OUTPUTS, type LogicShape } from "../src/core/nodes/logic.js";
import type { NodeDef } from "../src/core/schema.js";

const registry = createRegistry(LOGIC_NODES);

/** A logic graph built the way a test builds a script, from its two ends outwards. */
function logic(shape: LogicShape, build: (b: Builder, ends: { inputs: string; outputs: string }) => void): LogicGraph {
	const b = new Builder();
	const base = defaultLogic(shape);
	for (const node of base.nodes) b.node(node.def, { id: node.id, config: node.config });
	for (const link of base.links) b.link(link.from.node, link.from.pin, link.to.node, link.to.pin);
	build(b, { inputs: "logic-inputs", outputs: "logic-outputs" });
	const script = b.build();
	return { nodes: script.nodes, links: script.links };
}

/** Removes the flow wire the default graph starts with, for a test rewiring it. */
function unlinkFlow(graph: LogicGraph): LogicGraph {
	return { ...graph, links: graph.links.filter((l) => l.id !== "l1") };
}

const impure = (inputs: string[], outputs: string[] = []): LogicShape => ({
	pure: false,
	inputs: inputs.map((id) => ({ id, name: id, type: "any" })),
	outputs: outputs.map((id) => ({ id, name: id, type: "any" })),
});
const pure = (inputs: string[], outputs: string[]): LogicShape => ({ ...impure(inputs, outputs), pure: true });

describe("a step's logic", () => {
	it("compiles to a template that reads its inputs", () => {
		const shape = impure(["message"]);
		const graph = unlinkFlow(logic(shape, (b, ends) => {
			const print = b.node("debug.print", { id: "print" });
			b.link(ends.inputs, "then", print, "in");
			b.link(print, "then", ends.outputs, "in");
			b.link(ends.inputs, "message", print, "value");
		}));
		const result = compileLogic(graph, shape, registry);
		expect(result.errors).toEqual([]);
		expect(result.compilesTo).toEqual({ kind: "statement", template: "print($in.message)" });
	});

	/** Otherwise a wired call would run once per read. */
	it("reads an input used twice once, into a local, inside do … end", () => {
		const shape = impure(["message"]);
		const graph = unlinkFlow(logic(shape, (b, ends) => {
			const first = b.node("debug.print", { id: "first" });
			const second = b.node("debug.print", { id: "second" });
			b.link(ends.inputs, "then", first, "in");
			b.link(first, "then", second, "in");
			b.link(second, "then", ends.outputs, "in");
			b.link(ends.inputs, "message", first, "value");
			b.link(ends.inputs, "message", second, "value");
		}));
		const template = (compileLogic(graph, shape, registry).compilesTo as { template: string }).template;
		expect(template).toBe(["do", "\tlocal message = $in.message", "\tprint(message)", "\tprint(message)", "end"].join("\n"));
	});

	it("assigns its outputs where Node Outputs is reached", () => {
		const shape = impure(["a", "b"], ["sum"]);
		const graph = logic(shape, (b, ends) => {
			const add = b.node("math.add", { id: "add" });
			b.link(ends.inputs, "a", add, "a0");
			b.link(ends.inputs, "b", add, "a1");
			b.link(add, "result", ends.outputs, "sum");
		});
		const result = compileLogic(graph, shape, registry);
		expect(result.errors).toEqual([]);
		expect((result.compilesTo as { template: string }).template).toBe("$out.sum = $in.a + $in.b");
	});

	it("writes a service where it is used, since a template has no top of the file", () => {
		const shape = impure([], ["players"]);
		const graph = logic(shape, (b, ends) => {
			const service = b.node("roblox.getService", { id: "svc", literals: { service: { t: "string", v: "Players" } } });
			b.link(service, "service", ends.outputs, "players");
		});
		const result = compileLogic(graph, shape, registry);
		expect((result.compilesTo as { template: string }).template).toBe('$out.players = game:GetService("Players")');
		// Get Service is Roblox-only, so a node built from it is too.
		expect(result.targets).toEqual(["roblox"]);
	});
});

describe("a pure node's logic", () => {
	it("compiles to one expression per output", () => {
		const shape = pure(["a", "b"], ["sum"]);
		const graph = logic(shape, (b, ends) => {
			const add = b.node("math.add", { id: "add" });
			b.link(ends.inputs, "a", add, "a0");
			b.link(ends.inputs, "b", add, "a1");
			b.link(add, "result", ends.outputs, "sum");
		});
		expect(compileLogic(graph, shape, registry).compilesTo).toEqual({ kind: "expr", outputs: { sum: "$in.a + $in.b" } });
	});

	it("refuses a step, which is not a value", () => {
		const shape = pure(["message"], ["out"]);
		const graph = logic(shape, (b) => {
			b.node("debug.print", { id: "print" });
		});
		const result = compileLogic(graph, shape, registry);
		expect(result.compilesTo).toBeNull();
		expect(result.errors.join("\n")).toMatch(/is a step/);
	});

	it("warns when an input is read twice, which it has nowhere to keep", () => {
		const shape = pure(["a"], ["double"]);
		const graph = logic(shape, (b, ends) => {
			const add = b.node("math.add", { id: "add" });
			b.link(ends.inputs, "a", add, "a0");
			b.link(ends.inputs, "a", add, "a1");
			b.link(add, "result", ends.outputs, "double");
		});
		const result = compileLogic(graph, shape, registry);
		expect(result.compilesTo).toEqual({ kind: "expr", outputs: { double: "$in.a + $in.a" } });
		expect(result.warnings.join("\n")).toMatch(/read 2 times/);
	});
});

describe("what a node's logic may hold", () => {
	it("refuses what belongs to a whole script, saying why", () => {
		const shape = impure([]);
		const graph = logic(shape, (b) => {
			b.node("script.begin", { id: "start" });
		});
		const result = compileLogic(graph, shape, registry);
		expect(result.compilesTo).toBeNull();
		expect(result.errors[0]).toMatch(/Script Start cannot be in a node's logic/);
	});

	it("names a node from a pack this one does not require", () => {
		const shape = impure([]);
		const graph = logic(shape, (b) => {
			b.node("combat.knockback", { id: "kb" });
		});
		expect(compileLogic(graph, shape, registry).errors[0]).toMatch(/combat\.knockback .*requires/);
	});

	it("carries a yielding node into the node, and a Roblox-only one into its targets", () => {
		const shape = impure([]);
		const graph = unlinkFlow(logic(shape, (b, ends) => {
			const wait = b.node("task.wait", { id: "wait" });
			b.link(ends.inputs, "then", wait, "in");
			b.link(wait, "then", ends.outputs, "in");
		}));
		expect(compileLogic(graph, shape, registry).latent).toBe(true);
	});

	it("drops a wire to a pin the node no longer has", () => {
		const shape = impure(["gone"]);
		const graph = logic(shape, (b, ends) => {
			const print = b.node("debug.print", { id: "print" });
			b.link(ends.inputs, "gone", print, "value");
		});
		const now = impure([]);
		expect(compileLogic(graph, now, registry).errors).toEqual([]);
	});
});

describe("a pack stays data", () => {
	/** The plan said to confirm this with a test before relying on it. */
	it("loads a node with logic, ignoring the logic entirely", () => {
		const parsed = parseNodePack({
			nodes: [{
				id: "p.n", title: "N",
				inputs: [{ id: "in", kind: "exec" }], outputs: [{ id: "then", kind: "exec" }],
				compilesTo: { kind: "statement", template: "x()" },
				logic: { nodes: [{ id: "a", def: LOGIC_INPUTS }, { id: "b", def: LOGIC_OUTPUTS }], links: [] },
			}],
		}, "pack");
		expect(parsed.errors).toEqual([]);
		expect("logic" in parsed.defs[0]).toBe(false);
	});
});

/** The one that rules out a template that only looks right. */
describe("a node built from nodes, placed in a graph", () => {
	it("compiles into the graph the way a hand-written template would", () => {
		const shape = impure(["message"], ["length"]);
		const graph = unlinkFlow(logic(shape, (b, ends) => {
			const first = b.node("debug.print", { id: "first" });
			const second = b.node("debug.print", { id: "second" });
			const len = b.node("string.len", { id: "len" });
			b.link(ends.inputs, "then", first, "in");
			b.link(first, "then", second, "in");
			b.link(second, "then", ends.outputs, "in");
			b.link(ends.inputs, "message", first, "value");
			b.link(ends.inputs, "message", second, "value");
			b.link(ends.inputs, "message", len, "value");
			b.link(len, "result", ends.outputs, "length");
		}));
		const compiled = compileLogic(graph, shape, registry);
		expect(compiled.errors).toEqual([]);

		const def: NodeDef = {
			id: "p.shout", title: "Shout", category: "Custom",
			inputs: [{ id: "in", name: "", kind: "exec" }, { id: "message", name: "Message", kind: "data", type: "string" }],
			outputs: [{ id: "then", name: "", kind: "exec" }, { id: "length", name: "Length", kind: "data", type: "number" }],
			compilesTo: compiled.compilesTo!,
		};
		const host = new Builder();
		const start = host.node("script.begin");
		const shout = host.node("p.shout", { literals: { message: { t: "string", v: "hi" } } });
		const after = host.node("debug.print");
		host.link(start, "then", shout, "in");
		host.link(shout, "then", after, "in");
		host.link(shout, "length", after, "value");

		const result = compile(host.build(), createRegistry([def]));
		expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		// The output's local takes the pin's name, as any statement node's does.
		expect(body(result.code)).toBe([
			"local Length",
			"do",
			'\tlocal message = "hi"',
			"\tprint(message)",
			"\tprint(message)",
			"\tLength = #message",
			"end",
			"print(Length)",
		].join("\n"));
	});
});
