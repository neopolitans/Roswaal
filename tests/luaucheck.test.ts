/**
 * Hand-written Luau is parsed as what it is: Custom Code as statements, a Luau
 * Expression or code typed into a pin as one value, a written type as a type.
 *
 * This replaced a bracket-and-keyword balance check, which could not tell a
 * value from a statement and misread interpolated strings and long brackets.
 */

import { describe, expect, it } from "vitest";

import { checkLuau } from "../src/core/luau/check.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

const messages = (text: string, kind: "block" | "expression" | "type") =>
	checkLuau(text, kind).map((p) => p.message);

describe("checkLuau", () => {
	it("accepts real Luau the balance check misread", () => {
		expect(messages("print(`{a} and {b}`)", "block")).toEqual([]);
		expect(messages("local s = [==[ ]] still open? no ]==]", "block")).toEqual([]);
		expect(messages("`{ {1, 2} }`", "expression")).toEqual([]);
	});

	it("says where a block's mistake is, by line", () => {
		const [problem] = checkLuau("local x = 1\nif x then\n  print(x)\n", "block");
		expect(problem.message).toBe('Expected "end" to close the if, but found the end of the code.');
		expect(problem.line).toBe(4);
	});

	it("refuses a statement where a value goes, and names Custom Code", () => {
		expect(messages("local x = 1", "expression")[0]).toBe(
			'"local" starts a statement, and this is a value. Use Custom Code for statements; it sits in the execution chain instead.',
		);
		expect(messages("  return 1", "expression")[0]).toContain('"return" starts a statement');
	});

	it("still takes an anonymous function as a value", () => {
		expect(messages("function(x) return x end", "expression")).toEqual([]);
	});

	it("refuses two values side by side", () => {
		expect(messages("a b", "expression")).toEqual(['Only one value goes here, but "b" follows it.']);
	});

	it("reads a type, and refuses what is not one", () => {
		expect(messages("{ [Model]: Restore }?", "type")).toEqual([]);
		expect(messages("(number) -> string", "type")).toEqual([]);
		expect(messages("2 bad", "type")[0]).toBe('Expected a type, but found "2".');
	});

	it("marks at least one character, even at the end of the text", () => {
		const [problem] = checkLuau("f(", "block");
		expect(problem.to).toBeGreaterThan(problem.from);
	});
});

describe("in the compiler", () => {
	function compiled(def: string, code: string) {
		const b = new Builder();
		const start = b.node("script.begin");
		const node = b.node(def);
		b.lit(node, "code", { t: "raw", v: code });
		if (def === "code.custom") {
			b.link(start, "then", node, "in");
		} else {
			const print = b.node("debug.print");
			b.link(start, "then", print, "in");
			b.link(node, "result", print, "value");
		}
		return compile(b.build(), registry);
	}

	it("reports a Custom Code mistake against the node, with its line", () => {
		const out = compiled("code.custom", "for i = 1, 3 do\n  print(i)\n");
		const error = out.diagnostics.find((d) => d.severity === "error")!;
		expect(error.message).toContain('Expected "end" to close the for loop');
		expect(error.message).toContain("(line 3 of this node's code)");
		expect(error.pin).toBe("code");
	});

	it("compiles Custom Code that the balance check would have refused", () => {
		const out = compiled("code.custom", "print(`total: {#{1, 2}}`)");
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});

	it("checks code typed into an ordinary pin as a value", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const add = b.node("vector3.add");
		b.lit(add, "a", { t: "raw", v: "Vector3.new(1, 2" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(add, "result", print, "value");
		const errors = compile(b.build(), registry).diagnostics.filter((d) => d.severity === "error");
		expect(errors.map((e) => e.pin)).toContain("a");
	});
});
