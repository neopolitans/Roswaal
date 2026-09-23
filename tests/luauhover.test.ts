/**
 * The code editor's hover: a name and its type, what kind of name it is, what
 * a call returns, and where its Roblox docs page is.
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
		expect(hover.role).toBe("constructor");
		expect(hover.summary).toContain("BasePart");
		expect(hover.link?.href).toBe("https://create.roblox.com/docs/reference/engine/classes/Part");
		expect(hover.link?.label).toBe("Part - Roblox Creator Docs");
	});

	it("describes a class written as a string or as a type", () => {
		expect(over('"Part"')).toMatchObject({ code: "Part", role: "class" });
		expect(over("Part", 0)).toMatchObject({ code: "Part", role: "class" });
	});

	it("gives a local's type, and what kind of name it is under it", () => {
		expect(over("Temp", 1)).toMatchObject({ code: "Temp: Part", role: "local" });
		expect(over("tbl")).toMatchObject({ code: "tbl: table", role: "local" });
	});

	it("describes a property read off a local", () => {
		expect(over("Name")).toMatchObject({ code: "Part.Name: string", role: "property" });
	});

	it("describes a datatype and its constants", () => {
		expect(over("zero")).toMatchObject({ code: "Vector3.zero: Vector3", role: "constant" });
		expect(over("Vector3")!.link?.href).toBe("https://create.roblox.com/docs/reference/engine/datatypes/Vector3");
	});

	it("says nothing Roblox's in a Lune graph", () => {
		expect(over("new", 0, SOURCE, false)).toBeNull();
		expect(over("Temp", 1, SOURCE, false)!.link).toBeUndefined();
	});
});

describe("the cases from the generated Remotes file", () => {
	const REMOTES = [
		'local INPUT2 = "TankInput"',
		"local function event(name: string): RemoteEvent",
		"\tlocal existing = script:FindFirstChild(name)",
		'\tif existing and existing:IsA("RemoteEvent") then',
		"\t\treturn existing",
		"\tend",
		"end",
		"print(INPUT2, event)",
	].join("\n");

	it("types a local from its value", () => {
		expect(over("INPUT2", 1, REMOTES)).toMatchObject({ code: "INPUT2: string", role: "local" });
	});

	it("types a local function by its signature", () => {
		expect(over("event", 1, REMOTES)).toMatchObject({
			code: "event: (name: string) -> (RemoteEvent)", role: "local function",
		});
	});

	it("knows FindFirstChild may find nothing", () => {
		expect(over("existing", 1, REMOTES)).toMatchObject({ code: "existing: Instance?", role: "local" });
	});

	/** Roblox documents IsA on Object, the class above Instance. */
	it("describes a method, found on the class that declares it", () => {
		const hover = over("IsA", 0, REMOTES)!;
		expect(hover).toMatchObject({ code: "Object:IsA(className: string) → boolean", role: "method" });
		expect(hover.link?.label).toBe("Object - Roblox Creator Docs");
	});
});
