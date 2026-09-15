/**
 * `elseif`, and the two things that decide whether a chain forms.
 *
 * A Branch on another Branch's False pin is how every node editor spells
 * "otherwise, if", and it used to compile to a nested `if` inside an `else`.
 * The programs are identical; the files are not, and the difference compounds —
 * five conditions cost five levels of indentation and five `end`s.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();

const errors = (out: { diagnostics: { severity: string; message: string }[] }) =>
	out.diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/** A print whose text is its own name, so each arm is identifiable. */
function says(b: Builder, text: string): string {
	const node = b.node("debug.print");
	b.lit(node, "value", { t: "string", v: text });
	return node;
}

describe("a Branch wired into a Branch's False pin", () => {
	it("compiles to elseif rather than a nested if", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("flow.branch");
		const second = b.node("flow.branch");
		b.lit(second, "condition", { t: "boolean", v: false });
		b.link(start, "then", first, "in");
		b.link(first, "true", says(b, "a"), "in");
		b.link(first, "false", second, "in");
		b.link(second, "true", says(b, "b"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe([
			"if true then",
			`\tprint("a")`,
			"elseif false then",
			`\tprint("b")`,
			"end",
		].join("\n"));
	});

	it("keeps a final else, and closes the whole chain with one end", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("flow.branch");
		const second = b.node("flow.branch");
		const third = b.node("flow.branch");
		b.link(start, "then", first, "in");
		b.link(first, "true", says(b, "a"), "in");
		b.link(first, "false", second, "in");
		b.link(second, "true", says(b, "b"), "in");
		b.link(second, "false", third, "in");
		b.link(third, "true", says(b, "c"), "in");
		b.link(third, "false", says(b, "d"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		const lines = body(out.code).split("\n");
		expect(lines.filter((l) => l === "end")).toHaveLength(1);
		expect(lines.filter((l) => l.startsWith("elseif"))).toHaveLength(2);
		expect(lines.filter((l) => l === "else")).toHaveLength(1);
		// Every arm's body sits at one level, not at four.
		expect(lines.filter((l) => l.startsWith("\tprint"))).toHaveLength(4);
	});

	/**
	 * `elseif <cond> then` has nowhere to put a statement, so a condition that
	 * has to work something out first cannot be chained. The fallback is the
	 * code this always used to write, with the working-out at the top of the
	 * else block where it belongs.
	 */
	it("falls back to else when the next condition needs a line of its own", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("flow.branch");
		const second = b.node("flow.branch");
		// A named result asks for the local outright, so resolving this
		// condition emits a statement.
		const not = b.node("logic.not", { config: { resultName: "ready" } });
		b.link(start, "then", first, "in");
		b.link(first, "true", says(b, "a"), "in");
		b.link(first, "false", second, "in");
		b.link(not, "result", second, "condition");
		b.link(second, "true", says(b, "b"), "in");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toBe([
			"if true then",
			`\tprint("a")`,
			"else",
			"\tlocal ready = not false",
			"\tif ready then",
			`\t\tprint("b")`,
			"\tend",
			"end",
		].join("\n"));
	});

	it("does not chain through a Branch that is not the whole else arm", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("flow.branch");
		const second = b.node("flow.branch");
		const before = says(b, "before");
		b.link(start, "then", first, "in");
		b.link(first, "true", says(b, "a"), "in");
		b.link(first, "false", before, "in");
		b.link(before, "then", second, "in");
		b.link(second, "true", says(b, "b"), "in");

		const out = compile(b.build(), registry);
		expect(body(out.code)).toContain("else");
		expect(body(out.code)).not.toContain("elseif");
	});
});

describe("a loop variable's name", () => {
	it("comes from the node when one is given", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const table = b.node("table.new");
		const loop = b.node("flow.forEach", {
			config: { keyName: "part", valueName: "transparency" },
		});
		const print = b.node("debug.print");
		b.link(start, "then", table, "in");
		b.link(table, "then", loop, "in");
		b.link(table, "result", loop, "table");
		b.link(loop, "body", print, "in");
		b.link(loop, "value", print, "value");

		const out = compile(b.build(), registry);
		expect(errors(out)).toEqual([]);
		expect(body(out.code)).toContain("for part, transparency in pairs(");
		expect(body(out.code)).toContain("print(transparency)");
	});

	it("falls back to key and value when the fields are blank", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const table = b.node("table.new");
		const loop = b.node("flow.forEach", { config: { keyName: "  ", valueName: "" } });
		b.link(start, "then", table, "in");
		b.link(table, "then", loop, "in");
		b.link(table, "result", loop, "table");

		expect(body(compile(b.build(), registry).code)).toContain("for key, value in pairs(");
	});
});
