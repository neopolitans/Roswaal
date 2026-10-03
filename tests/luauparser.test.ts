/**
 * The Luau parser: statements, expressions with Luau's precedence, and the
 * type language. Every sample is written for the test; real game code is
 * checked by `luaucorpus.test.ts`, from outside this repository.
 */

import { describe, expect, it } from "vitest";

import type { Expr, Stat, TypeNode } from "../src/core/luau/ast.js";
import { parseChunk } from "../src/core/luau/parser.js";
import { nodeAt, nodesAt, visitBlock } from "../src/core/luau/visit.js";

function ok(src: string): Stat[] {
	const { value, errors } = parseChunk(src);
	expect(errors).toEqual([]);
	return value;
}

function messages(src: string): string[] {
	return parseChunk(src).errors.map((e) => e.message);
}

/** The expression a `return` hands back, as a bracketed string. */
function shape(src: string): string {
	const [ret] = ok(`return ${src}`);
	if (ret.kind !== "return") throw new Error("not a return");
	return show(ret.values[0]);
}

function show(e: Expr): string {
	switch (e.kind) {
		case "binary": return `(${show(e.left)} ${e.op} ${show(e.right)})`;
		case "unary": return `(${e.op}${e.op === "not" ? " " : ""}${show(e.operand)})`;
		case "name": return e.name;
		case "number": return e.raw;
		case "string": return e.raw;
		case "cast": return `(${show(e.value)} :: ${e.type.kind})`;
		case "paren": return `[${show(e.inner)}]`;
		case "call": return `${show(e.callee)}(${e.args.map(show).join(", ")})`;
		case "methodCall": return `${show(e.object)}:${e.method.name}(${e.args.map(show).join(", ")})`;
		case "index": return `${show(e.object)}.${e.name.name}`;
		case "indexExpr": return `${show(e.object)}[${show(e.key)}]`;
		default: return e.kind;
	}
}

/** The type written on `local x: <type>`. */
function typeOf(src: string): TypeNode {
	const [stat] = ok(`local x: ${src}`);
	if (stat.kind !== "local") throw new Error("not a local");
	return stat.names[0].type!;
}

describe("precedence", () => {
	it("binds * tighter than +, and + tighter than comparison", () => {
		expect(shape("a + b * c < d")).toBe("((a + (b * c)) < d)");
	});

	it("chains .. and ^ to the right", () => {
		expect(shape("a .. b .. c")).toBe("(a .. (b .. c))");
		expect(shape("a ^ b ^ c")).toBe("(a ^ (b ^ c))");
	});

	it("puts ^ above unary minus, and unary minus above *", () => {
		expect(shape("-a ^ b")).toBe("(-(a ^ b))");
		expect(shape("-a * b")).toBe("((-a) * b)");
	});

	it("puts and above or", () => {
		expect(shape("a or b and c")).toBe("(a or (b and c))");
	});

	it("casts the simple expression before it, not the whole sum", () => {
		expect(shape("a + b :: number")).toBe("(a + (b :: reference))");
	});

	it("reads fields, indexes and calls left to right", () => {
		expect(shape("a.b[c]:d(e)(f)")).toBe("a.b[c]:d(e)(f)");
	});

	it("takes a string or a table as a call's only argument", () => {
		expect(shape('require "x"')).toBe('require("x")');
		expect(shape("f { 1 }")).toBe("f(table)");
	});
});

