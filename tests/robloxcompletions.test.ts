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
