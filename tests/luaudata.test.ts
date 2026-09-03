import { describe, expect, it } from "vitest";
import { LuauParseError, parseLuauData } from "../src/core/luauData.js";
import { parseNodePack } from "../src/core/nodes/index.js";
import { checkLuauBalance } from "../src/core/luauCheck.js";

describe("Luau data parser", () => {
	it("parses a return of a named table", () => {
		expect(parseLuauData(`return { a = 1, b = "two", c = true, d = nil }`)).toEqual({
			a: 1,
			b: "two",
			c: true,
			d: null,
		});
	});

	it("parses a positional table as an array", () => {
		expect(parseLuauData(`return { 1, 2, 3 }`)).toEqual([1, 2, 3]);
	});

	it("parses nesting, bracket keys and trailing commas", () => {
		expect(
			parseLuauData(`return {
				nodes = {
					{ id = "a", ["title"] = "A" },
					{ id = "b", title = "B" },
				},
			}`),
		).toEqual({ nodes: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
	});

	it("handles comments, long strings and escapes", () => {
		const source = `
			--!strict
			-- a line comment
			--[[ a
			     block comment ]]
			return {
				text = "line\\nbreak",
				long = [[raw
text]],
				quote = 'single',
			}
		`;
		expect(parseLuauData(source)).toEqual({
			text: "line\nbreak",
			long: "raw\ntext",
			quote: "single",
		});
	});

	it("parses negative and exponent numbers", () => {
		expect(parseLuauData(`return { a = -5, b = 1.5, c = 2e3 }`)).toEqual({
			a: -5,
			b: 1.5,
			c: 2000,
		});
	});

	/**
	 * The security property the whole parser exists for: a pack is data, so
	 * anything that would require evaluating something is refused outright.
	 */
	it("refuses anything that would need evaluating", () => {
		expect(() => parseLuauData(`return { a = someFunction() }`)).toThrow(LuauParseError);
		expect(() => parseLuauData(`return { a = "x" .. "y" }`)).toThrow(LuauParseError);
		expect(() => parseLuauData(`return { a = game.Workspace }`)).toThrow(LuauParseError);
	});

	it("reports the line an error is on", () => {
		try {
			parseLuauData(`return {\n  a = 1,\n  b = boom(),\n}`);
			expect.unreachable("should have thrown");
		} catch (err) {
			expect((err as LuauParseError).line).toBe(3);
		}
	});

	it("reports an unterminated table rather than looping", () => {
		expect(() => parseLuauData(`return { a = 1`)).toThrow(/unterminated table/);
	});

	it("feeds straight into the node pack parser", () => {
		const source = `return {
			nodes = {
				{
					id = "test.double",
					title = "Double",
					category = "Math",
					inputs = { { id = "value", kind = "data", type = "number", default = 2 } },
					outputs = { { id = "result", kind = "data", type = "number" } },
					compilesTo = { kind = "expr", outputs = { result = "$in.value * 2" } },
				},
			},
		}`;

		const { defs, errors } = parseNodePack(parseLuauData(source), "test.nodedef.luau");
		expect(errors).toEqual([]);
		expect(defs).toHaveLength(1);
		expect(defs[0].pure).toBe(true);
		// A plain default is accepted and tagged for us.
		expect(defs[0].inputs[0].default).toEqual({ t: "number", v: 2 });
	});
});

describe("Luau balance check", () => {
	it("accepts well-formed code", () => {
		expect(
			checkLuauBalance(`
				local t = { a = 1 }
				if t.a > 0 then
					print("yes")
				end
			`),
		).toEqual([]);
	});

	it("finds an unclosed block", () => {
		const problems = checkLuauBalance(`if x then\n\tprint(1)`);
		expect(problems[0].message).toContain("never closed");
	});

	it("finds an unclosed string and points at its line", () => {
		const problems = checkLuauBalance(`local a = 1\nlocal b = "oops`);
		expect(problems[0].message).toContain("string is never closed");
		expect(problems[0].line).toBe(2);
	});

	it("finds a mismatched bracket", () => {
		expect(checkLuauBalance(`print(1]`)[0].message).toContain("closed by");
	});

	it("ignores block keywords inside strings and comments", () => {
		expect(checkLuauBalance(`local s = "end end end" -- end`)).toEqual([]);
		expect(checkLuauBalance(`--[[ if then ]] print(1)`)).toEqual([]);
	});

	it("does not count elseif twice", () => {
		expect(
			checkLuauBalance(`if a then\n\tx()\nelseif b then\n\ty()\nend`),
		).toEqual([]);
	});
});
