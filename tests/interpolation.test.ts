/**
 * Concatenate, written as Luau's interpolated string.
 *
 * The same string either way, so what is worth holding is the *writing*: what
 * becomes text and what becomes a hole, what has to be escaped, and that the
 * node decides rather than a preference — a graph that read one way on one
 * machine and another way on somebody else's would write two different files.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { Literal, NodeScript } from "../src/core/schema.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();
const code = (script: NodeScript) => body(compile(script, registry).code);

/** A Concatenate of the given parts, printed. `null` is a wired value. */
function joined(parts: (string | null)[], interpolate: boolean): string {
	const b = new Builder();
	const start = b.node("script.begin");
	const cat = b.node("string.concat", { config: { args: parts.length, interpolate } });
	parts.forEach((part, i) => {
		if (part === null) {
			const from = b.node("value.expression", {
				literals: { code: { t: "raw", v: `value${i}` } as Literal },
			});
			b.link(from, "result", cat, `a${i}`);
		} else {
			b.lit(cat, `a${i}`, { t: "string", v: part });
		}
	});
	const print = b.node("debug.print");
	b.link(start, "then", print, "in");
	b.link(cat, "result", print, "value");
	return code(b.build());
}

describe("what Concatenate writes", () => {
	it("joins with .. by default", () => {
		expect(joined(["a ", null, " b"], false))
			.toContain('print("a " .. value1 .. " b")');
	});

	it("writes an interpolated string when the node says so", () => {
		expect(joined(["a ", null, " b"], true)).toContain("print(`a {value1} b`)");
	});

	/** Text typed into the node is text; a wire is a hole. */
	it("puts only the wired parts in braces", () => {
		expect(joined([null, " of ", null], true)).toContain("print(`{value0} of {value2}`)");
	});

	/**
	 * A constant that arrived down a wire is still a constant: a hole with
	 * nothing but a literal in it is a hole the reader looks through.
	 */
	it("unwraps a plain string literal that was wired in", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const text = b.node("value.string", { literals: { value: { t: "string", v: " has no " } } });
		const cat = b.node("string.concat", { config: { args: 2, interpolate: true } });
		b.lit(cat, "a0", { t: "string", v: "parent" });
		b.link(text, "result", cat, "a1");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(cat, "result", print, "value");
		expect(code(b.build())).toContain("print(`parent has no `)");
	});

	it("escapes what interpolation would otherwise read", () => {
		expect(joined(["a `tick`, a {brace}"], true))
			.toContain("print(`a \\`tick\\`, a \\{brace}`)");
	});

	it("takes a number pin as a hole", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const n = b.node("value.number", { literals: { value: { t: "number", v: 3 } } });
		const cat = b.node("string.concat", { config: { args: 2, interpolate: true } });
		b.lit(cat, "a0", { t: "string", v: "count: " });
		b.link(n, "result", cat, "a1");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(cat, "result", print, "value");
		expect(code(b.build())).toContain("print(`count: {3}`)");
	});

	/** Nothing about the choice reaches the other form. */
	it("leaves a join alone when the node says nothing", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const cat = b.node("string.concat", { config: { args: 2 } });
		b.lit(cat, "a0", { t: "string", v: "a" });
		b.lit(cat, "a1", { t: "string", v: "b" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(cat, "result", print, "value");
		expect(code(b.build())).toContain('print("a" .. "b")');
	});
});
