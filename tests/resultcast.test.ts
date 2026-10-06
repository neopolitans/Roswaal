/**
 * A cast on a call's result, held on the call.
 *
 * Rig writes `local hull = need(hullModel, "Hull", "BasePart") :: BasePart`.
 * With a Cast node after the call, the graph declared `hull` as an Instance and
 * cast it again at every reader; Cast result on the call says it once, where
 * the value is made.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { castsResult } from "../src/core/nodes/resultCast.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message);

const NEED = {
	name: "need",
	params: [{ name: "parent", type: "Instance" }],
	returns: [{ name: "child", type: "Instance" }],
};

/** `local function need(parent)`, then a call to it whose result is cast. */
function needCall(options: { pure?: boolean; readers?: number; cast?: string } = {}) {
	const b = new Builder();
	const begin = b.node("script.begin");
	const fn = b.node("function.declareHere", { config: NEED });
	const ret = b.node("function.return", { graph: fn, config: { returns: NEED.returns } });
	b.lit(ret, "r0", { t: "raw", v: "parent" });
	b.link(fn, "body", ret, "in");
	b.link(begin, "then", fn, "in");

	const config = { function: fn, ...NEED, resultCast: options.cast ?? "BasePart" };
	let tail = { node: fn, pin: "then" };
	let call: string;
	if (options.pure) {
		call = b.node("function.callValue", { config });
	} else {
		call = b.node("function.call", { config: { ...config, resultName: "hull" } });
		b.link(tail.node, tail.pin, call, "in");
		tail = { node: call, pin: "then" };
	}
	b.lit(call, "a0", { t: "raw", v: "workspace" });
	for (let i = 0; i < (options.readers ?? 1); i++) {
		const print = b.node("debug.print");
		b.link(tail.node, tail.pin, print, "in");
		b.link(call, "result", print, "value");
		tail = { node: print, pin: "then" };
	}
	return b.build();
}

describe("Cast result", () => {
	it("is written where a named result is declared, without an annotation", () => {
		expect(errors(needCall())).toEqual([]);
		expect(code(needCall())).toContain("local hull = need(workspace) :: BasePart");
	});

	it("types the result pin as the cast says", () => {
		const def = registry.get("function.call")!;
		const pins = resolveNodePins(def, { ...NEED, resultCast: "BasePart" }).outputs;
		expect(pins.find((p) => p.id === "result")?.type).toBe("BasePart");
	});

	it("goes on a value call read once, where it is read", () => {
		expect(code(needCall({ pure: true }))).toContain("print(need(workspace) :: BasePart)");
	});

	it("is bound once for a value call read twice", () => {
		const out = code(needCall({ pure: true, readers: 2 }));
		expect(out).toMatch(/local \w+ = need\(workspace\) :: BasePart/);
	});

	it("follows a template call into the Declare Local after it", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const clone = b.node("instance.clone", { config: { resultCast: "Model" } });
		b.lit(clone, "instance", { t: "raw", v: "workspace.Tank" });
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "tank" });
		b.link(begin, "then", clone, "in").link(clone, "then", declare, "in");
		b.link(clone, "result", declare, "value");
		expect(code(b.build())).toMatch(/^local tank(: \w+)? = workspace\.Tank:Clone\(\) :: Model$/m);
	});

	it("is bracketed where a field is read off it", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const find = b.node("roblox.findFirstChild", { config: { resultCast: "BasePart" } });
		b.lit(find, "parent", { t: "raw", v: "workspace" });
		b.lit(find, "name", { t: "string", v: "Hull" });
		const member = b.node("value.member", { config: { member: "Size", type: "Vector3" } });
		const print = b.node("debug.print");
		b.link(begin, "then", print, "in");
		b.link(find, "result", member, "object");
		b.link(member, "result", print, "value");
		expect(code(b.build())).toContain('print((workspace:FindFirstChild("Hull") :: BasePart).Size)');
	});

	it("is not written on a call nobody reads", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const clone = b.node("instance.clone", { config: { resultCast: "Model" } });
		b.lit(clone, "instance", { t: "raw", v: "workspace.Tank" });
		b.link(begin, "then", clone, "in");
		const out = code(b.build());
		expect(out).toContain("workspace.Tank:Clone()");
		expect(out).not.toContain(":: Model");
	});

	it("belongs to calls, not to operators or casts", () => {
		expect(castsResult(registry.get("function.call")!)).toBe(true);
		expect(castsResult(registry.get("call.method")!)).toBe(true);
		expect(castsResult(registry.get("roblox.findFirstChild")!)).toBe(true);
		expect(castsResult(registry.get("cast.as")!)).toBe(false);
		expect(castsResult(registry.get("math.add")!)).toBe(false);
	});
});
