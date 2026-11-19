/**
 * Requires that start at `script` -- `require(script.Child)`,
 * `script.Parent.Sibling` -- offer what the module they land on exports, as
 * requires by a service's path always have. Where they land is read from the
 * requiring graph's own file, as Rojo lays files out.
 */

import { describe, expect, it } from "vitest";

import type { ExportedModuleFunction } from "../src/app/api.js";
import { relativeGraphs, requiredModules, setGraphPaths } from "../src/app/projectTypes.js";
import type { GraphNode } from "../src/core/schema.js";

const DIR = ".roswaal/scripts/ReplicatedStorage/Tank";

describe("where a require from script lands", () => {
	it("starts at a script with children's folder", () => {
		expect(relativeGraphs(`${DIR}/Config/init.nodescript`, "Defaults")).toEqual([
			`${DIR}/Config/Defaults.nodescript`,
			`${DIR}/Config/Defaults/init.nodescript`,
		]);
	});

	it("goes up a folder for each Parent", () => {
		expect(relativeGraphs(`${DIR}/Config/Defaults.nodescript`, "Parent")).toEqual([
			`${DIR}/Config.nodescript`,
			`${DIR}/Config/init.nodescript`,
		]);
		expect(relativeGraphs(`${DIR}/Rig.nodescript`, "Parent.Remotes")).toEqual([
			`${DIR}/Remotes.nodescript`,
			`${DIR}/Remotes/init.nodescript`,
		]);
	});
});

describe("what a require from script offers", () => {
	const fn = (graph: string, name: string): ExportedModuleFunction => ({
		graph,
		name,
		params: [],
		returns: [],
		location: { root: "ReplicatedStorage", path: "Tank.Config.Defaults", isModule: true },
	});
	const requireNode = (path: string): GraphNode => ({
		id: "req",
		def: "module.requirePath",
		x: 0,
		y: 0,
		literals: { root: { t: "string", v: "script" }, path: { t: "string", v: path } },
	});

	it("offers the child's functions to the script that holds it", () => {
		setGraphPaths(new Map([["config-graph", `${DIR}/Config/init.nodescript`]]));
		const found = requiredModules(
			{ id: "config-graph", nodes: [requireNode("Defaults")], modules: [] },
			[fn(`${DIR}/Config/Defaults.nodescript`, "tuning"), fn(`${DIR}/Rig.nodescript`, "build")],
		);
		expect(found.map((m) => [m.local, m.functions.map((f) => f.name)])).toEqual([
			["Defaults", ["tuning"]],
		]);
	});

	it("offers nothing for a graph whose file it does not know", () => {
		setGraphPaths(new Map());
		const found = requiredModules(
			{ id: "unknown", nodes: [requireNode("Defaults")], modules: [] },
			[fn(`${DIR}/Config/Defaults.nodescript`, "tuning")],
		);
		expect(found).toEqual([]);
	});
});
