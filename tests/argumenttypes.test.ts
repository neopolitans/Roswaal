/**
 * Arguments of a type a method does not take (0.186.0): in the code editor,
 * a file read on its own, and a graph's code, where it is a warning on the
 * node.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { argumentProblems } from "../src/core/luau/argumentTypes.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();
const graph = new Map([
	["hull", "BasePart"],
	["leftTrack", "BasePart?"],
]);

describe("an argument of the wrong type", () => {
	it("is found for a datatype's method on a name the graph types", () => {
		const src = "if hull.CFrame:PointToObjectSpace(leftTrack.Position.X) < 0 then 1 else -1";
		const [problem, ...rest] = argumentProblems(src, "expression", graph);
		expect(rest).toEqual([]);
		expect(problem.message).toBe(
			"CFrame:PointToObjectSpace takes a Vector3 here, and this is a number.",
		);
		expect(src.slice(problem.from, problem.to)).toBe("leftTrack.Position.X");
	});

	it("is found for a class's method on a local the file types", () => {
		const src = 'local part: BasePart = workspace.Baseplate\npart:ApplyImpulse("up")\n';
		const [problem] = argumentProblems(src, "block");
		expect(problem.message).toContain("BasePart:ApplyImpulse takes a Vector3");
		expect(problem.line).toBe(2);
	});
});

describe("nothing is said", () => {
	it("for the right type", () => {
		const src = "hull.CFrame:PointToObjectSpace(leftTrack.Position).X < 0";
		expect(argumentProblems(src, "expression", graph)).toEqual([]);
	});

	it("for a method on something whose type is not known", () => {
		expect(argumentProblems("thing:ApplyImpulse(4)", "expression")).toEqual([]);
	});

	it("for a number where a string is taken, which the engine converts", () => {
		const src = "local part: BasePart = workspace.Baseplate\nprint(part:GetAttribute(4))\n";
		expect(argumentProblems(src, "block")).toEqual([]);
	});

	it("for code that does not parse", () => {
		expect(argumentProblems("hull.CFrame:PointToObjectSpace(", "expression", graph)).toEqual([]);
	});
});

describe("a graph's code", () => {
	it("warns on the node that holds it", () => {
		const src = [
			"local function face(hull: BasePart, target: BasePart)",
			"\tprint(hull.CFrame:PointToObjectSpace(target.Position.X))",
			"\tlocal a, b = hull.CFrame:PointToObjectSpace(target.Position.X), 1",
			"\tprint(a, b)",
			"end",
			"",
		].join("\n");
		const { name, scriptClass } = graphNameOf("Face.server.luau");
		const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t" });
		if (!result.ok) throw new Error(result.error);
		const warnings = compile(result.script, registry).diagnostics.filter(
			(d) => d.severity === "warning" && d.message.includes("takes a Vector3"),
		);
		// The call is not made a node wired the wrong way: both stay as code.
		expect(result.script.nodes.map((n) => n.def)).not.toContain("cframe.pointToObjectSpace");
		expect(warnings).toHaveLength(2);
		expect(warnings[0].node).toBeDefined();
	});
});
