/**
 * Code typed into a node offers the members of the graph's typed locals.
 *
 * `hull` in Rig is a named result whose type the Variables panel shows as
 * BasePart, and `hull.Posi` in a Luau Expression offered nothing: member
 * completion read types only from locals the code itself declares, and the
 * graph's locals reached the editor as names with their type in the detail
 * text. Now the graph says what each name holds.
 */

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
	type GraphTypes,
	graphLocalTypes,
	luauCompletionSource,
	precedingLocals,
} from "../src/app/luauCompletions.js";
import type { InstanceNode } from "../src/core/luau/instances.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** The labels offered at `|`, with the graph's types. */
function offered(source: string, types: GraphTypes): string[] {
	const pos = source.indexOf("|");
	const doc = source.replace("|", "");
	const context = new CompletionContext(EditorState.create({ doc }), pos, false);
	const result = luauCompletionSource(
		() => [],
		() => "roblox",
		() => new Map(),
		() => null,
		() => types,
	)(context);
	return result ? result.options.map((o) => o.label) : [];
}

/**
 * `local function need(): Instance`, then `hull = need()` as a named result,
 * then a Code Block. `cast` sets the call's Cast result.
 */
function needThenCode(returns: string, cast?: string): { script: NodeScript; code: string } {
	const b = new Builder();
	const begin = b.node("script.begin");
	const sig = { name: "need", params: [], returns: [{ name: "child", type: returns }] };
	const fn = b.node("function.declareHere", { config: sig });
	const call = b.node("function.call", {
		config: { function: fn, ...sig, resultName: "hull", ...(cast ? { resultCast: cast } : {}) },
	});
	const code = b.node("code.custom");
	b.lit(code, "code", { t: "raw", v: "print(hull)" });
	b.link(begin, "then", fn, "in").link(fn, "then", call, "in").link(call, "then", code, "in");
	return { script: b.build(), code };
}

describe("a named result's type", () => {
	it("is known to the code after it", () => {
		const { script, code } = needThenCode("BasePart");
		expect(graphLocalTypes(script, registry, code).get("hull")?.type).toBe("BasePart");
	});

	it("follows Cast result", () => {
		const { script, code } = needThenCode("Instance", "BasePart");
		expect(graphLocalTypes(script, registry, code).get("hull")?.type).toBe("BasePart");
	});

	it("offers the class's properties, inherited ones too, after a dot", () => {
		const { script, code } = needThenCode("Instance", "BasePart");
		const types = graphLocalTypes(script, registry, code);
		expect(offered("(hull.Posi|)", types)).toContain("Position");
		expect(offered("hull.|", types)).toEqual(expect.arrayContaining(["Size", "Name", "Parent"]));
	});

	it("offers the class's methods after a colon", () => {
		const { script, code } = needThenCode("BasePart");
		const types = graphLocalTypes(script, registry, code);
		expect(offered("hull:|", types)).toEqual(
			expect.arrayContaining(["GetFullName", "FindFirstChild", "GetMass"]),
		);
	});
});

describe("other typed locals", () => {
	it("offers a datatype's properties and methods", () => {
		const types: GraphTypes = new Map([["offset", { type: "Vector3" }]]);
		expect(offered("offset.|", types)).toEqual(expect.arrayContaining(["X", "Magnitude", "Unit"]));
		expect(offered("offset:|", types)).toEqual(expect.arrayContaining(["Dot", "Cross", "Lerp"]));
	});

	it("offers a declared table type's fields", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		b.node("type.declareTop", {
			config: {
				name: "Tank",
				fields: [
					{ name: "hull", type: "BasePart" },
					{ name: "rideHeight", type: "number" },
				],
			},
		});
		const declare = b.node("local.declare", { config: { type: "Tank" } });
		b.lit(declare, "name", { t: "string", v: "rig" });
		const code = b.node("code.custom");
		b.link(begin, "then", declare, "in").link(declare, "then", code, "in");
		const types = graphLocalTypes(b.build(), registry, code);
		expect(offered("rig.|", types)).toEqual(expect.arrayContaining(["hull", "rideHeight"]));
	});

	it("offers a typed loop variable's members, and the loop's variables by name", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const loop = b.node("flow.forEach", {
			config: { keyName: "_", valueName: "part", valueType: "BasePart" },
		});
		const code = b.node("code.custom");
		b.link(begin, "then", loop, "in").link(loop, "body", code, "in");
		const script = b.build();
		expect(precedingLocals(script, registry, code).map((c) => c.label)).toContain("part");
		expect(offered("part.|", graphLocalTypes(script, registry, code))).toContain("Anchored");
	});

	it("offers a typed script variable's members", () => {
		const b = new Builder();
		b.variable("Hull", "BasePart", { t: "nil" });
		const begin = b.node("script.begin");
		const code = b.node("code.custom");
		b.link(begin, "then", code, "in");
		expect(offered("Hull.|", graphLocalTypes(b.build(), registry, code))).toContain("Position");
	});
});

