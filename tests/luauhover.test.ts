/**
 * The code editor's hover: what a name is, what a call returns, and where its
 * Roblox docs page is.
 */

import { describe, expect, it } from "vitest";

import { hoverAt } from "../src/core/luau/hover.js";

const SOURCE = [
	'local Temp : Part = Instance.new("Part")',
	'Temp.Name = "TestPart"',
	"local tbl = { Anne = 500 }",
	"print(Temp, Vector3.zero)",
].join("\n");

/** The hover over the `nth` occurrence of `word`, one character in. */
function over(word: string, nth = 0, src = SOURCE, roblox = true) {
	let at = -1;
	for (let i = 0; i <= nth; i++) at = src.indexOf(word, at + 1);
	return hoverAt(src, at + 1, roblox);
}

describe("hoverAt", () => {
	it("says what Instance.new returns for the class it is given", () => {
		const hover = over("new")!;
		expect(hover.code).toBe("Instance.new(className: string, parent: Instance?) → Part");
		expect(hover.summary).toContain("BasePart");
		expect(hover.link?.href).toBe("https://create.roblox.com/docs/reference/engine/classes/Part");
		expect(hover.link?.label).toBe("Part - Roblox Creator Docs");
	});

	it("describes a class written as a string or as a type", () => {
		expect(over('"Part"')!.code).toBe("class Part");
		expect(over("Part", 0)!.code).toBe("class Part");
	});

	it("describes a local by what it was declared as", () => {
		expect(over("Temp", 1)!.code).toBe("local Temp: Part");
		expect(over("tbl")!.code).toBe("local tbl: table");
	});

	it("describes a property read off a local", () => {
		expect(over("Name")!.code).toBe("Part.Name: string");
	});

	it("describes a datatype and its constants", () => {
		expect(over("zero")!.code).toBe("Vector3.zero: Vector3");
		expect(over("Vector3")!.link?.href).toBe("https://create.roblox.com/docs/reference/engine/datatypes/Vector3");
	});

	it("says nothing Roblox's in a Lune graph", () => {
		expect(over("new", 0, SOURCE, false)).toBeNull();
		expect(over("Temp", 1, SOURCE, false)!.link).toBeUndefined();
	});
});
