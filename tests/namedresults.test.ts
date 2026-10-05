/**
 * A Result name that declares its local, and the ClassName type.
 *
 * Naming a call's result used to do nothing until something read it: `need(model,
 * "Turret", "Model")` stayed a bare call with `turretModel` typed into the
 * Inspector. A name is a request for the local, as it already was on a value
 * node, so the step now writes the line.
 *
 * `ClassName` is a string holding a class name: written as `string`, and every
 * pin of that type offers the engine's classes, as Is A's Class Name does.
 */

import { describe, expect, it } from "vitest";

import { setPinType } from "../src/app/edits.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { pinTypeOf } from "../src/core/nodes/variables.js";
import type { NodeScript } from "../src/core/schema.js";
import { SCRIPT_CALL } from "../src/core/scriptCalls.js";
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
		{ name: "class", type: "ClassName" },
	],
	returns: [{ name: "child", type: "Instance" }],
};

/** need, and one step calling it with nothing reading the result. */
function oneCall(config: Record<string, unknown> = {}) {
	const b = new Builder();
	const begin = b.node("script.begin");
	const fn = b.node("function.entry", { config: { ...NEED } });
	const ret = b.node("function.return", { config: { returns: NEED.returns } });
	b.link(fn, "then", ret, "in");
	b.link(fn, "p0", ret, "r0");
	const call = b.node(SCRIPT_CALL, { config: { function: fn, ...NEED, ...config } });
	b.lit(call, "a0", { t: "raw", v: "workspace" });
	b.lit(call, "a1", { t: "string", v: "Turret" });
	b.lit(call, "a2", { t: "string", v: "Model" });
	b.link(begin, "then", call, "in");
	return { script: b.build(), call };
}

describe("a Result name", () => {
	it("declares the local when nothing reads it", () => {
		const out = code(oneCall({ resultName: "turretModel" }).script);
		expect(out).toContain('local turretModel: Instance = need(workspace, "Turret", "Model")');
	});

	it("leaves a bare call when there is no name", () => {
		const out = code(oneCall().script);
		expect(out).toMatch(/^need\(workspace, "Turret", "Model"\)$/m);
	});

	it("does the same for Call Function", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const value = b.node("value.expression");
		b.lit(value, "code", { t: "raw", v: "math.random" });
		const call = b.node("call.function", { config: { args: 0, resultName: "roll" } });
		b.link(value, "result", call, "fn");
		b.link(begin, "then", call, "in");
		expect(code(b.build())).toContain("local roll = math.random()");
	});

	it("asks for nothing on a call that returns nothing", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const sig = { name: "reset", params: [], returns: [] };
		const fn = b.node("function.entry", { config: { ...sig } });
		const call = b.node(SCRIPT_CALL, { config: { function: fn, ...sig, resultName: "nothing" } });
		b.link(begin, "then", call, "in");
		const out = code(b.build());
		expect(out).toMatch(/^reset\(\)$/m);
		expect(out).not.toContain("local nothing");
	});
});

describe("ClassName", () => {
	it("is written as string", () => {
		const { script } = oneCall();
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain(
			"local function need(parent: Instance, name: string, class: string): Instance",
		);
	});

	it("is a string pin that offers the engine's classes", () => {
		const { script, call } = oneCall();
		const node = script.nodes.find((n) => n.id === call)!;
		const pin = resolveNodePins(registry.get(node.def)!, node.config).inputs.find(
			(p) => p.id === "a2",
		)!;
		expect(pin.type).toBe("string");
		expect(pin.options).toContain("Model");
		expect(pinTypeOf("ClassName?")).toBe("string");
	});

	it("can be chosen for an any input", () => {
		const b = new Builder();
		const call = b.node("call.function", { config: { args: 1 } });
		const typed = setPinType(b.build(), call, "a0", "ClassName");
		const node = typed.nodes.find((n) => n.id === call)!;
		const pin = resolveNodePins(registry.get(node.def)!, node.config).inputs.find(
			(p) => p.id === "a0",
		)!;
		expect([pin.type, pin.chosenType]).toEqual(["string", "ClassName"]);
		expect(pin.options).toContain("BasePart");
	});
});

describe("Class as String", () => {
	it("offers the engine's classes and starts at Model", () => {
		const pin = registry.get("value.className")!.inputs[0];
		expect(pin.options).toContain("BasePart");
		expect(pin.default).toEqual({ t: "string", v: "Model" });
	});

	it("wires a class name into a string argument", () => {
		const { script, call } = oneCall();
		const b = new Builder();
		const cls = b.node("value.className", { id: "class-name" });
		b.lit(cls, "className", { t: "string", v: "BasePart" });
		const extra = b.build();
		const joined: NodeScript = {
			...script,
			nodes: [...script.nodes, ...extra.nodes],
			links: [
				...script.links,
				{ id: "cls-link", from: { node: cls, pin: "result" }, to: { node: call, pin: "a2" } },
			],
		};
		expect(code(joined)).toMatch(/^need\(workspace, "Turret", "BasePart"\)$/m);
	});
});

describe("a header with a named result", async () => {
	const { nodeTitle } = await import("../src/core/nodes/index.js");

	it("says the name the result has: need (turretModel)", () => {
		const node = {
			id: "c",
			def: SCRIPT_CALL,
			x: 0,
			y: 0,
			config: { function: "f", ...NEED, resultName: "turretModel" },
		};
		expect(nodeTitle(registry.get(SCRIPT_CALL), node)).toBe("need (turretModel)");
	});

	it("gives way to a label somebody typed", () => {
		const node = {
			id: "c",
			def: SCRIPT_CALL,
			x: 0,
			y: 0,
			label: "Turret",
			config: { function: "f", ...NEED, resultName: "turretModel" },
		};
		expect(nodeTitle(registry.get(SCRIPT_CALL), node)).toBe("Turret");
	});

	it("does not repeat a name the second line already shows", () => {
		const def = [...registry.values()].find(
			(d) => d.compilesTo.kind === "call" && d.subtitle?.({ resultName: "x" }) === "x",
		)!;
		const node = { id: "t", def: def.id, x: 0, y: 0, config: { resultName: "x" } };
		expect(nodeTitle(def, node)).toBe(def.title);
	});
});
