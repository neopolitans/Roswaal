import { describe, expect, it } from "vitest";
import { analyseProject, cycleMessage } from "../src/app/analysis.js";
import { loadRequires } from "../src/core/luau/requires.js";
import { requireCycles } from "../src/core/requireCycles.js";

const edges = (pairs: Record<string, string[]>) => new Map(Object.entries(pairs));

describe("requireCycles", () => {
	it("finds nothing in a tree of requires", () => {
		expect(requireCycles(edges({ a: ["b", "c"], b: ["c"], c: [] }))).toEqual([]);
	});

	it("names a two-module ring from its first file", () => {
		expect(requireCycles(edges({ b: ["a"], a: ["b"] }))).toEqual([["a", "b", "a"]]);
	});

	it("follows a longer ring in require order", () => {
		expect(requireCycles(edges({ a: ["b"], b: ["c"], c: ["a"], d: ["a"] }))).toEqual([
			["a", "b", "c", "a"],
		]);
	});

	it("reports a module that requires itself", () => {
		expect(requireCycles(edges({ a: ["a"], b: [] }))).toEqual([["a", "a"]]);
	});

	it("gives one ring per tangle, the shortest way round", () => {
		const rings = requireCycles(
			edges({ a: ["b", "x"], b: ["c"], c: ["a"], x: ["a"], p: ["q"], q: ["p"] }),
		);
		expect(rings).toEqual([
			["a", "x", "a"],
			["p", "q", "p"],
		]);
	});

	it("walks a long chain without overflowing", () => {
		const long = new Map<string, string[]>();
		for (let i = 0; i < 20000; i++) long.set(`m${i}`, [`m${i + 1}`]);
		long.set("m20000", ["m0"]);
		const rings = requireCycles(long);
		expect(rings).toHaveLength(1);
		expect(rings[0]).toHaveLength(20002);
	});
});

describe("loadRequires", () => {
	it("keeps the requires that run as the module loads", () => {
		const src = [
			'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
			"local Rig = require(ReplicatedStorage.Tank.Rig)",
			"if true then",
			"\tlocal Config = require(script.Parent.Config)",
			"end",
			"local function later()",
			"\treturn require(script.Parent.Occupancy)",
			"end",
			"return { later = later }",
		].join("\n");
		expect(loadRequires(src)).toEqual([
			{ kind: "instance", from: "game", names: ["ReplicatedStorage", "Tank", "Rig"] },
			{ kind: "instance", from: "script", names: ["..", "Config"] },
		]);
	});

	it("leaves out requires in function expressions and types", () => {
		const src = [
			"type Rig = typeof(require(script.Rig))",
			"local M = {}",
			"M.load = function() return require(script.Later) end",
			'local Greeter = require("./Greeter")',
			"return M",
		].join("\n");
		expect(loadRequires(src)).toEqual([{ kind: "string", spec: "./Greeter" }]);
	});
});

describe("cycle lines in Script analysis", () => {
	const graphs = {
		"src/ReplicatedStorage/Tank/Rig.luau": ".roswaal/scripts/ReplicatedStorage/Tank/Rig.nodescript",
		"src/ReplicatedStorage/Tank/Occupancy.luau":
			".roswaal/scripts/ReplicatedStorage/Tank/Occupancy.nodescript",
	};

	it("names graphs by graph and hand-written files by file", () => {
		expect(
			cycleMessage({
				files: [
					"src/ReplicatedStorage/Tank/Occupancy.luau",
					"src/ReplicatedStorage/Tank/Rig.luau",
					"src/ReplicatedStorage/Util/init.luau",
					"src/ReplicatedStorage/Tank/Occupancy.luau",
				],
				graphs,
			}),
		).toMatch(/^Occupancy → Rig → Util → Occupancy require each other as they load/);
	});

	it("counts each ring as a warning in the project scope", () => {
		const analysis = analyseProject({
			outcomes: [],
			mapOutcomes: [],
			orphans: [],
			unsynced: [],
			cycles: [
				{
					files: [
						"src/ReplicatedStorage/Tank/Occupancy.luau",
						"src/ReplicatedStorage/Tank/Rig.luau",
						"src/ReplicatedStorage/Tank/Occupancy.luau",
					],
					graphs,
				},
			],
			packErrors: [],
			edited: new Set(),
		});
		expect(analysis.files.map((f) => f.label)).toEqual(["cycle"]);
		expect(analysis.counts).toEqual({ errors: 0, warnings: 1 });
	});
});
