/**
 * A step's named result, read by name.
 *
 * `local hullModel = need(model, "Hull", "Model")` is a local the graph wrote,
 * so the graph should be able to use it the way it uses a Declare Local: listed
 * in the Variables panel, offered as `Get hullModel`, and read with Get Local
 * wherever it is in scope, with no wire running back to the call.
 */

import { describe, expect, it } from "vitest";

import { buildPresets } from "../src/app/menuSearch.js";
import { compile } from "../src/core/compiler/index.js";
import { namedResultRef, syncNamedResultRefs } from "../src/core/namedResults.js";
import { createRegistry } from "../src/core/nodes/index.js";
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
		{ name: "class", type: "string" },
	],
	returns: [{ name: "child", type: "Instance" }],
};

/** need, a step calling it named `hullModel`, and a Print after it. */
function namedCall() {
	const b = new Builder();
	const begin = b.node("script.begin");
	const fn = b.node("function.entry", { config: { ...NEED } });
	const ret = b.node("function.return", { config: { returns: NEED.returns } });
	b.link(fn, "then", ret, "in");
	b.link(fn, "p0", ret, "r0");
	const call = b.node(SCRIPT_CALL, {
		config: { function: fn, ...NEED, resultName: "hullModel" },
	});
	b.lit(call, "a0", { t: "raw", v: "workspace" });
	b.lit(call, "a1", { t: "string", v: "Hull" });
	b.lit(call, "a2", { t: "string", v: "Model" });
	const print = b.node("debug.print");
	b.link(begin, "then", call, "in");
	b.link(call, "then", print, "in");
	return { b, call, print, fn, begin };
}

describe("a named result read with Get Local", () => {
	it("reads the local the step declared", () => {
		const { b, call, print } = namedCall();
		const get = b.node("local.get", {
			config: { local: call, name: "hullModel", type: "Instance" },
		});
		b.link(get, "value", print, "value");
		const script = b.build();
		expect(errors(script)).toEqual([]);
		const out = code(script);
		expect(out).toContain('local hullModel: Instance = need(workspace, "Hull", "Model")');
		expect(out).toContain("print(hullModel)");
		expect(out.match(/need\(workspace/g)).toHaveLength(1);
	});

	it("is not folded into the next statement while something reads it by name", () => {
		const { b, call, print } = namedCall();
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "copy" });
		// The call leads into the Declare Local, which reads its result by wire.
		const script0 = b.build();
		const relinked: NodeScript = {
			...script0,
			links: script0.links.filter((l) => !(l.from.node === call && l.from.pin === "then")),
		};
		const get = "get-hull";
		const script: NodeScript = {
			...relinked,
			nodes: [
				...relinked.nodes,
				{
					id: get,
					def: "local.get",
					x: 0,
					y: 0,
					config: { local: call, name: "hullModel", type: "Instance" },
				},
			],
			links: [
				...relinked.links,
				{ id: "l-a", from: { node: call, pin: "then" }, to: { node: declare, pin: "in" } },
				{ id: "l-b", from: { node: call, pin: "result" }, to: { node: declare, pin: "value" } },
				{ id: "l-c", from: { node: declare, pin: "then" }, to: { node: print, pin: "in" } },
				{ id: "l-d", from: { node: get, pin: "value" }, to: { node: print, pin: "value" } },
			],
		};
		const out = code(script);
		expect(out).toContain('local hullModel: Instance = need(workspace, "Hull", "Model")');
		expect(out).toMatch(/local copy = hullModel/);
		expect(out.match(/need\(workspace/g)).toHaveLength(1);
	});

	it("is an error where the step has not run", () => {
		const { b, call, begin } = namedCall();
		const early = b.node("debug.print");
		const get = b.node("local.get", {
			config: { local: call, name: "hullModel", type: "Instance" },
		});
		b.link(get, "value", early, "value");
		const script = b.build();
		const moved: NodeScript = {
			...script,
			links: [
				...script.links.filter((l) => !(l.from.node === begin && l.from.pin === "then")),
				{ id: "first", from: { node: begin, pin: "then" }, to: { node: early, pin: "in" } },
				{ id: "then", from: { node: early, pin: "then" }, to: { node: call, pin: "in" } },
			],
		};
		expect(errors(moved).join(" ")).toContain("not in scope");
	});
});

describe("what counts as a named result", () => {
	it("is a step with a Result name and a result", () => {
		const { b, call } = namedCall();
		const script = b.build();
		const node = script.nodes.find((n) => n.id === call)!;
		expect(namedResultRef(node, registry)).toEqual({
			local: call,
			name: "hullModel",
			type: "Instance",
		});
	});

	it("is never a pure node or an unnamed one", () => {
		const pure = { id: "v", def: "call.value", config: { resultName: "x" } };
		const unnamed = { id: "s", def: "call.function", config: {} };
		expect(namedResultRef(pure, registry)).toBeUndefined();
		expect(namedResultRef(unnamed, registry)).toBeUndefined();
	});

	it("is offered by name in the node search", () => {
		const { b } = namedCall();
		const presets = buildPresets(b.build(), null, registry);
		expect(presets.map((p) => p.title)).toContain("Get hullModel");
	});

	it("carries a rename to the Get Locals reading it", () => {
		const { b, call } = namedCall();
		const get = b.node("local.get", {
			config: { local: call, name: "hullModel", type: "Instance" },
		});
		const script = b.build();
		const renamed: NodeScript = {
			...script,
			nodes: script.nodes.map((n) =>
				n.id === call ? { ...n, config: { ...n.config, resultName: "hull" } } : n,
			),
		};
		const synced = syncNamedResultRefs(renamed, registry);
		expect(synced.nodes.find((n) => n.id === get)?.config?.name).toBe("hull");
	});
});
