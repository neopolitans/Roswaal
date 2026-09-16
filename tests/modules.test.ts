/**
 * The modules a script declares, and the requires they compile to.
 *
 * `NodeScript.modules` is **the** place a require can come from. That is the
 * whole of the rule the Lune work is built on — a generated file people read
 * and commit does not get to grow imports nobody chose — and it is kept by
 * there being exactly one source, rather than by everybody remembering.
 *
 * So the tests here are mostly about placement and naming: that a require lands
 * where a hand-written file would put it, and that the name a declaration asks
 * for is the name it gets.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { emptyScript, type NodeScript, type ScriptModule } from "../src/core/schema.js";
import { migrateScript } from "../src/core/migrate.js";
import { Builder } from "./helpers.js";

const registry = createRegistry();

/** A script that declares the given modules and does nothing else. */
function withModules(modules: ScriptModule[], target: "roblox" | "lune" = "lune"): NodeScript {
	const script = emptyScript("Demo", "demo");
	return {
		...script,
		target,
		modules,
		nodes: [{ id: "n1", def: "script.begin", x: 0, y: 0 }],
	};
}

/** The generated file with its header stripped, which is what a reader sees. */
const body = (script: NodeScript) =>
	compile(script, registry, {}).code.split("\n").filter((l) => !l.startsWith("--")).join("\n").trim();

describe("a declared module", () => {
	it("compiles to a require at the top", () => {
		expect(body(withModules([{ id: "m1", name: "fs", specifier: "@lune/fs" }])))
			.toBe('local fs = require("@lune/fs")');
	});

	it("takes the name the declaration asks for", () => {
		const out = body(withModules([
			{ id: "m1", name: "filesystem", specifier: "@lune/fs" },
		]));
		expect(out).toContain("local filesystem = require");
	});

	it("keeps the specifier exactly as written", () => {
		for (const specifier of ["@lune/fs", "./util/strings", "../shared/config", "@game/ReplicatedStorage/Combat"]) {
			expect(body(withModules([{ id: "m", name: "m", specifier }])))
				.toContain(`require(${JSON.stringify(specifier)})`);
		}
	});

	it("declares them in the order they were written", () => {
		const out = body(withModules([
			{ id: "a", name: "fs", specifier: "@lune/fs" },
			{ id: "b", name: "net", specifier: "@lune/net" },
			{ id: "c", name: "process", specifier: "@lune/process" },
		]));
		expect(out.split("\n").map((l) => l.match(/local (\w+)/)?.[1])).toEqual(["fs", "net", "process"]);
	});

	/** An empty specifier is a declaration somebody started and did not finish. */
	it("writes nothing for a declaration with no specifier", () => {
		expect(body(withModules([{ id: "m", name: "fs", specifier: "   " }]))).toBe("");
	});
});

describe("members pulled off a module", () => {
	/**
	 * Lune's own idiom: `local roblox = require("@lune/roblox")` and then
	 * `local Instance = roblox.Instance`. Bound beneath the require, in order.
	 */
	it("binds each one under the module it came from", () => {
		expect(body(withModules([
			{ id: "m", name: "roblox", specifier: "@lune/roblox", members: ["Instance", "Vector3"] },
		]))).toBe([
			'local roblox = require("@lune/roblox")',
			"local Instance = roblox.Instance",
			"local Vector3 = roblox.Vector3",
		].join("\n"));
	});

	/**
	 * The one that matters, and the one that did not work first time.
	 *
	 * The emitter reserves the Roblox globals so a *generated* local cannot
	 * shadow them, and `Vector3` bound off `@lune/roblox` came out as
	 * `Vector32` — which defeats the entire mechanism, since the point of
	 * binding it is that `Vector3.new(1, 2, 3)` then compiles unchanged.
	 *
	 * Shadowing is intentional here. A binding somebody wrote down is not the
	 * accident that rule guards against.
	 */
	it("lets a member shadow the global it is named after", () => {
		const out = body(withModules([
			{ id: "m", name: "roblox", specifier: "@lune/roblox", members: ["Vector3", "CFrame", "Instance"] },
		]));
		expect(out).toContain("local Vector3 = roblox.Vector3");
		expect(out).toContain("local CFrame = roblox.CFrame");
		expect(out).toContain("local Instance = roblox.Instance");
		expect(out).not.toMatch(/Vector3\d/);
		expect(out).not.toMatch(/CFrame\d/);
	});

	it("ignores a blank member rather than binding nothing", () => {
		expect(body(withModules([
			{ id: "m", name: "roblox", specifier: "@lune/roblox", members: ["", "  ", "Vector3"] },
		]))).toBe([
			'local roblox = require("@lune/roblox")',
			"local Vector3 = roblox.Vector3",
		].join("\n"));
	});
});

describe("where the requires go", () => {
	/**
	 * Below the services, because a required module's path often starts at one
	 * and Luau reads a file top to bottom — which is also where a hand-written
	 * Roblox file puts them.
	 */
	it("goes under the GetService calls", () => {
		// A service is only hoisted if something uses it, so this prints one
		// rather than declaring one and hoping.
		const b = new Builder();
		const start = b.node("script.begin");
		const service = b.node("roblox.getService");
		b.lit(service, "service", { t: "string", v: "Players" });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(service, "service", print, "value");

		const out = body({
			...b.build(),
			target: "roblox",
			modules: [{ id: "m", name: "combat", specifier: "@game/ReplicatedStorage/Combat" }],
		});

		const locals = out.split("\n").filter((l) => l.startsWith("local "));
		const hoistedService = locals.findIndex((l) => l.includes("game:GetService"));
		const hoistedRequire = locals.findIndex((l) => l.includes("require("));
		expect(hoistedService, "no service hoisted").toBeGreaterThan(-1);
		expect(hoistedRequire, "no require hoisted").toBeGreaterThan(-1);
		expect(hoistedRequire).toBeGreaterThan(hoistedService);
	});
});

describe("a graph written before modules existed", () => {
	/**
	 * `modules` arrived at 0.63.0. A file without it must open, not throw, and
	 * must not gain anything it did not have.
	 */
	it("opens with no modules rather than failing", () => {
		const old = emptyScript("Old", "old") as NodeScript & { modules?: unknown };
		delete old.modules;
		const migrated = migrateScript(old as NodeScript, registry);
		expect(migrated.script.modules).toEqual([]);
	});

	it("compiles to exactly what it did before", () => {
		const script = withModules([]);
		expect(body(script)).toBe("");
	});
});
