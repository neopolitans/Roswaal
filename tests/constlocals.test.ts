/**
 * `const`, which Luau added in 2026.
 *
 * The same binding as `local` with one guarantee: the name cannot be reassigned
 * after it is initialised. It is the *binding* that is fixed and not the value,
 * so a const table is still a table you can write into — which is the half
 * people get wrong, and the half a node cannot help with.
 *
 * What Roswaal adds is the refusal: a Set Local wired to a const is an error
 * before the file is written, because the graph knows which node made the
 * promise and the runtime only knows the line that broke it.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { isConstLocal } from "../src/core/nodes/variables.js";

const registry = createRegistry();

/** Declare a local, optionally const, and print it. */
function declaring(constant: boolean) {
	const b = new Builder();
	const start = b.node("script.begin", { id: "start" });
	const declare = b.node("local.declare", {
		id: "declare",
		config: constant ? { const: true, type: "number" } : { type: "number" },
	});
	b.lit(declare, "name", { t: "string", v: "limit" });
	b.lit(declare, "value", { t: "number", v: 5 });
	const print = b.node("debug.print", { id: "print" });
	b.link(start, "then", declare, "in");
	b.link(declare, "then", print, "in");
	b.link(declare, "ref", print, "value");
	return b.build();
}

describe("a constant local", () => {
	it("is written with the keyword", () => {
		const out = compile(declaring(true), registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toContain("const limit: number = 5");
	});

	/** Unmarked is unchanged: every graph written before this compiles the same. */
	it("leaves an ordinary local alone", () => {
		expect(body(compile(declaring(false), registry, {}).code)).toContain("local limit: number = 5");
	});

	it("is a choice on the node, off unless it was made", () => {
		expect(isConstLocal(undefined)).toBe(false);
		expect(isConstLocal({})).toBe(false);
		expect(isConstLocal({ const: true })).toBe(true);
		expect(isConstLocal({ const: "yes" })).toBe(false);
	});
});

describe("assigning to a constant", () => {
	/** The whole of the check: a wire from a const Declare Local into Set Local. */
	function reassigning(constant: boolean) {
		const b = new Builder();
		const start = b.node("script.begin", { id: "start" });
		const declare = b.node("local.declare", {
			id: "declare",
			config: constant ? { const: true } : {},
		});
		b.lit(declare, "name", { t: "string", v: "limit" });
		b.lit(declare, "value", { t: "number", v: 5 });
		const set = b.node("local.set", { id: "set" });
		b.lit(set, "value", { t: "number", v: 6 });
		b.link(start, "then", declare, "in");
		b.link(declare, "then", set, "in");
		b.link(declare, "ref", set, "variable");
		return b.build();
	}

	it("is refused, by name, before the file is written", () => {
		const out = compile(reassigning(true), registry, {});
		const errors = out.diagnostics.filter((d) => d.severity === "error");
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toContain('"limit" is a constant');
		expect(errors[0].node).toBe("set");
		expect(errors[0].pin).toBe("variable");
	});

	it("is fine for an ordinary local", () => {
		const out = compile(reassigning(false), registry, {});
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(body(out.code)).toContain("limit = 6");
	});
});
