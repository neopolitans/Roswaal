/**
 * Reading a parameter where it is used.
 *
 * A Function node has an output pin per parameter, and they work — but they
 * mean a wire from the declaration to every node that reads one, and in a
 * function of any size those wires cross the whole body. `Occupancy.hide` is
 * the case: a Declare Function whose parameters are read all over a web of
 * nodes, every read another line across the canvas.
 *
 * Get Parameter is the same trade Get Local already makes against wiring a
 * Declare Local's output everywhere. The pins stay; this is the other way.
 *
 * The scope rule is the part worth understanding. All three binders --
 * `function.entry`, `function.declareHere` and `event.connect` -- bind
 * `${id}/p${i}` into the body's *own* scope before walking it, so "this node
 * must be inside the body" is not a rule Get Parameter implements. It is what
 * the scope chain already means.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics
		.filter((d) => d.severity === "error")
		.map((d) => d.message);

describe("Get Parameter inside a function", () => {
	/** The same graph `declarefunction.test.ts` wires through a `p0` pin. */
	function declared(where: "body" | "then") {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const get = b.node("function.getParam", {
			config: { function: fn, param: "who", type: "string" },
		});
		const print = b.node("debug.print");
		b.link(begin, "then", fn, "in");
		b.link(fn, where, print, "in");
		b.link(get, "value", print, "value");
		return b.build();
	}

	it("reads the parameter without a wire back to the declaration", () => {
		expect(errors(declared("body"))).toEqual([]);
		expect(code(declared("body"))).toContain("print(who)");
	});

	it("works in a hoisted Function too", () => {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const get = b.node("function.getParam", { config: { function: fn, param: "who" } });
		const print = b.node("debug.print");
		b.link(fn, "then", print, "in");
		b.link(get, "value", print, "value");

		expect(errors(b.build())).toEqual([]);
		expect(code(b.build())).toContain("print(who)");
	});

	/**
	 * A handler binds its parameters exactly as a function does, so this works
	 * there for free — which is worth a test rather than an assumption, because
	 * it is the case a narrower implementation would have excluded.
	 */
	it("works inside an event handler", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const signal = b.node("value.expression");
		b.lit(signal, "code", { t: "raw", v: "part.Touched" });
		const connect = b.node("event.connect", {
			config: { params: [{ name: "hit", type: "BasePart" }] },
		});
		const get = b.node("function.getParam", { config: { function: connect, param: "hit" } });
		const print = b.node("debug.print");
		b.link(begin, "then", connect, "in");
		b.link(signal, "result", connect, "signal");
		b.link(connect, "body", print, "in");
		b.link(get, "value", print, "value");

		expect(errors(b.build())).toEqual([]);
		expect(code(b.build())).toContain("print(hit)");
	});

	/**
	 * Outside the body the scope lookup simply misses. The condition the request
	 * described — "so long as it is tied to the Body exec pin" — is the scope
	 * chain's own meaning rather than a check written here.
	 */
	it("is an error outside the body it belongs to", () => {
		const said = errors(declared("then")).join(" ");
		expect(said).toContain("not inside its body");
		expect(said).toContain("who");
	});
});

describe("a Get Parameter that has lost its footing", () => {
	function pointingAt(config: Record<string, unknown>) {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const get = b.node("function.getParam", { config });
		const print = b.node("debug.print");
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", print, "in");
		b.link(get, "value", print, "value");
		return b.build();
	}

	it("says so when no function is chosen", () => {
		expect(errors(pointingAt({})).join(" ")).toContain("no function chosen");
	});

	it("says so when the function is gone", () => {
		expect(errors(pointingAt({ function: "n_gone", param: "who" })).join(" "))
			.toContain("no longer in this graph");
	});

	/** A function that still exists can stop having the parameter asked for. */
	it("names the parameter that is no longer there", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: { name: "greet", params: [{ name: "who", type: "string" }], returns: [] },
		});
		const get = b.node("function.getParam", { config: { function: fn, param: "removed" } });
		const print = b.node("debug.print");
		b.link(begin, "then", fn, "in");
		b.link(fn, "body", print, "in");
		b.link(get, "value", print, "value");

		const said = errors(b.build()).join(" ");
		expect(said).toContain("removed");
		expect(said).toContain("greet");
	});
});

/**
 * Why the node stores a name rather than the index the emitter keys on.
 *
 * Dragging a parameter up the list in the Inspector must not silently repoint
 * every node reading it — the graph would go on compiling and mean something
 * else, which is the worst shape a bug can take.
 */
describe("reordering a signature", () => {
	function graph(params: { name: string; type: string }[]) {
		const b = new Builder();
		const fn = b.node("function.entry", {
			config: { name: "pair", params, returns: [] },
		});
		const get = b.node("function.getParam", { config: { function: fn, param: "second" } });
		const print = b.node("debug.print");
		b.link(fn, "then", print, "in");
		b.link(get, "value", print, "value");
		return b.build();
	}

	const first = { name: "first", type: "string" };
	const second = { name: "second", type: "string" };

	it("still reads the parameter it named, not the position it held", () => {
		expect(code(graph([first, second]))).toContain("print(second)");
		// The same node, after the two were swapped in the Inspector.
		expect(code(graph([second, first]))).toContain("print(second)");
	});
});

describe("the node itself", () => {
	it("is a pure capsule, like Get Local", () => {
		const def = registry.get("function.getParam")!;
		expect(def.pure).toBe(true);
		expect(def.display).toBe("compact");
		expect(def.inputs).toEqual([]);
	});

	it("takes the parameter's type for its pin, and its name for its title", () => {
		const def = registry.get("function.getParam")!;
		expect(def.derivePins!({ param: "who", type: "Model" }).outputs[0].type).toBe("Model");
		expect(def.derivePins!({}).outputs[0].type).toBe("any");
		expect(def.defaultLabel!({ param: "who" })).toBe("who");
	});
});
