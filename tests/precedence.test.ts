/**
 * Where parentheses are written, and where they are not.
 *
 * Two halves. The first exercises the lexical judgement directly, because it is
 * the piece that can be wrong quietly: a missing pair reassociates an
 * expression and nothing says so. The second is the same judgement reached
 * through a compile, which is where a regression would actually be noticed.
 */

import { describe, expect, it } from "vitest";

import { body, Builder } from "./helpers.js";
import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import {
	expressionPrecedence, foldPrecedence, parenAt, PREC, templatePrecedence,
} from "../src/core/compiler/luau.js";

const registry = createRegistry();

describe("how tightly an expression binds", () => {
	const cases: [string, number][] = [
		["part", PREC.postfix],
		["part.Transparency", PREC.postfix],
		['root:IsA("BasePart")', PREC.postfix],
		["(a or b)", PREC.postfix],
		["{ x = 1 }", PREC.postfix],
		["-5", PREC.postfix],
		["2 ^ 8", PREC.power],
		["not humanoid", PREC.unary],
		["#parts", PREC.unary],
		["-count", PREC.unary],
		["a * b", PREC.mul],
		["a + b", PREC.add],
		["a .. b", PREC.concat],
		["a == b", PREC.compare],
		["a and b", PREC.and],
		["a or b", PREC.or],
		["value :: BasePart", PREC.cast],
		// The loosest operator at the top level is what decides, whatever else
		// is in there.
		["not a or not b", PREC.or],
		["x + y * z", PREC.add],
	];

	for (const [expr, expected] of cases) {
		it(`${expr} binds at ${expected}`, () => {
			expect(expressionPrecedence(expr)).toBe(expected);
		});
	}

	/** A string is not scanned for operators, or `"a or b"` would read as one. */
	it("ignores operators inside strings", () => {
		expect(expressionPrecedence('warn("a or b")')).toBe(PREC.postfix);
		expect(expressionPrecedence('"a" .. "b or c"')).toBe(PREC.concat);
	});

	it("wraps only when the position needs more than the expression gives", () => {
		expect(parenAt("not part", PREC.or)).toBe("not part");
		expect(parenAt("a or b", PREC.and)).toBe("(a or b)");
		expect(parenAt("a and b", PREC.or)).toBe("a and b");
		expect(parenAt("a + b", PREC.postfix)).toBe("(a + b)");
		// Nothing is ever wrapped in an argument position.
		expect(parenAt("a or b", PREC.lowest)).toBe("a or b");
	});
});

describe("what a fold's separator asks of its operands", () => {
	it("lets an associative operator nest on either side", () => {
		expect(foldPrecedence(" and ")).toEqual({ first: PREC.and, rest: PREC.and });
		expect(foldPrecedence(" or ")).toEqual({ first: PREC.or, rest: PREC.or });
	});

	/** `a - (b - c)` is not `a - b - c`, so the later operands are held tighter. */
	it("holds later operands of a left-associative operator tighter", () => {
		expect(foldPrecedence(" - ")).toEqual({ first: PREC.add, rest: PREC.add + 1 });
		expect(foldPrecedence(" / ")).toEqual({ first: PREC.mul, rest: PREC.mul + 1 });
	});

	it("asks nothing of an argument list", () => {
		expect(foldPrecedence(", ")).toEqual({ first: PREC.lowest, rest: PREC.lowest });
	});
});

describe("what a hole in a template needs", () => {
	/** `$in.a` in `print($in.a)`: an open bracket is an argument list, not a chain. */
	it("asks nothing inside a call", () => {
		const template = "print($in.a)";
		expect(templatePrecedence(template, 6, 12)).toBe(PREC.lowest);
	});

	it("asks for an atom on either side of a dot", () => {
		const template = "$in.a.Name";
		expect(templatePrecedence(template, 0, 5)).toBe(PREC.postfix);
	});

	it("asks for a unary operand after not", () => {
		const template = "not $in.a";
		expect(templatePrecedence(template, 4, 9)).toBe(PREC.unary);
	});

	it("holds the right operand of a subtraction tighter than the left", () => {
		const template = "$in.a - $in.b";
		expect(templatePrecedence(template, 0, 5)).toBe(PREC.add);
		expect(templatePrecedence(template, 8, 13)).toBe(PREC.add + 1);
	});

	/** An assignment target must not be parenthesised; Luau refuses it. */
	it("asks nothing of an assignment target", () => {
		const template = "$in.variable = $in.value";
		expect(templatePrecedence(template, 0, 12)).toBe(PREC.lowest);
	});
});

