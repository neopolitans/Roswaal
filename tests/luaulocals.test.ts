import { describe, expect, it } from "vitest";
import { localsAt, topLevelLocals } from "../src/core/luau/scope.js";

describe("finding locals in hand-written Luau", () => {
	it("finds a simple declaration", () => {
		expect(topLevelLocals('local newPart = Instance.new("Part")')).toEqual(["newPart"]);
	});

	it("finds every name in a multiple declaration", () => {
		expect(topLevelLocals("local a, b, c = 1, 2, 3")).toEqual(["a", "b", "c"]);
	});

	it("keeps a type annotation out of the names", () => {
		expect(topLevelLocals("local count: number, name: string = 0, 'x'")).toEqual([
			"count",
			"name",
		]);
	});

	it("finds a local function", () => {
		expect(topLevelLocals("local function helper(a, b)\n\treturn a + b\nend")).toEqual([
			"helper",
		]);
	});

	/** A `local` inside a string or comment is not a declaration. */
	it("ignores local inside strings and comments", () => {
		expect(topLevelLocals('local real = "local fake = 1"')).toEqual(["real"]);
		expect(topLevelLocals("-- local commented = 1\nlocal real = 2")).toEqual(["real"]);
		expect(topLevelLocals("--[[ local block = 1 ]]\nlocal real = 2")).toEqual(["real"]);
		expect(topLevelLocals("local s = `local {x} = 1`\nlocal real = 2")).toEqual([
			"s",
			"real",
		]);
	});

	it("does not repeat a name declared twice", () => {
		expect(topLevelLocals("local a = 1\nlocal a = 2")).toEqual(["a"]);
	});

	it("handles several declarations across lines", () => {
		const source = [
			'local newPart = Instance.new("Part")',
			"newPart.Parent = workspace",
			"local anchored = true",
			"local function tidy() end",
		].join("\n");
		expect(topLevelLocals(source)).toEqual(["newPart", "anchored", "tidy"]);
	});

	it("returns nothing for code with no declarations", () => {
		expect(topLevelLocals('print("hello")')).toEqual([]);
	});
});

describe("what a block leaves in scope", () => {
	/** The case the scanner got wrong: offered after the `if` had closed. */
	it("leaves out a local declared inside an if, a loop or a function", () => {
		const source = [
			"local kept = 1",
			"if kept then local inner = 2 end",
			"for i = 1, 3 do local each = i end",
			"local function tidy() local deep = 1 end",
		].join("\n");
		expect(topLevelLocals(source)).toEqual(["kept", "tidy"]);
	});
});

/** Names in scope at `|`, as `name:kind`. */
function at(source: string): string[] {
	const offset = source.indexOf("|");
	return localsAt(source.replace("|", ""), offset).map((n) => `${n.name}:${n.kind}`);
}

describe("what is in scope at the cursor", () => {
	it("offers a local inside its block, and not after it", () => {
		expect(at("local a = 1\nif a then\n  local inner = 2\n  |\nend")).toEqual(["a:local", "inner:local"]);
		expect(at("local a = 1\nif a then\n  local inner = 2\nend\n|")).toEqual(["a:local"]);
	});

	it("reads code still being typed, with its blocks not yet closed", () => {
		expect(at("local a = 1\nif a then\n  local inner = 2\n  pri|")).toEqual(["a:local", "inner:local"]);
	});

	it("offers parameters, and a local function's own name inside it", () => {
		expect(at("local function move(part, speed)\n  |\nend")).toEqual([
			"move:function", "part:parameter", "speed:parameter",
		]);
		expect(at("local cb = function(hit)\n  |\nend")).toEqual(["hit:parameter"]);
	});

	it("offers loop variables inside the loop only", () => {
		expect(at("for i, v in ipairs(t) do\n  |\nend")).toEqual(["i:loop variable", "v:loop variable"]);
		expect(at("for i = 1, 10 do end\n|")).toEqual([]);
	});

	it("does not offer a local inside its own value", () => {
		expect(at("local y = 1\nlocal x = |")).toEqual(["y:local"]);
	});

	it("offers a repeat body's locals in its until", () => {
		expect(at("repeat local done = step() until |")).toEqual(["done:local"]);
	});

	it("offers the innermost of two locals with one name, once", () => {
		expect(at("local x = 1\ndo\n  local x = 2\n  |\nend")).toEqual(["x:local"]);
	});
});
