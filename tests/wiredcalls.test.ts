/**
 * Call Function and Call For Value learning a signature from their wire, and
 * choosing a type for an input its node declares `any`.
 *
 * A Get Function wired into Call For Value used to leave the call knowing
 * nothing: `Arg 1 / Arg 2 / Arg 3`, all `any`, at whatever count was last set.
 * The function's signature is right there at the other end of the wire, so the
 * call takes it — and where nothing can be known, the pin's type is somebody's
 * to choose.
 */

import { describe, expect, it } from "vitest";

import { setPinType } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { growthState } from "../src/core/nodes/growth.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { adoptWiredSignatures, wiredSignatureOf } from "../src/core/scriptCalls.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message);

const NEED = {
	name: "need",
	params: [
		{ name: "parent", type: "Instance" },
		{ name: "name", type: "string" },
		{ name: "class", type: "string" },
	],
	returns: [{ name: "child", type: "Instance" }],
};

const nodeOf = (script: NodeScript, id: string) => script.nodes.find((n) => n.id === id)!;
const pinsOf = (script: NodeScript, id: string) => {
	const node = nodeOf(script, id);
	return resolveNodePins(registry.get(node.def)!, node.config, node.literals);
};
const dataIn = (script: NodeScript, id: string) =>
	pinsOf(script, id).inputs.filter((p) => p.kind === "data" && p.id !== "fn");

/** need, a Get Function for it, and a Call For Value with three typed-in arguments. */
function wiredNeed(via: "get" | "knot" = "get") {
	const b = new Builder();
	const begin = b.node("script.begin");
	const fn = b.node("function.entry", { config: { ...NEED } });
	const ret = b.node("function.return", { config: { returns: NEED.returns } });
	b.link(fn, "then", ret, "in");
	b.link(fn, "p0", ret, "r0");
	const ref = b.node("function.get", { config: { function: fn, name: "need" } });
	const call = b.node("call.value", { config: { args: 1 } });
	if (via === "knot") {
		const knot = b.node("flow.reroute");
		b.link(ref, "fn", knot, "in");
		b.link(knot, "out", call, "fn");
	} else {
		b.link(ref, "fn", call, "fn");
	}
	b.lit(call, "a0", { t: "raw", v: "workspace" });
	b.lit(call, "a1", { t: "string", v: "Hull" });
	b.lit(call, "a2", { t: "string", v: "Model" });
	const print = b.node("debug.print");
	b.link(begin, "then", print, "in");
	b.link(call, "result", print, "value");
	return { script: b.build(), fn, ref, call };
}

describe("a call wired from a declared function", () => {
	it("takes the function's parameters as its pins", () => {
		const { script, call } = wiredNeed();
		const synced = adoptWiredSignatures(script);
		expect(dataIn(synced, call).map((p) => [p.id, p.name, p.type])).toEqual([
			["a0", "parent", "Instance"],
			["a1", "name", "string"],
			["a2", "class", "string"],
		]);
		expect(pinsOf(synced, call).outputs[0].type).toBe("Instance");
	});

	it("does so through a knot", () => {
		const { script, call } = wiredNeed("knot");
		expect(wiredSignatureOf(nodeOf(adoptWiredSignatures(script), call).config)?.name).toBe("need");
	});

	it("compiles to the call, with every argument", () => {
		const { script } = wiredNeed();
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain('print(need(workspace, "Hull", "Model"))');
	});

	it("has no − and + while wired, and gets them back unwired", () => {
		const { script, call } = wiredNeed();
		const synced = adoptWiredSignatures(script);
		const def = registry.get("call.value");
		expect(growthState(def, nodeOf(synced, call).config)).toBeNull();

		const unwired = adoptWiredSignatures({
			...synced,
			links: synced.links.filter((l) => !(l.to.node === call && l.to.pin === "fn")),
		});
		expect(wiredSignatureOf(nodeOf(unwired, call).config)).toBeUndefined();
		expect(growthState(def, nodeOf(unwired, call).config)).not.toBeNull();
		expect(dataIn(unwired, call)).toHaveLength(1);
	});

	it("moves its wires when the function's parameters are reordered", () => {
		const b = new Builder();
		const fn = b.node("function.entry", { config: { ...NEED } });
		const ref = b.node("function.get", { config: { function: fn, name: "need" } });
		const call = b.node("call.value", { config: { args: 3 } });
		b.link(ref, "fn", call, "fn");
		const src = b.node("value.string");
		b.link(src, "value", call, "a1");
		const first = adoptWiredSignatures(b.build());

		const reordered = {
			...first,
			nodes: first.nodes.map((n) =>
				n.id === fn
					? {
							...n,
							config: { ...n.config, params: [NEED.params[1], NEED.params[0], NEED.params[2]] },
						}
					: n,
			),
		};
		const moved = adoptWiredSignatures(reordered);
		expect(moved.links.find((l) => l.from.node === src)?.to.pin).toBe("a0");
	});

	it("leaves an empty optional argument off the end", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const sig = {
			name: "warnIf",
			params: [
				{ name: "ok", type: "boolean" },
				{ name: "why", type: "string?" },
			],
			returns: [],
		};
		const fn = b.node("function.entry", { config: { ...sig } });
		const ref = b.node("function.get", { config: { function: fn, name: "warnIf" } });
		const call = b.node("call.function", { config: { args: 2 } });
		b.link(ref, "fn", call, "fn");
		b.lit(call, "a0", { t: "boolean", v: true });
		b.link(begin, "then", call, "in");
		expect(code(b.build())).toMatch(/^warnIf\(true\)$/m);
	});
});

describe("choosing the type of an any input", () => {
	function plainCall() {
		const b = new Builder();
		const call = b.node("call.function", { config: { args: 2 } });
		return { script: b.build(), call };
	}

	it("types the pin and gives it the type's field", () => {
		const { script, call } = plainCall();
		const typed = setPinType(script, call, "a1", "number");
		const pin = dataIn(typed, call).find((p) => p.id === "a1")!;
		expect(pin.type).toBe("number");
		expect(pin.chosenType).toBe("number");
		expect(pin.default).toEqual({ t: "number", v: 0 });
	});

	it("keeps the written type, and the pin type it names", () => {
		const { script, call } = plainCall();
		const pin = dataIn(setPinType(script, call, "a0", "BasePart?"), call)[0];
		expect([pin.type, pin.chosenType]).toEqual(["BasePart", "BasePart?"]);
	});

	it("clears with any", () => {
		const { script, call } = plainCall();
		const cleared = setPinType(setPinType(script, call, "a0", "string"), call, "a0", "any");
		expect(dataIn(cleared, call)[0].type).toBe("any");
		expect(nodeOf(cleared, call).config?.pinTypes).toBeUndefined();
	});

	it("never overrides a pin that already has a type", () => {
		const { script, call } = wiredNeed();
		const synced = adoptWiredSignatures(script);
		const retyped = setPinType(synced, call, "a1", "number");
		expect(dataIn(retyped, call)[1].type).toBe("string");
	});

	it("does not change the Luau written", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const object = b.node("value.expression");
		b.lit(object, "code", { t: "raw", v: "workspace.Car" });
		const call = b.node("call.method", { config: { args: 1 } });
		b.lit(call, "method", { t: "string", v: "Go" });
		b.lit(call, "a0", { t: "string", v: "fast" });
		b.link(object, "result", call, "object");
		b.link(begin, "then", call, "in");
		const plain = code(b.build());
		const typed = code(setPinType(b.build(), call, "a0", "string"));
		expect(plain).toContain('workspace.Car:Go("fast")');
		expect(typed).toBe(plain);
	});
});
