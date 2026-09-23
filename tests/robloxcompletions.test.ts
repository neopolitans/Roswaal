/**
 * Completion knows Roblox's datatypes and classes, in a graph that compiles
 * for Roblox.
 *
 * `Instance.` offered nothing and `Instance.new("Pa` completed nothing. The
 * cause was the one name meaning two things: `Instance` is a class, whose
 * members come from an instance, and a datatype, whose one constructor is
 * `Instance.new`. The editor knew neither side from the name.
 */

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { luauCompletionSource } from "../src/app/luauCompletions.js";
import type { Target } from "../src/core/schema.js";

/** The labels offered at `|`. */
function offered(source: string, target: Target = "roblox"): string[] {
	const pos = source.indexOf("|");
	const doc = source.replace("|", "");
	const context = new CompletionContext(EditorState.create({ doc }), pos, false);
	const result = luauCompletionSource(() => [], () => target)(context);
	return result ? result.options.map((o) => o.label) : [];
}

describe("after a datatype's name and a dot", () => {
	it("offers Instance.new", () => {
		expect(offered("local part = Instance.|")).toContain("new");
	});

	it("offers constructors and constants", () => {
		expect(offered("local v = Vector3.|")).toEqual(expect.arrayContaining(["new", "zero", "one", "xAxis"]));
		expect(offered("local c = CFrame.|")).toEqual(expect.arrayContaining(["new", "lookAt", "identity"]));
		expect(offered("local c = Color3.|")).toEqual(expect.arrayContaining(["fromRGB", "fromHex"]));
	});

	it("still offers a library's members", () => {
		expect(offered("math.|")).toContain("clamp");
	});

	it("offers none of Roblox's in a Lune graph", () => {
		expect(offered("local part = Instance.|", "lune")).toEqual([]);
		expect(offered("math.|", "lune")).toContain("clamp");
	});
});

describe("a class name in the string it is given as", () => {
	it("completes Instance.new's class", () => {
		expect(offered('Instance.new("Pa|')).toContain("Part");
	});

	it("completes IsA and the Find First Of Class calls", () => {
		expect(offered('if hit:IsA("Base|')).toContain("BasePart");
		expect(offered("character:FindFirstChildOfClass('Hum|")).toContain("Humanoid");
	});

	it("completes a service for GetService", () => {
		const services = offered('game:GetService("|');
		expect(services).toContain("Players");
		expect(services).not.toContain("Part");
	});
});

describe("a type", () => {
	it("offers classes and datatypes after an annotation's colon", () => {
		const types = offered("local part: |");
		expect(types).toEqual(expect.arrayContaining(["Part", "Vector3", "number"]));
	});

	it("offers them after ::", () => {
		expect(offered("local p = thing :: Mo|")).toContain("Model");
	});

	it("does not take a method call for a type", () => {
		expect(offered("part:Clo|")).not.toContain("Part");
	});

	it("offers only Luau's own types in a Lune graph", () => {
		const types = offered("local part: |", "lune");
		expect(types).toContain("number");
		expect(types).not.toContain("Part");
	});
});

describe("the cases from the first test of the editor", () => {
	it("takes `local Temp : Par` for a type, with a space before the colon", () => {
		expect(offered("local Temp : Par|")).toContain("Part");
	});

	it("offers every class, not only the common ones", () => {
		expect(offered('Instance.new("Proximity|')).toContain("ProximityPrompt");
		expect(offered("local p: Proximity|")).toContain("ProximityPrompt");
	});

	it("offers a Part's properties on a local typed or made as one", () => {
		expect(offered('local Temp : Part = Instance.new("Part")\nTemp.Na|')).toContain("Name");
		expect(offered('local Temp = Instance.new("Part")\nTemp.|')).toEqual(expect.arrayContaining(["Anchored", "Size", "Name"]));
		expect(offered('local players = game:GetService("Players")\nplayers.|')).toContain("LocalPlayer");
	});

	it("offers the keys of a table written out in its declaration", () => {
		const keys = offered('local tbl = {\n["Anne"] = 500,\n["James"] = 300,\nEmma = 475\n}\n\ntbl.An|');
		expect(keys).toEqual(["Anne", "James", "Emma"]);
	});

	it("offers nothing for a local whose declaration says nothing", () => {
		expect(offered("local thing = makeThing()\nthing.|")).toEqual([]);
	});
});

describe("a key in brackets", () => {
	const TABLE = 'local tbl = {\n["Anne"] = 500,\n["James"] = 300,\n["two words"] = 1,\n}\n';

	it("offers the keys inside the string", () => {
		expect(offered(`${TABLE}tbl["A|`)).toEqual(["Anne", "James", "two words"]);
	});

	it("offers them quoted before the string is started", () => {
		expect(offered(`${TABLE}tbl[|`)).toEqual(['"Anne"', '"James"', '"two words"']);
	});

	it("keeps a key that is not a name out of the dot's list", () => {
		expect(offered(`${TABLE}tbl.|`)).toEqual(["Anne", "James"]);
	});

	it("offers a class's properties in brackets too", () => {
		expect(offered('local p = Instance.new("Part")\np["Anc|')).toContain("Anchored");
	});

	it("still completes an ordinary name used as an index", () => {
		expect(offered("local index = 1\nlist[ind|")).toContain("index");
	});
});

describe("a method after a colon", () => {
	it("offers the methods of what a local holds, inherited ones included", () => {
		const methods = offered("local existing = script:FindFirstChild(name)\nexisting:Is|");
		expect(methods).toEqual(expect.arrayContaining(["IsA", "IsDescendantOf", "Clone", "Destroy"]));
	});

	it("offers a service's methods on the service's name", () => {
		expect(offered("RunService:|")).toContain("IsServer");
	});

	it("is not taken for a type annotation", () => {
		expect(offered("local x: |")).toContain("number");
	});
});

describe("events and enums", () => {
	it("offers a class's events after a dot, with its properties", () => {
		expect(offered('local part = Instance.new("Part")\npart.|')).toEqual(expect.arrayContaining(["Touched", "Anchored"]));
	});

	it("offers the enums after Enum, and an enum's items after its name", () => {
		expect(offered("local m = Enum.|")).toEqual(expect.arrayContaining(["Material", "KeyCode"]));
		expect(offered("local m = Enum.Material.|")).toEqual(expect.arrayContaining(["Plastic", "Neon"]));
	});
});
