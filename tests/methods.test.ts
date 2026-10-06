/**
 * Declare Function as a method: `function T:name()`, with `self`.
 *
 * A function on a table could only be written `T.name`, so a class-style
 * module (`function Tank:aim(target)`) had no node, and the importer kept every
 * one of them as code. The method option writes the colon in the declaration
 * and in every call the graph makes to it, and its receiver is read like a
 * parameter: the entry's `self` pin, or Get Parameter named `self`.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { importLuau } from "../src/core/import/fromLuau.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { exportedFunctions, syncModuleCalls } from "../src/core/scriptCalls.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message);

/** `local Tank = {}`, then `function Tank:aim(target: Vector3): ()` reading `self`. */
function aim(options: { owner?: boolean; read?: "param" | "pin"; call?: boolean } = {}) {
	const b = new Builder();
	const begin = b.node("script.begin");
	const table = b.node("local.declare");
	b.lit(table, "name", { t: "string", v: "Tank" }).lit(table, "value", { t: "raw", v: "{}" });
	const fn = b.node("function.declareHere", {
		config: {
			name: "aim",
			method: true,
			params: [{ name: "target", type: "Vector3" }],
			returns: [],
		},
	});
	b.link(begin, "then", table, "in").link(table, "then", fn, "in");
	if (options.owner !== false) {
		const get = b.node("local.get", { config: { local: table, name: "Tank" } });
		b.link(get, "value", fn, "owner");
	}

	const print = b.node("debug.print", { graph: fn });
	b.link(fn, "body", print, "in");
	if (options.read === "pin") {
		b.link(fn, "receiver", print, "value");
	} else {
		const self = b.node("function.getParam", {
			graph: fn,
			config: { function: fn, param: "self" },
		});
		b.link(self, "value", print, "value");
	}

	if (options.call) {
		const call = b.node("function.call", {
			config: {
				function: fn,
				name: "aim",
				params: [{ name: "target", type: "Vector3" }],
				returns: [],
			},
		});
		b.lit(call, "a0", { t: "raw", v: "Vector3.zero" });
		b.link(fn, "then", call, "in");
	}
	return b.build();
}

describe("a method", () => {
	it("is declared with a colon", () => {
		expect(errors(aim())).toEqual([]);
		expect(code(aim())).toContain("function Tank:aim(target: Vector3): ()");
	});

	it("reads self through Get Parameter", () => {
		expect(code(aim())).toContain("\tprint(self)");
	});

	it("reads self through its entry pin", () => {
		expect(errors(aim({ read: "pin" }))).toEqual([]);
		expect(code(aim({ read: "pin" }))).toContain("\tprint(self)");
	});

	it("has a self pin before its parameters", () => {
		const def = registry.get("function.declareHere")!;
		const outputs = resolveNodePins(def, { method: true, params: [{ name: "target" }] }).outputs;
		expect(outputs.map((p) => p.id)).toEqual(["then", "body", "self", "receiver", "p0"]);
		expect(outputs.find((p) => p.id === "receiver")?.name).toBe("self");
	});

	it("is called with a colon by Script Function", () => {
		expect(code(aim({ call: true }))).toContain("Tank:aim(Vector3.zero)");
	});

	it("needs a table to belong to", () => {
		expect(errors(aim({ owner: false })).join(" ")).toMatch(/A method belongs to a table/);
	});

	it("is reached with a dot when read as a value", () => {
		const script = aim();
		const fn = script.nodes.find((n) => n.def === "function.declareHere")!;
		const get = {
			id: "get",
			def: "function.get",
			x: 0,
			y: 0,
			config: { function: fn.id, name: "aim" },
		};
		const print = { id: "out", def: "debug.print", x: 0, y: 0 };
		const tail = script.links.find((l) => l.from.node === fn.id && l.from.pin === "then");
		const withRead: NodeScript = {
			...script,
			nodes: [...script.nodes, get, print],
			links: [
				...script.links.filter((l) => l !== tail),
				{ id: "l1", from: { node: fn.id, pin: "then" }, to: { node: "out", pin: "in" } },
				{ id: "l2", from: { node: "get", pin: "fn" }, to: { node: "out", pin: "value" } },
			],
		};
		expect(code(withRead)).toContain("print(Tank.aim)");
	});
});

describe("a module's method", () => {
	it("is exported as one, and called with a colon from another script", () => {
		const module = aim();
		const exportsNode = { id: "exp", def: "module.exports", x: 0, y: 0 };
		const tank = module.nodes.find((n) => n.def === "local.declare")!;
		const read = {
			id: "read",
			def: "local.get",
			x: 0,
			y: 0,
			config: { local: tank.id, name: "Tank" },
		};
		const withExports: NodeScript = {
			...module,
			scriptClass: "ModuleScript",
			nodes: [...module.nodes, exportsNode, read],
			links: [
				...module.links,
				{ id: "lx", from: { node: "read", pin: "value" }, to: { node: "exp", pin: "e0" } },
			],
		};
		const exported = exportedFunctions(withExports, "Tank");
		expect(exported).toEqual([expect.objectContaining({ name: "aim", method: true })]);

		const b = new Builder();
		const begin = b.node("script.begin");
		const req = b.node("module.requirePath");
		b.lit(req, "root", { t: "raw", v: "script.Parent" }).lit(req, "path", {
			t: "string",
			v: "Tank",
		});
		b.lit(req, "as", { t: "string", v: "Tank" });
		const call = b.node("function.call", {
			config: { module: req, moduleName: "Tank", name: "aim", params: [], returns: [] },
		});
		b.link(begin, "then", call, "in");
		const synced = syncModuleCalls(b.build(), () => exported);
		expect(code(synced)).toMatch(/Tank:aim\(/);
	});
});

describe("importing one", () => {
	it("turns function T:m() into a method, with self wired", () => {
		const src =
			"--!strict\nlocal Tank = {}\nfunction Tank:aim(target: Vector3): ()\n\tprint(self, target)\nend\nreturn Tank\n";
		const result = importLuau(src, { name: "Tank", scriptClass: "ModuleScript", target: "roblox" });
		if (!result.ok) throw new Error(result.error);
		const decl = result.script.nodes.find((n) => n.def === "function.declareHere");
		expect(decl?.config).toMatchObject({ name: "aim", method: true });
		expect(errors(result.script)).toEqual([]);
		expect(code(result.script)).toContain("function Tank:aim(target: Vector3): ()");
	});
});
