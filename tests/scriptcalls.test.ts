/**
 * Script Function: calling a function the graph knows, with its signature as
 * the pins.
 *
 * `Rig.luau` calls `need(parent, name, class)` eleven times. With Call For
 * Value each call was a Get Function wired into a node of `Arg 1 / Arg 2 /
 * Arg 3`, and nothing kept the count in step with the declaration. A Script
 * Function holds `need` itself: Parent, Name and Class arrive named and typed,
 * and follow the signature when it changes.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { growthRule } from "../src/core/nodes/growth.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import {
	exportedFunctions,
	paramMoves,
	SCRIPT_CALL,
	SCRIPT_VALUE,
	syncModuleCalls,
	syncScriptCalls,
} from "../src/core/scriptCalls.js";
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

/** `need`, declared, and something to wire into its first argument. */
function withNeed(b: Builder): { fn: string; begin: string } {
	const fn = b.node("function.entry", { config: { ...NEED } });
	const ret = b.node("function.return", { config: { returns: NEED.returns } });
	b.link(fn, "then", ret, "in");
	b.link(fn, "p0", ret, "r0");
	return { fn, begin: b.node("script.begin") };
}

const pinsOf = (script: NodeScript, id: string) => {
	const node = script.nodes.find((n) => n.id === id)!;
	return resolveNodePins(registry.get(node.def)!, node.config, node.literals);
};

describe("Call For Value's arguments", () => {
	it("grows and shrinks from its header like Call Function", () => {
		expect(growthRule(registry.get("call.value"))).toMatchObject({
			field: "args",
			min: 0,
			max: 8,
		});
	});
});

describe("Script Function", () => {
	it("has the function's parameters as named, typed pins", () => {
		const b = new Builder();
		const { fn } = withNeed(b);
		const call = b.node(SCRIPT_VALUE, { config: { function: fn, ...NEED } });
		const pins = pinsOf(b.build(), call);
		expect(pins.inputs.map((p) => [p.id, p.name, p.type])).toEqual([
			["a0", "parent", "Instance"],
			["a1", "name", "string"],
			["a2", "class", "string"],
		]);
		expect(pins.outputs.map((p) => [p.name, p.type])).toEqual([["child", "Instance"]]);
	});

	it("writes the call where its value is read", () => {
		const b = new Builder("Rig");
		const { fn, begin } = withNeed(b);
		const model = b.variable("model", "Model", { t: "nil" });
		const get = b.node("variable.get", {
			config: { variable: model, name: "model", type: "Model" },
		});
		const call = b.node(SCRIPT_VALUE, { config: { function: fn, ...NEED } });
		const local = b.node("local.declare");
		b.lit(local, "name", { t: "string", v: "hullModel" });
		b.link(get, "value", call, "a0");
		b.lit(call, "a1", { t: "string", v: "Hull" });
		b.lit(call, "a2", { t: "string", v: "Model" });
		b.link(begin, "then", local, "in");
		b.link(call, "result", local, "value");

		const script = b.build();
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain('local hullModel = need(model, "Hull", "Model")');
	});

	it("calls once when two things read its value", () => {
		const b = new Builder();
		const { fn, begin } = withNeed(b);
		const call = b.node(SCRIPT_VALUE, { config: { function: fn, ...NEED } });
		b.lit(call, "a0", { t: "raw", v: "workspace" });
		const first = b.node("debug.print");
		const second = b.node("debug.print");
		b.link(begin, "then", first, "in");
		b.link(first, "then", second, "in");
		b.link(call, "result", first, "value");
		b.link(call, "result", second, "value");

		const out = code(b.build());
		const calls = out.split("\n").filter((l) => l.includes("need(") && !l.includes("function"));
		expect(calls, out).toHaveLength(1);
	});

	it("binds every return value it is read for as a step", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const sig = {
			name: "split",
			params: [{ name: "text", type: "string" }],
			returns: [
				{ name: "head", type: "string" },
				{ name: "tail", type: "string" },
			],
		};
		const fn = b.node("function.entry", { config: { ...sig } });
		const ret = b.node("function.return", { config: { returns: sig.returns } });
		b.link(fn, "then", ret, "in");
		b.link(fn, "p0", ret, "r0");
		b.link(fn, "p0", ret, "r1");
		const call = b.node(SCRIPT_CALL, { config: { function: fn, ...sig } });
		b.lit(call, "a0", { t: "string", v: "a.b" });
		const print = b.node("debug.print");
		b.link(begin, "then", call, "in");
		b.link(call, "then", print, "in");
		b.link(call, "r1", print, "value");

		const out = code(b.build());
		expect(out).toContain('local _, tail = split("a.b")');
		expect(out).toContain("print(tail)");
	});

	it("is an error with its function gone", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const call = b.node(SCRIPT_CALL, { config: { function: "gone", ...NEED } });
		b.link(begin, "then", call, "in");
		expect(errors(b.build()).join(" ")).toContain("no longer in the graph");
	});
});

