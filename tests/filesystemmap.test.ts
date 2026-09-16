/**
 * Maps that are not a DataModel.
 *
 * A map has always answered "where does this file end up", and had one way of
 * answering because there was one runtime: a DataModel, services, and a
 * `default.project.json` for Rojo. A Lune program has no DataModel — it has
 * directories and files, and where a file ends up is where it is.
 *
 * So the value of a Lune map is the part Rojo was doing incidentally: **saying
 * the layout out loud and checking it holds together**. The checks below are
 * require-time errors in Luau rather than preferences, which is why they are
 * errors here — finding out from a map, with the two things named, beats
 * finding out from a stack trace.
 */

import { describe, expect, it } from "vitest";

import {
	compileNodeMap, emptyFilesystemMap, emptyMap, isFilesystemMap, type MapNode, type NodeMap,
} from "../src/core/nodemap.js";

let n = 0;
const makeId = () => `n${n++}`;

const dir = (name: string, children: MapNode[] = []): MapNode =>
	({ id: makeId(), name, children });
const file = (name: string): MapNode => ({ id: makeId(), name, file: true, children: [] });

const mapOf = (children: MapNode[]): NodeMap => ({
	...emptyFilesystemMap("Program", "m", makeId),
	root: { id: makeId(), name: ".", children },
});

const errors = (map: NodeMap) =>
	compileNodeMap(map).diagnostics.filter((one) => one.severity === "error").map((one) => one.message);

describe("which kind of map it is", () => {
	it("is a DataModel unless it says otherwise", () => {
		expect(isFilesystemMap(emptyMap("Game", "g", makeId))).toBe(false);
		expect(emptyMap("Game", "g", makeId).target).toBeUndefined();
	});

	it("is a filesystem when its target is Lune", () => {
		expect(isFilesystemMap(emptyFilesystemMap("Program", "p", makeId))).toBe(true);
	});

	/**
	 * Rojo's project file answers a question a Lune program does not ask, so
	 * there is nothing to write — and writing an empty one would put a file in
	 * the repository that means nothing.
	 */
	it("writes no project file", () => {
		const built = compileNodeMap(emptyFilesystemMap("Program", "p", makeId));
		expect(built.json).toBe("");
		expect(built.outputPath).toBe("");
		expect(built.ok).toBe(true);
	});

	it("still writes one for a DataModel map", () => {
		const built = compileNodeMap(emptyMap("Game", "g", makeId));
		expect(built.outputPath).toBe("default.project.json");
		expect(built.json).toContain("\"tree\"");
	});
});

describe("a layout Luau would refuse", () => {
	/**
	 * The one the plan singled out. `require("./foo")` cannot mean both
	 * `foo.luau` and `foo/init.luau`, and Luau refuses an ambiguous path rather
	 * than picking one — so this is an error and not a warning.
	 */
	it("catches a file beside a directory of the same name", () => {
		const found = errors(mapOf([file("foo"), dir("foo")]));
		expect(found).toHaveLength(1);
		expect(found[0]).toContain("both a file and a directory");
	});

	it("catches it in either order", () => {
		expect(errors(mapOf([dir("foo"), file("foo")]))).toHaveLength(1);
	});

	/** `foo.luau` and `foo.lua` both answer to `./foo`. */
	it("catches two files that differ only by extension", () => {
		const found = errors(mapOf([file("foo.luau"), file("foo.lua")]));
		expect(found).toHaveLength(1);
		expect(found[0]).toContain("cannot say which");
	});

	it("catches two directories of one name", () => {
		expect(errors(mapOf([dir("lib"), dir("lib")]))).toHaveLength(1);
	});

	it("refuses a name a require cannot reach", () => {
		const found = errors(mapOf([file("my/file")]));
		expect(found[0]).toContain("not a name a require can reach");
	});

	it("refuses children inside a file", () => {
		const found = errors(mapOf([{ id: makeId(), name: "main", file: true, children: [dir("x")] }]));
		expect(found[0]).toContain("nothing can be inside it");
	});

	/** A layout that is fine says nothing, which is most of them. */
	it("is quiet about a layout that works", () => {
		expect(errors(mapOf([
			file("main"),
			dir("lib", [file("init"), file("util")]),
			dir("tests", [file("util")]),
		]))).toEqual([]);
	});

	/** The same name in two different directories is two different requires. */
	it("allows one name in two places", () => {
		expect(errors(mapOf([dir("a", [file("thing")]), dir("b", [file("thing")])]))).toEqual([]);
	});

	it("checks all the way down", () => {
		const deep = mapOf([dir("a", [dir("b", [file("c"), dir("c")])])]);
		expect(errors(deep)).toHaveLength(1);
	});
});

/**
 * The extension is not part of the name.
 *
 * A warning and not an error: `main.luau` is the file you meant and the file
 * you get. It is worth saying because the name is the *stem*, so typing the
 * extension is how somebody ends up wondering why the map shows `main.luau`
 * and the disk has `main.luau.luau`.
 */
describe("a name that carries its own extension", () => {
	const warnings = (map: NodeMap) =>
		compileNodeMap(map).diagnostics
			.filter((one) => one.severity === "warning")
			.map((one) => one.message);

	it("says the extension is not needed, and what to call it instead", () => {
		const found = warnings(mapOf([file("main.luau")]));
		expect(found).toHaveLength(1);
		expect(found[0]).toContain("does not need the .luau");
		expect(found[0]).toContain('Call it "main"');
	});

	it("says it for .lua too", () => {
		expect(warnings(mapOf([file("old.lua")]))[0]).toContain("does not need the .lua");
	});

	/** Not an error: the file is still the one that was meant. */
	it("does not refuse it", () => {
		expect(errors(mapOf([file("main.luau")]))).toEqual([]);
	});

	/** A directory called `lua` is a directory called `lua`. */
	it("leaves a directory alone", () => {
		expect(warnings(mapOf([dir("lua")]))).toEqual([]);
	});

	it("says nothing about a name without one", () => {
		expect(warnings(mapOf([file("main"), dir("lib")]))).toEqual([]);
	});
});
