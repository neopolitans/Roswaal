/**
 * Moving declarations in the Variables panel: what moves at once, what asks
 * first, and what is refused, and the Luau following the list.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import {
	checkMove,
	moduleBand,
	moveIn,
	renameGroup,
	reorder,
	setGroup,
} from "../src/core/declarationOrder.js";
import { BUILTIN_NODES, createRegistry } from "../src/core/nodes/index.js";
import { emptyScript, type NodeScript, type ScriptVariable } from "../src/core/schema.js";

const registry = createRegistry(BUILTIN_NODES);
const variable = (id: string, name: string, raw?: string): ScriptVariable => ({
	id,
	name,
	type: "any",
	default: raw === undefined ? { t: "number", v: 1 } : { t: "raw", v: raw },
});
const script = (patch: Partial<NodeScript>): NodeScript => ({
	...emptyScript("Main", "main"),
	target: "roblox",
	...patch,
});

describe("moving within a list", () => {
	it("puts the row before or after its target", () => {
		expect(moveIn(["a", "b", "c"], (x) => x, "c", "a", "before")).toEqual(["c", "a", "b"]);
		expect(moveIn(["a", "b", "c"], (x) => x, "a", "b", "after")).toEqual(["b", "a", "c"]);
	});
});

describe("services", () => {
	it("move at once, and the GetService lines follow", () => {
		const s = script({ services: ["Players", "RunService"] });
		expect(checkMove(s, "service", "RunService", "Players", "before")).toEqual({ ok: true });
		expect(reorder(s, "service", "RunService", "Players", "before").services).toEqual([
			"RunService",
			"Players",
		]);
	});
});

describe("modules", () => {
	const s = script({
		modules: [
			{ id: "g", name: "Greeter", specifier: "ReplicatedStorage.Shared.Greeter" },
			{ id: "u", name: "Util", specifier: "ReplicatedStorage.Shared.Util" },
			{ id: "sig", name: "Signal", specifier: "@game/ReplicatedStorage/Signal" },
		],
	});

	it("is banded by its path, not by where it lives", () => {
		expect(moduleBand(s.modules![0])).toBe("ReplicatedStorage");
		expect(moduleBand(s.modules![2])).toBe("free");
	});

	it("asks to move within its band, since a require runs its module", () => {
		expect(checkMove(s, "module", "u", "g", "before")).toMatchObject({
			ok: true,
			asks: expect.any(String),
		});
	});

	it("is refused out of its band, saying why", () => {
		const out = checkMove(s, "module", "sig", "g", "before");
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/needs nothing above it/);
		expect(checkMove(s, "module", "g", "sig", "before").reason).toMatch(
			/required through ReplicatedStorage/,
		);
	});

	it("moves its require in the file", () => {
		const moved = reorder(s, "module", "u", "g", "before");
		const code = compile(moved, registry).code;
		expect(code.indexOf("Shared.Util")).toBeLessThan(code.indexOf("Shared.Greeter"));
	});
});

describe("variables", () => {
	it("move at once when their values are plain", () => {
		const s = script({ variables: [variable("a", "A"), variable("b", "B")] });
		expect(checkMove(s, "variable", "b", "a", "before")).toEqual({ ok: true });
	});

	it("are refused above one their value uses, lighting it", () => {
		const s = script({ variables: [variable("base", "BASE"), variable("max", "MAX", "BASE * 2")] });
		const out = checkMove(s, "variable", "max", "base", "before");
		expect(out.ok).toBe(false);
		expect(out.reason).toMatch(/MAX uses BASE/);
		expect(out.needs).toEqual(["base"]);
		// Moving the one used below its user is refused the same way.
		expect(checkMove(s, "variable", "base", "max", "after").ok).toBe(false);
	});

	it("ask first when their value runs something", () => {
		const s = script({
			variables: [variable("a", "A"), variable("part", "PART", 'Instance.new("Part")')],
		});
		expect(checkMove(s, "variable", "part", "a", "before")).toMatchObject({
			ok: true,
			asks: expect.stringMatching(/runs something/),
		});
	});
});

describe("groups of the author's own", () => {
	const grouped = (id: string, name: string, group?: string): ScriptVariable => ({
		...variable(id, name),
		...(group ? { group } : {}),
	});

	it("are written as a comment header over their run", () => {
		const s = script({
			variables: [
				grouped("a", "SPEED", "Tuning"),
				grouped("b", "GRIP", "Tuning"),
				grouped("c", "Count"),
			],
		});
		const lines = compile(s, registry).code.split("\n");
		const header = lines.indexOf("-- Tuning");
		expect(header).toBeGreaterThan(-1);
		expect(lines[header + 1]).toContain("SPEED");
		expect(lines[header + 2]).toContain("GRIP");
		expect(lines[header + 3]).toBe("");
	});

	it("keep their members together when one joins", () => {
		const s = script({
			variables: [grouped("a", "A", "Tuning"), grouped("b", "B"), grouped("c", "C")],
		});
		expect(setGroup(s, "c", "Tuning").variables.map((v) => [v.name, v.group])).toEqual([
			["A", "Tuning"],
			["C", "Tuning"],
			["B", undefined],
		]);
	});

	it("dissolve leaving the variables where they are", () => {
		const s = script({ variables: [grouped("a", "A", "Tuning"), grouped("b", "B", "Tuning")] });
		const out = renameGroup(s, "Tuning", "");
		expect(out.variables.map((v) => [v.name, v.group])).toEqual([
			["A", undefined],
			["B", undefined],
		]);
		expect(renameGroup(s, "Tuning", "Feel").variables.every((v) => v.group === "Feel")).toBe(true);
	});

	it("are joined by dragging a row beside a member", () => {
		const s = script({ variables: [grouped("a", "A", "Tuning"), grouped("b", "B")] });
		expect(reorder(s, "variable", "b", "a", "after").variables[1].group).toBe("Tuning");
	});
});

describe("a group on disk", () => {
	it("is written with the graph, and read back", async () => {
		const { serialiseScript } = await import("../src/core/compiler/index.js");
		const { migrateScript } = await import("../src/core/migrate.js");
		const s = script({ variables: [{ ...variable("a", "A"), group: "Tuning" }] });
		const text = serialiseScript(s);
		expect(text).toContain('"group": "Tuning"');
		expect(migrateScript(JSON.parse(text)).script.variables[0].group).toBe("Tuning");
	});
});