describe("statements", () => {
	it("reads every kind", () => {
		const kinds = ok(`
			local a: number, b = 1, 2
			const c = 3
			local function f<T>(x: T, ...: number): T return x end
			function M.g(self) end
			function M:h() end
			a, b = b, a
			a += 1
			a ..= "x"
			print(a)
			do end
			while a do break end
			repeat continue until a
			if a then elseif b then else end
			for i = 1, 10, 2 do end
			for k, v in pairs(t) do end
			type T<U = number> = { U }
			export type V = T<string>
			return a
		`).map((s) => s.kind);
		expect(kinds).toEqual([
			"local", "const", "localFunction", "functionStat", "functionStat", "assign", "compoundAssign",
			"compoundAssign", "callStat", "do", "while", "repeat", "if", "numericFor", "genericFor",
			"typeAlias", "typeAlias", "return",
		]);
	});

	it("keeps where each block's keywords are", () => {
		const src = "if a then elseif b then else end while c do end repeat until d for i = 1, 2 do end\n"
			+ "local function f(x) end";
		const text = (span: { start: number; end: number } | undefined) => span && src.slice(span.start, span.end);
		const [ifStat, whileStat, repeatStat, forStat, fn] = ok(src);
		if (ifStat.kind !== "if" || whileStat.kind !== "while" || repeatStat.kind !== "repeat") throw new Error();
		if (forStat.kind !== "numericFor" || fn.kind !== "localFunction") throw new Error();
		expect(ifStat.clauses.map((c) => [text(c.keyword), text(c.thenKeyword)])).toEqual([["if", "then"], ["elseif", "then"]]);
		expect([text(ifStat.elseKeyword), text(ifStat.endKeyword)]).toEqual(["else", "end"]);
		expect([text(whileStat.doKeyword), text(whileStat.endKeyword), text(repeatStat.untilKeyword)]).toEqual(["do", "end", "until"]);
		expect([text(forStat.doKeyword), text(forStat.endKeyword)]).toEqual(["do", "end"]);
		expect([text(fn.func.paramsClose), text(fn.func.endKeyword)]).toEqual([")", "end"]);
	});

	it("keeps attributes on a function", () => {
		const [stat] = ok("@native local function f() end");
		expect(stat.kind === "localFunction" && stat.attributes.map((a) => a.name)).toEqual(["native"]);
	});

	it("still reads continue, type and export as names where they are values", () => {
		ok("continue = 1\ntype(x)\nexport.y = 2\nlocal type = 3");
	});

	it("reads if-expressions and interpolated strings", () => {
		const [stat] = ok("local s = if a then `x {b}` elseif c then 'y' else `z`");
		if (stat.kind !== "local") throw new Error();
		const value = stat.values[0];
		expect(value.kind).toBe("ifElse");
		if (value.kind !== "ifElse") throw new Error();
		expect(value.clauses[0].value).toMatchObject({ kind: "interpolated", parts: ["x ", ""] });
	});
});

describe("types", () => {
	it("reads unions, optionals and intersections", () => {
		expect(typeOf("A | B?")).toMatchObject({ kind: "union", types: [{ kind: "reference" }, { kind: "optional" }] });
		expect(typeOf("A & B")).toMatchObject({ kind: "intersection" });
		expect(typeOf("| A | B")).toMatchObject({ kind: "union" });
	});

	it("reads table types: properties, an indexer, an array", () => {
		expect(typeOf("{ name: string, read id: number, [string]: boolean }")).toMatchObject({
			kind: "tableType",
			props: [{ name: "name" }, { name: "id", access: "read" }],
			indexer: { key: { name: "string" } },
		});
		expect(typeOf("{ Part }")).toMatchObject({ kind: "tableType", array: { name: "Part" } });
	});

	it("reads function types, generic and not", () => {
		expect(typeOf("(number, string) -> boolean")).toMatchObject({ kind: "functionType" });
		expect(typeOf("<T>(T) -> (T, number)")).toMatchObject({
			kind: "functionType", generics: [{ name: "T" }], returns: { types: [{}, {}] },
		});
		expect(typeOf("(...number) -> ...string")).toMatchObject({
			params: { tail: { kind: "variadic" } }, returns: { tail: { kind: "variadic" } },
		});
	});

	it("reads generic arguments, packs among them", () => {
		expect(typeOf("Signal<(Player, number)>")).toMatchObject({ args: [{ kind: "pack" }] });
		expect(typeOf("Map<string, { number }>")).toMatchObject({ args: [{}, { kind: "tableType" }] });
		expect(typeOf("Module.Config")).toMatchObject({ prefix: "Module", name: "Config" });
	});

	it("closes nested generics written against an =", () => {
		ok("local x: Array<Array<number>>= {}");
	});

	it("reads typeof and singletons", () => {
		expect(typeOf("typeof(workspace)")).toMatchObject({ kind: "typeof" });
		expect(typeOf('"left" | "right" | true')).toMatchObject({
			kind: "union", types: [{ kind: "singleton" }, { kind: "singleton" }, { kind: "singleton" }],
		});
	});

	it("reads a function returning a function", () => {
		ok("local function f(): (number) -> string return tostring end");
	});
});

