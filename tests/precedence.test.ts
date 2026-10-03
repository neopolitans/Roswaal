/**
 * Where parentheses are written, and where they are not.
 *
 * Two halves. The first exercises the lexical judgement directly, because it is
 * the piece that can be wrong quietly: a missing pair reassociates an
 * expression and nothing says so. The second is the same judgement reached
 * through a compile, which is where a regression would actually be noticed.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/core/compiler/index.js";
import {
	expressionPrecedence,
	foldPrecedence,
	PREC,
	parenAt,
	templatePrecedence,
} from "../src/core/compiler/luau.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { Builder, body } from "./helpers.js";

const registry = createRegistry();

describe("how tightly an expression binds", () => {
	const cases: [string, number][] = [
		["part", PREC.postfix],
		["part.Transparency", PREC.postfix],
		['root:IsA("BasePart")', PREC.postfix],
		["(a or b)", PREC.postfix],
		["{ x = 1 }", PREC.postfix],
		// Luau has no negative literals: this is unary minus applied to 5.
		["-5", PREC.unary],
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

	/** The lexer's tokens: a long bracket and an interpolated string are one each. */
	it("reads long brackets and interpolated strings whole", () => {
		expect(expressionPrecedence("[==[a or b]==]")).toBe(PREC.postfix);
		expect(expressionPrecedence("`{a + b} or {c}`")).toBe(PREC.postfix);
		expect(expressionPrecedence("`{a}` .. b")).toBe(PREC.concat);
		expect(expressionPrecedence("0x1F + 2.5e3")).toBe(PREC.add);
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

		expect(body(compile(b.build(), registry).code)).toContain("if (not humanoid) or spare then");
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

		expect(body(compile(b.build(), registry).code)).toContain("if guard and (a or b) then");
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

describe("unary minus and prefix positions", () => {
	/** Print whatever `wire` builds into the value pin, and return the line. */
	function printed(wire: (b: Builder, print: string) => void): string {
		const b = new Builder();
		const start = b.node("script.begin");
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		wire(b, print);
		const result = compile(b.build(), registry);
		expect(result.ok).toBe(true);
		return body(result.code);
	}

	/** `--3` is the start of a comment, and the line would print nothing. */
	it("brackets a negative number under Negate", () => {
		expect(
			printed((b, print) => {
				const neg = b.node("math.neg");
				b.lit(neg, "a", { t: "number", v: -3 });
				b.link(neg, "result", print, "value");
			}),
		).toContain("print(-(-3))");
	});

	it("brackets Negate under Negate", () => {
		expect(
			printed((b, print) => {
				const inner = b.node("math.neg");
				const outer = b.node("math.neg");
				b.lit(inner, "a", { t: "raw", v: "speed" });
				b.link(inner, "result", outer, "a");
				b.link(outer, "result", print, "value");
			}),
		).toContain("print(-(-speed))");
	});

	/** `-2 ^ 2` is -(2 ^ 2), which is -4. */
	it("brackets a negative base of a power", () => {
		expect(
			printed((b, print) => {
				const pow = b.node("math.pow");
				b.lit(pow, "a", { t: "number", v: -2 });
				b.lit(pow, "b", { t: "number", v: 2 });
				b.link(pow, "result", print, "value");
			}),
		).toContain("print((-2) ^ 2)");
	});

	it("leaves a negative number bare where nothing binds it", () => {
		expect(
			printed((b, print) => {
				const add = b.node("math.add");
				b.lit(add, "a0", { t: "raw", v: "speed" });
				b.lit(add, "a1", { t: "number", v: -1 });
				b.link(add, "result", print, "value");
			}),
		).toContain("print(speed + -1)");
	});

	/** Without them this reads `defaults.speed`, from the wrong table. */
	it("brackets an expression that Get Key indexes", () => {
		expect(
			printed((b, print) => {
				const either = b.node("logic.or");
				b.lit(either, "a0", { t: "raw", v: "config" });
				b.lit(either, "a1", { t: "raw", v: "defaults" });
				const get = b.node("table.getKey");
				b.link(either, "result", get, "table");
				b.lit(get, "key", { t: "string", v: "speed" });
				b.link(get, "result", print, "value");
			}),
		).toContain("print((config or defaults).speed)");
	});

	/** `"hello":upper()` is not Luau; a string has to be bracketed to be called on. */
	it("brackets a string that a method is called on", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const call = b.node("call.method", { config: { args: 0 } });
		b.lit(call, "object", { t: "string", v: "hello" });
		b.lit(call, "method", { t: "string", v: "upper" });
		b.link(start, "then", call, "in");
		const result = compile(b.build(), registry);
		expect(result.ok).toBe(true);
		expect(body(result.code)).toContain('("hello"):upper()');
	});
});