describe("keeping the copy of the signature current", () => {
	/** need, a call to it, and a wire into each argument. */
	function wired() {
		const b = new Builder();
		const { fn } = withNeed(b);
		const call = b.node(SCRIPT_VALUE, { config: { function: fn, ...NEED } });
		const sources = ["a0", "a1", "a2"].map((pin) => {
			const src = b.node("value.string");
			b.link(src, "value", call, pin);
			return src;
		});
		return { script: b.build(), fn, call, sources };
	}
	const withParams = (
		script: NodeScript,
		fn: string,
		params: { name: string; type?: string }[],
	) => ({
		...script,
		nodes: script.nodes.map((n) => (n.id === fn ? { ...n, config: { ...n.config, params } } : n)),
	});
	const wireInto = (script: NodeScript, call: string, from: string) =>
		script.links.find((l) => l.from.node === from && l.to.node === call)?.to.pin;

	it("leaves a script with nothing to do identical", () => {
		const { script } = wired();
		expect(syncScriptCalls(script)).toBe(script);
	});

	it("follows a rename and keeps the wire", () => {
		const { script, fn, call, sources } = wired();
		const synced = syncScriptCalls(
			withParams(script, fn, [
				NEED.params[0],
				{ name: "childName", type: "string" },
				NEED.params[2],
			]),
		);
		expect(pinsOf(synced, call).inputs[1].name).toBe("childName");
		expect(wireInto(synced, call, sources[1])).toBe("a1");
	});

	it("moves wires with a reordered parameter", () => {
		const { script, fn, call, sources } = wired();
		const synced = syncScriptCalls(
			withParams(script, fn, [NEED.params[2], NEED.params[0], NEED.params[1]]),
		);
		expect(wireInto(synced, call, sources[0])).toBe("a1");
		expect(wireInto(synced, call, sources[1])).toBe("a2");
		expect(wireInto(synced, call, sources[2])).toBe("a0");
	});

	it("drops the wire of a deleted parameter rather than shifting the rest onto it", () => {
		const { script, fn, call, sources } = wired();
		const synced = syncScriptCalls(withParams(script, fn, [NEED.params[0], NEED.params[2]]));
		expect(wireInto(synced, call, sources[0])).toBe("a0");
		expect(wireInto(synced, call, sources[1])).toBeUndefined();
		expect(wireInto(synced, call, sources[2])).toBe("a1");
	});

	it("tells the three apart by what became of the names", () => {
		const [a, b, c] = [{ name: "a" }, { name: "b" }, { name: "c" }];
		expect(paramMoves([a, b, c], [a, { name: "x" }, c])).toEqual([0, 1, 2]);
		expect(paramMoves([a, b, c], [c, a, b])).toEqual([1, 2, 0]);
		expect(paramMoves([a, b, c], [a, c])).toEqual([0, undefined, 1]);
	});
});

describe("a module's functions", () => {
	/** `Rig`: a table variable, `resolve` declared onto it, and the table returned whole. */
	function rigModule(): NodeScript {
		const b = new Builder("Rig");
		const begin = b.node("script.begin");
		const rig = b.variable("Rig", "table", { t: "raw", v: "{}" });
		const owner = b.node("variable.get", { config: { variable: rig, name: "Rig", type: "table" } });
		const declare = b.node("function.declareHere", {
			config: { name: "resolve", params: [{ name: "model", type: "Model" }], returns: [] },
		});
		b.link(begin, "then", declare, "in");
		b.link(owner, "value", declare, "owner");
		const local = b.node("function.declareHere", {
			config: { name: "need", params: [], returns: [] },
		});
		b.link(declare, "then", local, "in");
		const returned = b.node("variable.get", {
			config: { variable: rig, name: "Rig", type: "table" },
		});
		const exports = b.node("module.exports");
		b.link(returned, "value", exports, "e0");
		return b.build();
	}

	it("are the ones declared onto the table it returns", () => {
		const found = exportedFunctions(rigModule(), "Rig.nodescript");
		expect(found.map((f) => f.name)).toEqual(["resolve"]);
		expect(found[0].params).toEqual([{ name: "model", type: "Model" }]);
	});

	it("include a named export wired from a function", () => {
		const b = new Builder("Config");
		const fn = b.node("function.entry", {
			config: { name: "readImpl", params: [{ name: "tank", type: "Model" }], returns: [] },
		});
		const ref = b.node("function.get", { config: { function: fn, name: "readImpl" } });
		const exports = b.node("module.exports", {
			config: { exports: [{ name: "read" }, { name: "version" }] },
		});
		b.link(ref, "fn", exports, "e0");
		expect(exportedFunctions(b.build(), "Config.nodescript").map((f) => f.name)).toEqual(["read"]);
	});

	it("are called through the script's own require", () => {
		const b = new Builder("Main");
		const begin = b.node("script.begin");
		const req = b.node("module.requirePath");
		b.lit(req, "root", { t: "string", v: "ReplicatedStorage" });
		b.lit(req, "path", { t: "string", v: "Tank.Rig" });
		const call = b.node(SCRIPT_CALL, {
			config: {
				module: req,
				moduleName: "Rig",
				name: "resolve",
				params: [{ name: "model", type: "Model" }],
				returns: [],
			},
		});
		b.lit(call, "a0", { t: "raw", v: "workspace.Tank" });
		b.link(begin, "then", call, "in");

		const out = code(b.build());
		expect(out).toContain("local Rig = require(ReplicatedStorage.Tank.Rig)");
		expect(out).toContain("Rig.resolve(workspace.Tank)");
	});

	it("follow the module's signature when the project reports a new one", () => {
		const b = new Builder("Main");
		const req = b.node("module.requirePath");
		const call = b.node(SCRIPT_CALL, {
			config: { module: req, moduleName: "Rig", name: "resolve", params: [], returns: [] },
		});
		const synced = syncModuleCalls(b.build(), (node) =>
			node === req
				? [
						{
							graph: "Rig",
							name: "resolve",
							params: [{ name: "model", type: "Model" }],
							returns: [],
						},
					]
				: undefined,
		);
		const args = pinsOf(synced, call).inputs.filter((p) => p.kind === "data");
		expect(args.map((p) => p.name)).toEqual(["model"]);
	});
});