describe("errors", () => {
	it("says what is missing and where", () => {
		const { errors } = parseChunk("if a then\n  print(a)\n");
		expect(errors[0].message).toBe('Expected "end" to close the if, but found the end of the code.');
	});

	it("refuses a value standing on its own", () => {
		expect(messages("a + 1")).toEqual([
			"This is a value on its own. A statement must call something or assign to something.",
		]);
	});

	it("refuses anything after a return", () => {
		expect(messages("return 1\nprint(2)")).toContain("Nothing can follow a return in the same block.");
	});

	it("refuses anything after a break or a continue, and says so once", () => {
		expect(messages("while x do break print(1) end")).toEqual(["Nothing can follow a break in the same block."]);
		expect(messages("for i = 1, 2 do continue; f() end")).toEqual(["Nothing can follow a continue in the same block."]);
		expect(messages("while x do if y then break end continue end")).toEqual([]);
	});

	it("leaves the end for its block when a statement stops at it", () => {
		expect(messages("if a then\n\tlocal x =\nend")).toEqual(['Expected a value, but found "end".']);
		expect(messages("function f()\n\tg(\nend")).toEqual(['Expected a value, but found "end".']);
	});

	it("says an if-expression needs its else", () => {
		expect(messages("local x = if a then 1")[0]).toBe(
			'Expected "else" — an if-expression always has an else, but found the end of the code.',
		);
	});

	it("goes on reading after a mistake, so later ones are found too", () => {
		expect(messages("local = 1\nlocal y = 2 +\nlocal w = 3")).toHaveLength(2);
	});

	it("reports what the lexer could not read", () => {
		expect(messages("local s = 'open\nprint(s)")).toContain("This string is not closed before the end of the line.");
	});
});

describe("walking the tree", () => {
	it("reaches every name, in statements, expressions, function bodies and types", () => {
		const block = ok([
			"local a: typeof(b) = function(c) return d[e] end",
			"function M.f() g(h, `x {i}`) end",
			"for _, j in k do l += if m then n else o end",
		].join("\n"));
		const names: string[] = [];
		visitBlock(block, {
			expr: (e) => {
				if (e.kind === "name") names.push(e.name);
			},
		});
		expect(names).toEqual(["b", "d", "e", "g", "h", "i", "k", "l", "m", "n", "o"]);
	});

	it("finds the nodes around a point, outermost first", () => {
		const src = "print(a.b, c)";
		const path = nodesAt(ok(src), src.indexOf("b"));
		expect(path.map((n) => `${n.role}:${n.role === "func" ? "body" : n.node.kind}`)).toEqual(["stat:callStat", "expr:call", "expr:index"]);
		expect(nodeAt(ok(src), src.indexOf("c"))?.node).toMatchObject({ kind: "name", name: "c" });
		expect(nodesAt(ok("f()\n\ng()"), 4)).toEqual([]);
	});

	it("leaves a node's children out when the visitor says so", () => {
		const calls: string[] = [];
		visitBlock(ok("f(function() g() end)"), {
			expr: (e) => {
				if (e.kind === "call" && e.callee.kind === "name") calls.push(e.callee.name);
				return e.kind !== "function";
			},
		});
		expect(calls).toEqual(["f"]);
	});
});
