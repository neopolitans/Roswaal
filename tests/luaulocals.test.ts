import { describe, expect, it } from "vitest";
import { collectLocalNames } from "../src/core/luauLocals.js";

describe("finding locals in hand-written Luau", () => {
	it("finds a simple declaration", () => {
		expect(collectLocalNames('local newPart = Instance.new("Part")')).toEqual(["newPart"]);
	});

	it("finds every name in a multiple declaration", () => {
		expect(collectLocalNames("local a, b, c = 1, 2, 3")).toEqual(["a", "b", "c"]);
	});

	it("keeps a type annotation out of the names", () => {
		expect(collectLocalNames("local count: number, name: string = 0, 'x'")).toEqual([
			"count",
			"name",
		]);
	});

	it("finds a local function", () => {
		expect(collectLocalNames("local function helper(a, b)\n\treturn a + b\nend")).toEqual([
			"helper",
		]);
	});

	/** A `local` inside a string or comment is not a declaration. */
	it("ignores local inside strings and comments", () => {
		expect(collectLocalNames('local real = "local fake = 1"')).toEqual(["real"]);
		expect(collectLocalNames("-- local commented = 1\nlocal real = 2")).toEqual(["real"]);
		expect(collectLocalNames("--[[ local block = 1 ]]\nlocal real = 2")).toEqual(["real"]);
		expect(collectLocalNames("local s = `local {x} = 1`\nlocal real = 2")).toEqual([
			"s",
			"real",
		]);
	});

	it("does not repeat a name declared twice", () => {
		expect(collectLocalNames("local a = 1\nlocal a = 2")).toEqual(["a"]);
	});

	it("handles several declarations across lines", () => {
		const source = [
			'local newPart = Instance.new("Part")',
			"newPart.Parent = workspace",
			"local anchored = true",
			"local function tidy() end",
		].join("\n");
		expect(collectLocalNames(source)).toEqual(["newPart", "anchored", "tidy"]);
	});

	it("returns nothing for code with no declarations", () => {
		expect(collectLocalNames('print("hello")')).toEqual([]);
	});
});