describe("a graph of logic nodes", () => {
	/** The Occupancy line this was found on. */
	it("writes not inside or without brackets", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const either = b.node("logic.or", { config: { args: 3 } });
		b.link(start, "then", branch, "in");
		b.link(either, "result", branch, "condition");
		for (const [i, name] of ["humanoid", "root", "torso"].entries()) {
			const not = b.node("logic.not");
			b.lit(not, "a", { t: "raw", v: name });
			b.link(not, "result", either, `a${i}`);
		}
		b.link(branch, "true", b.node("script.end"), "in");

		expect(body(compile(b.build(), registry).code)).toContain(
			"if not humanoid or not root or not torso then",
		);
	});

	it("brackets a node that asks to be bracketed, and only that node", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const either = b.node("logic.or");
		const not = b.node("logic.not", { config: { parens: true } });
		b.lit(not, "a", { t: "raw", v: "humanoid" });
		b.link(start, "then", branch, "in");
		b.link(not, "result", either, "a0");
		b.lit(either, "a1", { t: "raw", v: "spare" });
		b.link(either, "result", branch, "condition");
		b.link(branch, "true", b.node("script.end"), "in");

		expect(body(compile(b.build(), registry).code)).toContain(
			"if (not humanoid) or spare then",
		);
	});

	/** An `or` inside an `and` still gets its brackets, asked for or not. */
	it("still brackets what Luau's precedence requires", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const branch = b.node("flow.branch");
		const both = b.node("logic.and");
		const either = b.node("logic.or");
		b.lit(either, "a0", { t: "raw", v: "a" });
		b.lit(either, "a1", { t: "raw", v: "b" });
		b.lit(both, "a0", { t: "raw", v: "guard" });
		b.link(either, "result", both, "a1");
		b.link(both, "result", branch, "condition");
		b.link(start, "then", branch, "in");
		b.link(branch, "true", b.node("script.end"), "in");

		expect(body(compile(b.build(), registry).code)).toContain(
			"if guard and (a or b) then",
		);
	});
});

describe("a generated name", () => {
	/**
	 * The `Occupancy.show(character2: Model, ...)` report. A name taken in one
	 * function used to be taken in the next, and the numbers moved every time
	 * anything was added above.
	 */
	it("is free again in the next function", () => {
		const b = new Builder();
		const params = [{ name: "character", type: "Model" }];
		const first = b.node("function.entry", { config: { name: "hide", params } });
		const second = b.node("function.entry", { config: { name: "show", params } });
		const print = b.node("debug.print");
		b.link(first, "then", print, "in");
		b.link(first, "p0", print, "value");
		b.link(second, "then", b.node("script.end"), "in");

		const out = body(compile(b.build(), registry).code);
		expect(out).toContain("local function hide(character: Model)");
		expect(out).toContain("local function show(character: Model)");
		expect(out).not.toContain("character2");
	});

	it("is free again in the next loop", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const table = b.node("table.new");
		const first = b.node("flow.forEach");
		const second = b.node("flow.forEach");
		b.link(start, "then", table, "in");
		b.link(table, "then", first, "in");
		b.link(table, "result", first, "table");
		b.link(first, "completed", second, "in");
		b.link(table, "result", second, "table");

		const out = body(compile(b.build(), registry).code);
		expect(out.match(/for key, value in/g)).toHaveLength(2);
	});

	/** Shadowing is a different thing, and is still avoided. */
	it("does not shadow a name an enclosing block holds", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const outer = b.node("local.declare");
		b.lit(outer, "name", { t: "string", v: "part" });
		b.lit(outer, "value", { t: "raw", v: "nil" });
		const branch = b.node("flow.branch");
		const inner = b.node("local.declare");
		b.lit(inner, "name", { t: "string", v: "part" });
		b.lit(inner, "value", { t: "raw", v: "nil" });
		b.link(start, "then", outer, "in");
		b.link(outer, "then", branch, "in");
		b.link(branch, "true", inner, "in");

		const out = body(compile(b.build(), registry).code);
		expect(out).toContain("local part = nil");
		expect(out).toContain("local part2 = nil");
	});
});
