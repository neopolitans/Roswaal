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

describe("Require at Top", () => {
	/** A graph that requires something and prints it, so the value is used. */
	const requiring = (specifier: string, as?: string) => {
		const b = new Builder();
		const start = b.node("script.begin");
		const req = b.node("module.requireTop");
		b.lit(req, "specifier", { t: "string", v: specifier });
		if (as !== undefined) b.lit(req, "as", { t: "string", v: as });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(req, "exports", print, "value");
		return { ...b.build(), target: "lune" as const };
	};

	it("writes the specifier verbatim", () => {
		expect(body(requiring("@lune/fs"))).toContain('require("@lune/fs")');
	});

	/**
	 * The default name is the specifier's last segment. It was `lastSegment`,
	 * which splits on dots because it was written for instance paths -- so
	 * `@lune/fs` came out as `lune_fs`: readable, and not what anybody would
	 * have typed.
	 */
	it("names the local after the last part of the specifier", () => {
		const named = (specifier: string) =>
			body(requiring(specifier)).match(/local (\w+) = require/)?.[1];

		expect(named("@lune/fs")).toBe("fs");
		expect(named("@lune/roblox")).toBe("roblox");
		expect(named("./util/strings")).toBe("strings");
		expect(named("@game/ReplicatedStorage/Combat")).toBe("Combat");
		// A file extension is not a name.
		expect(named("../shared/config.luau")).toBe("config");
	});

	it("takes the name you give it over the one it would guess", () => {
		expect(body(requiring("@lune/fs", "filesystem"))).toContain("local filesystem = require");
	});

	/** Requiring is idempotent, so two nodes asking for one module get one local. */
	it("writes one require however many nodes ask for the module", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("module.requireTop");
		const second = b.node("module.requireTop");
		b.lit(first, "specifier", { t: "string", v: "@lune/fs" });
		b.lit(second, "specifier", { t: "string", v: "@lune/fs" });
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(first, "exports", a, "value");
		b.link(second, "exports", c, "value");

		const out = body({ ...b.build(), target: "lune" });
		expect(out.match(/require\(/g)).toHaveLength(1);
	});

	it("says so when it has nothing to require", () => {
		const out = compile(requiring("   "), registry, {});
		expect(out.diagnostics.map((d) => d.message).join(" "))
			.toContain("Require at Top has no module to require");
	});
});

