/**
 * Is NaN, Is Infinite and Is Finite: `math.isnan`, `math.isinf` and
 * `math.isfinite`, which Luau added for the checks `x ~= x` and
 * `x == math.huge` used to spell.
 *
 * Pure nodes that take a number and hand back a boolean. Compiling one writes
 * the call, and importing the call reads it back as the node.
 */

import { describe, expect, it } from "vitest";

import { aliasScore } from "../src/core/aliases.js";
import { compile } from "../src/core/compiler/index.js";
import { documentNode } from "../src/core/docs/nodeReference.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const builtinIds = new Set(BUILTIN_NODES.map((d) => d.id));

const CHECKS = [
	{ id: "math.isNaN", title: "Is NaN", call: "math.isnan" },
	{ id: "math.isInf", title: "Is Infinite", call: "math.isinf" },
	{ id: "math.isFinite", title: "Is Finite", call: "math.isfinite" },
] as const;

function imported(src: string, file = "Test.server.luau"): NodeScript {
	const { name, scriptClass } = graphNameOf(file);
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t" });
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

/** The compiled file below its generated banner, and its errors. */
function roundTrip(src: string): { code: string; errors: string[] } {
	const out = compile(imported(src), registry);
	return {
		code: out.code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, ""),
		errors: out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message),
	};
}

describe("the math checks", () => {
	it("are pure Math nodes from a number to a boolean", () => {
		for (const { id, title } of CHECKS) {
			const def = registry.get(id);
			expect(def, id).toBeDefined();
			expect(def!.title).toBe(title);
			expect(def!.category).toBe("Math");
			expect(def!.pure).toBe(true);
			expect(def!.inputs.map((p) => [p.kind, p.type])).toEqual([["data", "number"]]);
			expect(def!.outputs.map((p) => [p.kind, p.type])).toEqual([["data", "boolean"]]);
		}
	});

	it("compiles each to its call", () => {
		for (const { id, call } of CHECKS) {
			const b = new Builder();
			const start = b.node("script.begin");
			const speed = b.node("value.expression", { literals: { code: { t: "raw", v: "speed" } } });
			const check = b.node(id);
			b.link(speed, "result", check, "a");
			const print = b.node("debug.print");
			b.link(start, "then", print, "in");
			b.link(check, "result", print, "value");
			expect(body(compile(b.build(), registry).code)).toContain(`print(${call}(speed))`);
		}
	});

	it("imports each call as its node, and compiles back to it", () => {
		const src = [
			"local v = 0 / 0",
			"print(math.isnan(v), math.isinf(v), math.isfinite(v))",
			"if math.isnan(v) then",
			"\tprint(v)",
			"end",
			"",
		].join("\n");
		const made = imported(src).nodes.map((n) => n.def);
		for (const { id } of CHECKS) expect(made, id).toContain(id);
		const { code, errors } = roundTrip(src);
		expect(errors).toEqual([]);
		expect(code).toContain("print(math.isnan(v), math.isinf(v), math.isfinite(v))");
		expect(code).toContain("if math.isnan(v) then");
	});

	it("are found by their Luau names, and Is NaN by NaN", () => {
		expect(aliasScore("math.isNaN", "isnan")).toBe(450);
		expect(aliasScore("math.isInf", "isinf")).toBe(450);
		expect(aliasScore("math.isFinite", "isfinite")).toBe(450);
		expect(aliasScore("math.isNaN", "nan")).toBe(450);
		expect(aliasScore("compare.selfNeq", "nan")).toBe(0);
	});

	it("each has a reference page with a compiled example", () => {
		for (const { id, call } of CHECKS) {
			const doc = documentNode(registry.get(id)!, registry, builtinIds);
			expect(doc.pure).toBe(true);
			expect(doc.example, id).toContain(`${call}(`);
		}
	});

	it("leave Not Equal to Self in place, pointing to Is NaN", () => {
		const old = registry.get("compare.selfNeq")!;
		expect(old.summary).toContain("Is NaN");
		expect(old.summary).not.toContain("has no `isnan`");
	});
});
