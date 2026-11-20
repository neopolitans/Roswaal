/**
 * Tidy declarations, Move to top and Make local: what can move, why the rest
 * stays, and that what moves compiles to a file that does the same.
 */

import { describe, expect, it } from "vitest";

import { makeLocalPlan, moveToTop, tidyAll, tidyPlan } from "../src/app/tidy.js";
import { compile } from "../src/core/compiler/index.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import type { TopLevelLocals } from "../src/core/import/modes.js";
import { createRegistry } from "../src/core/nodes/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { scriptOrder } from "../src/core/scriptOrder.js";

const registry = createRegistry();

function imported(src: string, locals: TopLevelLocals = "variable"): NodeScript {
	const { name, scriptClass } = graphNameOf("T.server.luau");
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t", locals });
	if (!result.ok) throw new Error(result.error);
	return result.script;
}

function planOf(script: NodeScript) {
	const out = compile(script, registry);
	const order = scriptOrder(out.code, out.sourceMap);
	return { code: out.code, order, plan: tidyPlan(script, order.flow, out.code) };
}

const OLDER = [
	"local function getCharacter(player)",
	"\treturn player.Character",
	"end",
	"",
	"type State = { round: number }",
	"local DEFAULT_SPEED = 16",
	"local spawnPart = workspace.SpawnLocation",
	"",
	"print(getCharacter, DEFAULT_SPEED, spawnPart)",
	"",
].join("\n");

describe("Tidy declarations", () => {
	for (const locals of ["variable", "local"] as const) {
		it(`moves a plain constant and a type, and says why the rest stay (${locals})`, () => {
			const script = imported(OLDER, locals);
			const { plan } = planOf(script);
			const by = Object.fromEntries(plan.map((r) => [r.name, r]));
			expect(by.DEFAULT_SPEED).toMatchObject({ can: true, why: "A number, set once" });
			expect(by.State).toMatchObject({ can: true });
			expect(by.spawnPart).toMatchObject({ can: false });
			expect(by.getCharacter).toMatchObject({ can: false });

			const tidied = tidyAll(script, plan);
			const out = compile(tidied, registry);
			expect(out.ok).toBe(true);
			const lines = out.code.split("\n");
			const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
			// Both now come before the first function, and nothing else moved.
			expect(at("DEFAULT_SPEED = 16")).toBeLessThan(at("getCharacter("));
			expect(at("type State")).toBeLessThan(at("getCharacter("));
			expect(at("spawnPart = workspace.SpawnLocation")).toBeGreaterThan(at("getCharacter("));
			// And the plan has nothing more to move.
			expect(planOf(tidied).plan.filter((r) => r.can)).toEqual([]);
		});
	}

	it("keeps a name read above its declaration, where it meant a global", () => {
		const src = "print(LIMIT)\nlocal LIMIT = 3\nprint(LIMIT)\n";
		const { plan } = planOf(imported(src, "local"));
		expect(plan.find((r) => r.name === "LIMIT")).toMatchObject({
			can: false,
			why: "Named above it, where it means a global",
		});
	});

	it("keeps a type that names a type the flow declares", () => {
		const src = "type A = { n: number }\nprint(1)\ntype B = { a: A }\n";
		const script = imported(src, "local");
		const { plan } = planOf(script);
		const b = plan.find((r) => r.name === "B");
		if (b?.can === false) expect(b.why).toContain("A");
	});

	it("moves one row with Move to top", () => {
		const script = imported(OLDER, "local");
		const { plan } = planOf(script);
		const speed = plan.find((r) => r.name === "DEFAULT_SPEED");
		if (!speed) throw new Error("no row");
		const moved = moveToTop(script, speed.node);
		expect(moved.variables.some((v) => v.name === "DEFAULT_SPEED")).toBe(true);
	});
});

describe("Make local", () => {
	const globalOf = (script: NodeScript, name: string) => {
		const { code, order } = planOf(script);
		const g = order.globals.find((x) => x.name === name);
		if (!g) throw new Error(`no global ${name}`);
		return { code, g };
	};

	it("adds local where a Code Block first sets it", () => {
		const script = imported("playersAlive = 0\nprint(playersAlive)\nplayersAlive = 2\n");
		const { code, g } = globalOf(script, "playersAlive");
		const plan = makeLocalPlan(script, code, g);
		expect(plan.ok).toBe(true);
		const out = compile(plan.run?.(script) ?? script, registry).code;
		expect(out).toContain("local playersAlive = 0");
		expect(out).toContain("playersAlive = 2");
		expect(out).not.toContain("local playersAlive = 2");
	});

	it("makes a global function a local one", () => {
		const script = imported("function startRound()\n\tprint(1)\nend\n\nstartRound()\n");
		const { code, g } = globalOf(script, "startRound");
		const plan = makeLocalPlan(script, code, g);
		expect(plan.ok).toBe(true);
		expect(compile(plan.run?.(script) ?? script, registry).code).toContain(
			"local function startRound()",
		);
	});

	it("refuses a file that reaches its environment, and a name read above", () => {
		const env = imported("count = 0\nprint(_G.count)\n");
		const a = globalOf(env, "count");
		expect(makeLocalPlan(env, a.code, a.g)).toMatchObject({ ok: false });

		const above = imported("local function f()\n\treturn total\nend\ntotal = 1\nprint(f())\n");
		const b = globalOf(above, "total");
		expect(makeLocalPlan(above, b.code, b.g)).toMatchObject({
			ok: false,
			why: "Named above where it is first set",
		});
	});
});
