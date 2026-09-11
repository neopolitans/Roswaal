/**
 * Types that are more than a name, where a graph needs them.
 *
 * `Occupancy.luau` wants three things the graph could not say: a table type
 * declared after the module table (`type Restore = { ... }`), a local annotated
 * with a type built from it (`local restores: { [Model]: Restore } = {}`), and
 * those types reachable by name from anywhere that types are chosen. The only
 * route to the first was wiring a Luau Expression into Declare Type, which wrote
 * `typeof({ field: Type })` — not a type Luau accepts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { ExportedType } from "../src/app/api.js";
import { localRefFor } from "../src/app/edits.js";
import { requiredTypes } from "../src/app/projectTypes.js";
import { compile } from "../src/core/compiler/index.js";
import { typeShapeOf } from "../src/core/nodes/flow.js";
import { createRegistry, resolveNodePins } from "../src/core/nodes/index.js";
import { pinTypeOf } from "../src/core/nodes/variables.js";
import type { NodeScript, TypecheckMode } from "../src/core/schema.js";
import { exportedTypes, openProject } from "../src/server/project.js";
import { Builder, body } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = createRegistry();

const code = (script: NodeScript) => body(compile(script, registry).code);
const errors = (script: NodeScript) =>
	compile(script, registry).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);

/** A Declare Type in the flow, after a local, with the config given. */
function declared(config: Record<string, unknown>): NodeScript {
	const b = new Builder();
	const begin = b.node("script.begin");
	const type = b.node("type.declareHere", { config });
	b.link(begin, "then", type, "in");
	return b.build({ scriptClass: "ModuleScript" });
}