describe("an untyped local", () => {
	it("offers nothing more than before", () => {
		const b = new Builder();
		const begin = b.node("script.begin");
		const declare = b.node("local.declare");
		b.lit(declare, "name", { t: "string", v: "thing" });
		const code = b.node("code.custom");
		b.link(begin, "then", declare, "in").link(declare, "then", code, "in");
		const types = graphLocalTypes(b.build(), registry, code);
		expect(types.has("thing")).toBe(false);
		expect(offered("thing.|", types)).toEqual([]);
	});

	/** A local typed into the code hides the graph's name, as it does in the file. */
	it("typed in the code still decides what its name holds", () => {
		const types: GraphTypes = new Map([["hull", { type: "BasePart" }]]);
		expect(offered("local hull = {}\nhull.|", types)).not.toContain("Position");
	});
});

/**
 * A member of a member. `hull.Position.Y` offered nothing, because only the
 * name straight before the dot was looked up. The path is followed from its
 * first name, each step by its member's type.
 */
describe("a path of members", () => {
	const types: GraphTypes = new Map([["hull", { type: "BasePart" }]]);

	it("follows a property's type", () => {
		expect(offered("(hull.Position.|)", types)).toEqual(expect.arrayContaining(["X", "Y", "Z"]));
		expect(offered("hull.CFrame.Look|", types)).toContain("LookVector");
	});

	it("goes as deep as the types say", () => {
		expect(offered("hull.CFrame.Position.|", types)).toEqual(expect.arrayContaining(["X", "Y"]));
	});

	it("offers methods after a colon at its end", () => {
		expect(offered("hull.Position:|", types)).toEqual(expect.arrayContaining(["Dot", "Cross"]));
		expect(offered("hull.Touched:|", types)).toContain("Connect");
	});

	it("starts from a local the code declares, and from a global", () => {
		expect(offered("local p: Part = nil\np.Size.|", new Map())).toContain("X");
		expect(offered("workspace.CurrentCamera.CFrame.|", new Map())).toContain("LookVector");
	});

	it("offers nothing past a step it cannot follow", () => {
		expect(offered("hull.Nonsense.|", types)).toEqual([]);
	});
});

describe("a path through the place", () => {
	const node = (name: string, className: string, children: InstanceNode[] = []): InstanceNode => ({
		name,
		className,
		children: new Map(children.map((c) => [c.name, c])),
	});
	const root = node("game", "DataModel", [
		node("Workspace", "Workspace", [node("Platforms", "Folder", [node("Lift", "Part")])]),
	]);

	it("follows children the project knows, then the last one's members", () => {
		const pos = "workspace.Platforms.Lift.Position.".length;
		const doc = "workspace.Platforms.Lift.Position.";
		const context = new CompletionContext(EditorState.create({ doc }), pos, false);
		const result = luauCompletionSource(
			() => [],
			() => "roblox",
			() => new Map(),
			() => ({ root }),
			() => new Map(),
		)(context);
		expect(result?.options.map((o) => o.label)).toEqual(expect.arrayContaining(["X", "Y", "Z"]));
	});
});

/**
 * A node not wired in yet has no place in the flow to work out scope from,
 * and offered nothing. It now offers what its graph makes visible anywhere,
 * then the graph's other locals marked as needing the wire.
 */
describe("a node not wired in yet", () => {
	/** `local function f(target: Vector3)`, holding a Declare Local and a loose Luau Expression. */
	function loose(wired: boolean) {
		const b = new Builder();
		const begin = b.node("script.begin");
		const fn = b.node("function.declareHere", {
			config: {
				name: "f",
				method: false,
				params: [{ name: "target", type: "Vector3" }],
				returns: [],
			},
		});
		const speed = b.node("local.declare", { graph: fn, config: { type: "number" } });
		b.lit(speed, "name", { t: "string", v: "speed" }).lit(speed, "value", { t: "number", v: 1 });
		const expr = b.node("value.expression", { graph: fn });
		b.lit(expr, "code", { t: "raw", v: "speed" });
		b.link(begin, "then", fn, "in").link(fn, "body", speed, "in");
		const outside = b.node("local.declare");
		b.lit(outside, "name", { t: "string", v: "elsewhere" });
		b.link(fn, "then", outside, "in");
		if (wired) {
			const print = b.node("debug.print", { graph: fn });
			b.link(speed, "then", print, "in").link(expr, "result", print, "value");
		}
		return { script: b.build(), expr };
	}

	it("offers its function's parameters as sure, and the graph's locals as needing the wire", () => {
		const { script, expr } = loose(false);
		const offered = precedingLocals(script, registry, expr);
		expect(offered.find((c) => c.label === "target")?.detail).toBe("parameter");
		const speed = offered.find((c) => c.label === "speed");
		expect(speed?.detail).toContain("in scope once wired");
		expect(speed?.boost).toBe(-1);
		// Drawn in another graph: never offered.
		expect(offered.map((c) => c.label)).not.toContain("elsewhere");
	});

	it("knows the types of what it offers", () => {
		const { script, expr } = loose(false);
		const types = graphLocalTypes(script, registry, expr);
		expect(types.get("target")?.type).toBe("Vector3");
		expect(types.get("speed")?.type).toBe("number");
	});

	it("works scope out exactly once it is wired", () => {
		const { script, expr } = loose(true);
		const speed = precedingLocals(script, registry, expr).find((c) => c.label === "speed");
		expect(speed?.detail).not.toContain("once wired");
	});
});
