/**
 * The Roblox demo page, and the project it is drawn from.
 *
 * `examples/demo` is the project the introduction panel offers to take a copy
 * of, so the page and the copy have to be the same thing.
 * `scripts/build-roblox-demos.mjs` generates the page's data from the project,
 * which only helps if somebody runs it: a graph edited in the demo and never
 * regenerated leaves the page describing the version before — and describing a
 * different version of what a reader is about to copy is worse than having no
 * page at all.
 *
 * So the two are compared here. The failure message is the fix: run the script.
 *
 * The graphs are also compiled, for the reason the Lune demos are. The page
 * shows the Luau underneath each picture, and that is only worth anything if
 * the compiling is checked.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { compileNodeMap } from "../src/core/nodemap.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { ROBLOX_DEMO_GRAPHS, ROBLOX_DEMO_MAP } from "../src/core/docs/robloxDemos.js";

const registry = createRegistry();
const project = new URL("../examples/demo/.roswaal/scripts/", import.meta.url);

const onDisk = (rel: string): unknown =>
	JSON.parse(readFileSync(new URL(rel, project), "utf8"));

/** Where each of the page's graphs lives in the project. */
const GRAPHS: Array<[string, string]> = [
	["greeter", "ReplicatedStorage/Shared/Greeter.nodescript"],
	["main", "ServerScriptService/Source/Main.nodescript"],
];

describe("the Roblox demo page is drawn from the project", () => {
	it.each(GRAPHS)("%s is the graph on disk", (id, rel) => {
		expect(ROBLOX_DEMO_GRAPHS[id]).toEqual(onDisk(rel));
	});

	it("draws the map the project ships", () => {
		expect(ROBLOX_DEMO_MAP).toEqual(onDisk("Game.nodemap"));
	});

	it("is a Roblox project, which is the point of the page", () => {
		for (const [id] of GRAPHS) expect([id, ROBLOX_DEMO_GRAPHS[id].target]).toEqual([id, "roblox"]);
		expect(ROBLOX_DEMO_MAP.target ?? "roblox").toBe("roblox");
	});
});

describe("what the page shows underneath each picture", () => {
	it.each(GRAPHS)("%s compiles with no errors", (id) => {
		const result = compile(ROBLOX_DEMO_GRAPHS[id], registry);
		expect(result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message))
			.toEqual([]);
	});

	it.each(GRAPHS)("%s writes something", (id) => {
		expect(compile(ROBLOX_DEMO_GRAPHS[id], registry).code.trim()).not.toBe("");
	});

	/**
	 * The two script kinds the page is about. A ModuleScript hands something
	 * back and a Script runs, and the file each becomes is the difference the
	 * page opens by explaining.
	 */
	it("shows one of each kind", () => {
		expect(ROBLOX_DEMO_GRAPHS.greeter.scriptClass).toBe("ModuleScript");
		expect(ROBLOX_DEMO_GRAPHS.main.scriptClass).toBe("Script");
	});

	it("compiles the map to a project file with nothing wrong in it", () => {
		const built = compileNodeMap(ROBLOX_DEMO_MAP);
		expect(built.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(built.json).toContain("\"tree\"");
	});

	/**
	 * The rule the Modules page states, checked on the one graph here that
	 * requires anything: what a generated file requires is what somebody placed
	 * in the graph, and never something the compiler decided to add.
	 */
	it("requires nothing the graph did not ask for", () => {
		const code = compile(ROBLOX_DEMO_GRAPHS.main, registry).code;
		const requires = [...code.matchAll(/require\(/g)];
		const nodes = ROBLOX_DEMO_GRAPHS.main.nodes.filter(
			(node) => node.def === "module.requirePath" || node.def === "module.require",
		);
		expect(requires).toHaveLength(nodes.length);
	});
});
