/**
 * An Instance node typed as what the place holds at its path, and a getter
 * split into its parts drawn as an ordinary node.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { isCompact, isOperator, nodeBounds } from "../src/core/nodeBox.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { blankPlaceBytes } from "../src/core/rbx/blankPlace.js";
import { classAtPath, outlinePlace } from "../src/core/rbx/browse.js";
import { readRbx } from "../src/core/rbx/index.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();
const { outline } = outlinePlace(readRbx(blankPlaceBytes()));

describe("the class the place holds at a path", () => {
	it("is found from a service", () => {
		expect(classAtPath(outline, "Workspace", "Baseplate")).toBe("Part");
		expect(classAtPath(outline, "Workspace", "")).toBe("Workspace");
	});

	it("is found from game and from workspace", () => {
		expect(classAtPath(outline, "game", "Workspace.Baseplate")).toBe("Part");
		expect(classAtPath(outline, "workspace", "Baseplate")).toBe("Part");
	});

	it("is nothing where the place has nothing, or from script", () => {
		expect(classAtPath(outline, "Workspace", "Nope")).toBeUndefined();
		expect(classAtPath(outline, "Workspace", "Baseplate.Nope")).toBeUndefined();
		expect(classAtPath(outline, "script", "Parent")).toBeUndefined();
	});
});

describe("an Instance node found in the place", () => {
	const instance = registry.get("roblox.instancePath")!;

	it("gives the class it was found as", () => {
		const typed = resolveNodePins(instance, { className: "Part" });
		expect(typed.outputs[0].type).toBe("Part");
		expect(resolveNodePins(instance, {}).outputs[0].type).toBe("Instance");
		// A name that is not a class is not trusted as one.
		expect(resolveNodePins(instance, { className: "Banana" }).outputs[0].type).toBe("Instance");
	});

	it("is cast to it in the Luau", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const part = b.node("roblox.instancePath", { config: { className: "Part" } });
		b.lit(part, "root", { t: "string", v: "Workspace" });
		b.lit(part, "path", { t: "string", v: "Baseplate" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in").link(part, "instance", print, "value");
		const out = compile(b.build(), registry);
		expect(out.code).toMatch(/:: Part\)/);
	});

	it("opens a statement after the services with a semicolon, so Luau reads two", () => {
		// `local Workspace = game:GetService("Workspace")` then a line opening
		// with a bracket is one call to Luau.
		const b = new Builder();
		const start = b.node("script.begin");
		const part = b.node("roblox.instancePath", { config: { className: "Part" } });
		b.lit(part, "root", { t: "string", v: "Workspace" });
		b.lit(part, "path", { t: "string", v: "Baseplate" });
		const set = b.node("roblox.setProperty");
		b.lit(set, "property", { t: "string", v: "Anchored" });
		b.lit(set, "value", { t: "boolean", v: true });
		b.link(start, "then", set, "in").link(part, "instance", set, "instance");
		const out = compile(b.build(), registry);
		expect(out.code).toMatch(/\n;\(Workspace\.Baseplate :: Part\)\.Anchored = true/);
		expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});

describe("a getter split into its parts", () => {
	it("is drawn as an ordinary node, a row a part", () => {
		const getter = registry.get("value.member")!;
		const config = { member: "AssemblyCenterOfMass", type: "Vector3" };
		const whole = { id: "g", def: getter.id, x: 0, y: 0, config };
		const split = { ...whole, config: { ...config, split: { "out:result": "xyz" } } };
		expect(isOperator(getter, whole)).toBe(true);
		expect(isOperator(getter, split)).toBe(false);
		expect(resolveNodePins(getter, split.config).outputs.map((p) => p.id)).toEqual([
			"result.x",
			"result.y",
			"result.z",
		]);
		expect(nodeBounds(split, registry).h).toBeGreaterThan(nodeBounds(whole, registry).h);
	});

	it("leaves a capsule whole until its result is split", () => {
		const get = registry.get("variable.get")!;
		expect(isCompact(get, { config: {} })).toBe(true);
		expect(isCompact(get, { config: { split: { "out:value": "xyz" } } })).toBe(false);
	});
});