describe("Get Module", () => {
	const using = (moduleId: string, modules: ScriptModule[]) => {
		const b = new Builder();
		const start = b.node("script.begin");
		const get = b.node("module.get", { config: { module: moduleId, name: "fs" } });
		const print = b.node("debug.print");
		b.link(start, "then", print, "in");
		b.link(get, "exports", print, "value");
		return { ...b.build(), target: "lune" as const, modules };
	};

	const fs: ScriptModule = { id: "m1", name: "fs", specifier: "@lune/fs" };

	/** It resolves rather than requires: the declaration is what writes one. */
	it("reads the local the declaration was bound to", () => {
		const out = body(using("m1", [fs]));
		expect(out).toContain('local fs = require("@lune/fs")');
		expect(out).toContain("print(fs)");
		expect(out.match(/require\(/g)).toHaveLength(1);
	});

	/**
	 * A pill pointing at a declaration somebody deleted. It names the module
	 * and says where to fix it, rather than compiling to `nil` in silence.
	 */
	it("says so when the declaration is gone", () => {
		const out = compile(using("m1", []), registry, {});
		const said = out.diagnostics.map((d) => d.message).join(" ");
		expect(said).toContain("fs");
		expect(said).toContain("Variables panel");
	});

	it("says so when no module was chosen", () => {
		const out = compile(using("", [fs]), registry, {});
		expect(out.diagnostics.map((d) => d.message).join(" ")).toContain("no module chosen");
	});
});

/**
 * Overriding the local a module binds to.
 *
 * Two modules genuinely can want one name. `./combat/util` and
 * `./inventory/util` is a shape real projects have — arguably a bad one, and
 * commoner than it ought to be — so the name has to be the author's to set.
 */
describe("naming a module yourself", () => {
	const declaring = (modules: ScriptModule[]) => compile(withModules(modules), registry, {});
	const said = (modules: ScriptModule[]) =>
		declaring(modules).diagnostics.map((d) => `${d.severity}: ${d.message}`).join(" | ");

	it("binds each to the name it was given", () => {
		const out = body(withModules([
			{ id: "a", name: "combatUtil", specifier: "./combat/util" },
			{ id: "b", name: "inventoryUtil", specifier: "./inventory/util" },
		]));
		expect(out).toContain('local combatUtil = require("./combat/util")');
		expect(out).toContain('local inventoryUtil = require("./inventory/util")');
		expect(said([
			{ id: "a", name: "combatUtil", specifier: "./combat/util" },
			{ id: "b", name: "inventoryUtil", specifier: "./inventory/util" },
		])).toBe("");
	});

	/**
	 * A chosen name is taken verbatim, never made unique.
	 *
	 * `uniqueForFile` answers a different question. Asked for `util` twice it
	 * hands back `util` and `util2`; asked for `table` it hands back `table2`.
	 * Both silently, and both leaving the panel saying one name while the file
	 * says another — which is the mismatch that costs an afternoon.
	 */
	it("does not quietly rename a name you chose", () => {
		const out = body(withModules([{ id: "a", name: "util", specifier: "./combat/util" }]));
		expect(out).toContain("local util = ");
		expect(out).not.toContain("util2");
	});

	it("says so when two modules want the same name", () => {
		const problem = said([
			{ id: "a", name: "util", specifier: "./combat/util" },
			{ id: "b", name: "util", specifier: "./inventory/util" },
		]);
		expect(problem).toContain("error");
		expect(problem).toContain('"util"');
		// Both specifiers, so you know which two to tell apart.
		expect(problem).toContain("./combat/util");
		expect(problem).toContain("./inventory/util");
	});

	/**
	 * Shadowing a global is allowed — binding `Vector3` off `@lune/roblox` is
	 * the point of that whole mechanism — but it is worth saying, because
	 * naming a module `table` breaks `table.insert` for the rest of the file.
	 */
	it("warns rather than refuses when a name shadows a global", () => {
		const problem = said([{ id: "a", name: "table", specifier: "./util/table" }]);
		expect(problem).toContain("warning");
		expect(problem).toContain("shadows");
		// And it still binds what was asked for.
		expect(body(withModules([{ id: "a", name: "table", specifier: "./util/table" }])))
			.toContain('local table = require("./util/table")');
	});

	it("falls back to the specifier when no name was given", () => {
		expect(body(withModules([{ id: "a", name: "  ", specifier: "@lune/fs" }])))
			.toContain("local fs = require");
	});

	/** The same rule on the node: `As` is a choice, the default is not. */
	it("takes Require at Top's As verbatim and makes its default unique", () => {
		const b = new Builder();
		const start = b.node("script.begin");
		const first = b.node("module.requireTop");
		const second = b.node("module.requireTop");
		b.lit(first, "specifier", { t: "string", v: "./combat/util" });
		b.lit(second, "specifier", { t: "string", v: "./inventory/util" });
		b.lit(second, "as", { t: "string", v: "inventoryUtil" });
		const a = b.node("debug.print");
		const c = b.node("debug.print");
		b.link(start, "then", a, "in");
		b.link(a, "then", c, "in");
		b.link(first, "exports", a, "value");
		b.link(second, "exports", c, "value");

		const out = body({ ...b.build(), target: "lune" });
		// The derived one keeps the plain name; the chosen one is exactly what
		// was typed.
		expect(out).toContain('local util = require("./combat/util")');
		expect(out).toContain('local inventoryUtil = require("./inventory/util")');
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
