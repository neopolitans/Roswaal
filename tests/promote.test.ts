/**
 * Promoting a node to something the Variables panel declares, since 0.153.0.
 *
 * Each promotion moves a thing from the canvas to the panel and rewires the
 * graph so the file means the same: these compile a graph before and after,
 * and say what changed in the file and what did not.
 */

import { describe, expect, it } from "vitest";

import { declareModule } from "../src/app/edits.js";
import { promotionsFor } from "../src/app/promote.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { SCRIPT_CALL } from "../src/core/scriptCalls.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const labels = (script: NodeScript, id: string) =>
	promotionsFor(script, registry, id).map((p) => p.label);

function promote(script: NodeScript, id: string, label: string): NodeScript {
	const found = promotionsFor(script, registry, id).find((p) => p.label === label);
	if (!found) throw new Error(`${id} does not offer ${label}`);
	return found.run(script);
}

const clean = (script: NodeScript) => {
	const out = compile(script, registry);
	expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return body(out.code);
};

describe("a Get Service", () => {
	function graph() {
		const b = new Builder();
		const start = b.node("script.begin");
		const get = b.node("roblox.getService");
		b.lit(get, "service", { t: "string", v: "Players" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(get, "service", print, "value");
		return { script: b.build(), get };
	}

	it("is promoted to Services, and keeps reading the same local", () => {
		const { script, get } = graph();
		const promoted = promote(script, get, "Promote to Services");
		expect(promoted.services).toEqual(["Players"]);
		expect(clean(promoted)).toBe(clean(script));
	});

	it("is not offered once declared, or on Lune", () => {
		const { script, get } = graph();
		expect(labels({ ...script, services: ["Players"] }, get)).toEqual([]);
		expect(labels({ ...script, target: "lune" }, get)).toEqual([]);
	});
});

describe("a Require Module", () => {
	function graph(as = "") {
		const b = new Builder();
		const start = b.node("script.begin");
		const req = b.node("module.requirePath");
		b.lit(req, "root", { t: "string", v: "ReplicatedStorage" });
		b.lit(req, "path", { t: "string", v: "Shared.Greeter" });
		if (as) b.lit(req, "as", { t: "string", v: as });
		const call = b.node(SCRIPT_CALL, {
			config: {
				module: req,
				moduleName: as || "Greeter",
				name: "greet",
				params: [],
				returns: [],
			},
		});
		const field = b.node("value.field");
		b.lit(field, "field", { t: "string", v: "version" });
		const print = b.node("debug.print");
		b.link(start, "then", call, "in");
		b.link(call, "then", print, "in");
		b.link(req, "exports", field, "object");
		b.link(field, "result", print, "value");
		return { script: b.build(), req, call };
	}

	it("is promoted to Modules: a Get Module in its place, its calls through the declaration", () => {
		const { script, req, call } = graph();
		const promoted = promote(script, req, "Promote to Modules");
		expect(promoted.modules).toEqual([
			expect.objectContaining({ name: "Greeter", specifier: "ReplicatedStorage.Shared.Greeter" }),
		]);
		const id = promoted.modules![0]!.id;
		expect(promoted.nodes.find((n) => n.id === req)).toMatchObject({
			def: "module.get",
			config: { module: id, name: "Greeter" },
		});
		expect(promoted.nodes.find((n) => n.id === call)?.config?.module).toBe(id);
		expect(clean(promoted)).toBe(clean(script));
	});

	it("keeps its As name", () => {
		const { script, req } = graph("Hello");
		expect(promote(script, req, "Promote to Modules").modules?.[0]?.name).toBe("Hello");
	});
});

describe("a Require at Top", () => {
	it("is promoted with its specifier as written", () => {
		const b = new Builder();
		const req = b.node("module.requireTop");
		b.lit(req, "specifier", { t: "string", v: "@lune/fs" });
		const promoted = promote(b.build({ target: "lune" }), req, "Promote to Modules");
		expect(promoted.modules?.[0]).toMatchObject({ name: "fs", specifier: "@lune/fs" });
	});
});

describe("a Declare Local", () => {
	function graph(opts: { wired?: boolean; inLoop?: boolean } = {}) {
		const b = new Builder();
		const start = b.node("script.begin");
		const declare = b.node("local.declare", { config: { type: "number" } });
		b.lit(declare, "name", { t: "string", v: "count" });
		b.lit(declare, "value", { t: "number", v: 3 });
		const read = b.node("local.get", {
			config: { local: declare, name: "count", type: "number" },
		});
		const set = b.node("local.set");
		b.lit(set, "value", { t: "number", v: 4 });
		const print = b.node("debug.print");
		const print2 = b.node("debug.print");
		if (opts.inLoop) {
			const loop = b.node("flow.while");
			b.lit(loop, "condition", { t: "boolean", v: true });
			b.link(start, "then", loop, "in");
			b.link(loop, "body", declare, "in");
		} else b.link(start, "then", declare, "in");
		if (opts.wired) {
			const n = b.node("value.expression");
			b.link(n, "result", declare, "value");
		}
		b.link(declare, "then", set, "in");
		b.link(declare, "ref", set, "variable");
		b.link(set, "then", print, "in");
		b.link(read, "value", print, "value");
		b.link(print, "then", print2, "in");
		b.link(declare, "ref", print2, "value");
		return { script: b.build(), declare, read, set };
	}

	it("is promoted to a script variable with its name, type and value", () => {
		const { script, declare, read, set } = graph();
		const promoted = promote(script, declare, "Promote to Variable");
		expect(promoted.variables).toEqual([
			expect.objectContaining({ name: "count", type: "number", default: { t: "number", v: 3 } }),
		]);
		expect(promoted.nodes.some((n) => n.id === declare)).toBe(false);
		expect(promoted.nodes.find((n) => n.id === read)?.def).toBe("variable.get");
		expect(promoted.nodes.find((n) => n.id === set)?.def).toBe("variable.set");
		expect(clean(promoted)).toBe(
			["local count: number = 3", "", "count = 4", "print(count)", "print(count)"].join("\n"),
		);
	});

	it("is not offered where it would be a fresh local each time, or computed where it stands", () => {
		const looped = graph({ inLoop: true });
		expect(labels(looped.script, looped.declare)).toEqual([]);
		const wired = graph({ wired: true });
		expect(labels(wired.script, wired.declare)).toEqual([]);
	});
});

describe("a named result", () => {
	it("is promoted to a Declare Local after its step, read by the same Get Locals", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const fn = b.node("value.expression");
		b.lit(fn, "code", { t: "raw", v: "math.random" });
		const step = b.node("call.function", { config: { args: 0, resultName: "roll" } });
		b.link(fn, "result", step, "fn");
		const read = b.node("local.get", { config: { local: step, name: "roll" } });
		const print = b.node("debug.print");
		b.link(start, "then", step, "in");
		b.link(step, "then", print, "in");
		b.link(read, "value", print, "value");
		const script = b.build();

		expect(labels(script, step)).toContain("Promote to Declare Local");
		const promoted = promote(script, step, "Promote to Declare Local");
		const declare = promoted.nodes.find((n) => n.def === "local.declare")!;
		expect(promoted.nodes.find((n) => n.id === step)?.config?.resultName).toBeUndefined();
		expect(promoted.nodes.find((n) => n.id === read)?.config?.local).toBe(declare.id);
		// The same file: the step's local was always declared there.
		expect(clean(promoted)).toBe(clean(script));
	});
});

describe("a module already declared", () => {
	it("is reused by a drop rather than doubled", () => {
		const once = declareModule(
			new Builder().build(),
			"Greeter",
			"ReplicatedStorage.Shared.Greeter",
		);
		const twice = declareModule(once.script, "Greeter", " ReplicatedStorage.Shared.Greeter ");
		expect(twice.script.modules).toHaveLength(1);
		expect(twice.id).toBe(once.id);
	});

	it("is what a promoted Require Module points at", () => {
		const b = new Builder();
		const req = b.node("module.requirePath");
		b.lit(req, "root", { t: "string", v: "ReplicatedStorage" });
		b.lit(req, "path", { t: "string", v: "Shared.Greeter" });
		const declared = { id: "m1", name: "Hello", specifier: "ReplicatedStorage.Shared.Greeter" };
		const promoted = promote(b.build({ modules: [declared] }), req, "Promote to Modules");
		expect(promoted.modules).toEqual([declared]);
		expect(promoted.nodes.find((n) => n.id === req)?.config).toEqual({
			module: "m1",
			name: "Hello",
		});
	});
});