describe("Declare Type's shapes", () => {
	it("is still the type of a value when it has not said", () => {
		expect(typeShapeOf("type.declareHere", {})).toBe("typeof");
		expect(typeShapeOf("type.declareTop", {})).toBe("fields");
		expect(typeShapeOf("type.declareTop", { definition: "number" })).toBe("written");
	});

	it("writes a table of fields where it sits", () => {
		const script = declared({
			name: "Restore",
			shape: "fields",
			fields: [
				{ name: "walkSpeed", type: "number" },
				{ name: "weld", type: "WeldConstraint?" },
			],
		});
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain("export type Restore = { walkSpeed: number, weld: WeldConstraint? }");
	});

	it("writes Luau written out, over several lines", () => {
		const definition = "{\n\ttransparency: { [Instance]: number },\n\twalkSpeed: number,\n}";
		const script = declared({ name: "Restore", shape: "written", definition, export: false });
		expect(errors(script)).toEqual([]);
		expect(code(script)).toContain("type Restore = {\n\ttransparency: { [Instance]: number },");
	});

	it("refuses a definition whose brackets do not close", () => {
		const script = declared({ name: "Restore", shape: "written", definition: "{ walkSpeed: number" });
		expect(errors(script).join(" ")).toMatch(/this type's definition/);
	});

	it("says when there is nothing to write", () => {
		expect(errors(declared({ name: "Restore", shape: "fields", fields: [] })).join(" "))
			.toMatch(/needs a definition/);
	});

	it("has a Value pin only for the type of a value", () => {
		const def = registry.get("type.declareHere")!;
		const pins = (config: Record<string, unknown>) =>
			resolveNodePins(def, config).inputs.map((p) => p.id);
		expect(pins({})).toEqual(["in", "value"]);
		expect(pins({ shape: "fields" })).toEqual(["in"]);
		expect(pins({ shape: "written" })).toEqual(["in"]);
	});
});

describe("a typed Declare Local", () => {
	function local(type: string | undefined, typecheck: TypecheckMode = "strict"): NodeScript {
		const b = new Builder();
		const begin = b.node("script.begin");
		const declare = b.node("local.declare", { config: type ? { type } : {} });
		b.lit(declare, "name", { t: "string", v: "restores" });
		b.lit(declare, "value", { t: "raw", v: "{}" });
		b.link(begin, "then", declare, "in");
		return b.build({ typecheck });
	}

	it("writes its type after the name", () => {
		expect(code(local("{ [Model]: Restore }"))).toContain("local restores: { [Model]: Restore } = {}");
	});

	it("writes no type when the mode writes no annotations", () => {
		expect(code(local("{ [Model]: Restore }", "default"))).toContain("local restores = {}");
	});

	it("writes nothing extra for any", () => {
		expect(code(local("any"))).toContain("local restores = {}");
	});

	it("refuses a type it cannot write", () => {
		expect(errors(local("{ [Model]: Restore")).join(" ")).toMatch(/not a type Roswaal can write/);
	});

	it("gives its Local pin, and a Get Local's, the matching pin type", () => {
		const def = registry.get("local.declare")!;
		expect(resolveNodePins(def, { type: "{ [Model]: Restore }" }).outputs[1].type).toBe("table");
		expect(resolveNodePins(def, { type: "Model?" }).outputs[1].type).toBe("Model");
		expect(localRefFor({ id: "d", config: { type: "BasePart" } }).type).toBe("BasePart");
	});

	it("shows its type under the title", () => {
		expect(registry.get("local.declare")!.subtitle!({ type: "Restore" })).toBe("Restore");
	});
});

describe("pin types for Luau types", () => {
	it("keeps a name, drops an optional's mark, and calls a table a table", () => {
		expect(pinTypeOf("Model")).toBe("Model");
		expect(pinTypeOf("Config.Tuning")).toBe("Config.Tuning");
		expect(pinTypeOf("Model?")).toBe("Model");
		expect(pinTypeOf("{ [Model]: Restore }")).toBe("table");
		expect(pinTypeOf("(number) -> string")).toBe("any");
		expect(pinTypeOf(undefined)).toBe("any");
	});
});

describe("types a required module brings", () => {
	const exported: ExportedType[] = [
		{
			graph: "a/Config.nodescript", name: "Tuning",
			location: { root: "ReplicatedStorage", path: "Tank.Config", isModule: true },
		},
		{
			graph: "b/Other.nodescript", name: "Elsewhere",
			location: { root: "ServerStorage", path: "Other", isModule: true },
		},
		{ graph: "c/Unmapped.nodescript", name: "Lost", location: null },
	];

	function requiring(literals: Record<string, string>): NodeScript {
		const b = new Builder();
		const req = b.node("module.requirePath");
		for (const [pin, v] of Object.entries(literals)) b.lit(req, pin, { t: "string", v });
		return b.build();
	}

	it("names them after the module's local", () => {
		expect(requiredTypes(requiring({ root: "ReplicatedStorage", path: "Tank.Config" }), exported))
			.toEqual([{ type: "Config.Tuning", graph: "a/Config.nodescript" }]);
	});

	it("uses the As name when there is one", () => {
		const script = requiring({ root: "ReplicatedStorage", path: "Tank.Config", as: "TankConfig" });
		expect(requiredTypes(script, exported).map((t) => t.type)).toEqual(["TankConfig.Tuning"]);
	});

	it("offers nothing from a module the graph does not require", () => {
		expect(requiredTypes(requiring({ root: "ReplicatedStorage", path: "Tank.Other" }), exported)).toEqual([]);
		expect(requiredTypes(new Builder().build(), exported)).toEqual([]);
	});

	/** Read from the repository's own M103 project, which the conversion is building. */
	it("finds the M103 Config module's exported types", async () => {
		const project = await openProject(path.join(ROOT, "examples/m103/graph"));
		const types = await exportedTypes(project);
		const tuning = types.find((t) => t.name === "Tuning");
		expect(tuning?.graph).toMatch(/Config\.nodescript$/);
		expect(readFileSync(path.join(ROOT, tuning!.graph.replace(/^/, "examples/m103/graph/")), "utf8"))
			.toContain('"Tuning"');
	});
});
