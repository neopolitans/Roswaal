/**
 * The rule that decides which generated file gets deleted when a graph moves.
 *
 * Renaming a graph, dragging it to another folder, or switching it between
 * Script and ModuleScript all change where it compiles to. Before this, the old
 * `.luau` stayed exactly where it was: Rojo went on syncing it, and the game
 * ended up with two copies of the module, one of them maintained by nothing.
 *
 * **The consequence of this rule is a deleted file**, which is why it is a pure
 * function taking the generated index rather than something that reads a
 * directory. Every case below is one somebody hit or could hit, and the ones
 * that must *not* delete matter more than the ones that must.
 *
 * The index it takes maps a generated file to the id of the graph whose header
 * claims it — `-- roswaal-graph: <id>`, written into the file by the compiler.
 * The id survives renaming, moving and reclassing, which is exactly why it is
 * the thing to match on rather than the path or the graph's name.
 */

import { describe, expect, it } from "vitest";

import { supersededOutputs } from "../src/server/project.js";

const ME = "graph-config";
const SOMEONE_ELSE = "graph-rig";

const index = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("what a graph leaves behind when it moves", () => {
	it("names the file it used to write", () => {
		const stale = supersededOutputs(
			index({
				"src/Config.server.luau": ME,
				"src/ReplicatedStorage/Tank/Config.server.luau": ME,
			}),
			ME,
			"src/ReplicatedStorage/Tank/Config.server.luau",
		);
		expect(stale).toEqual(["src/Config.server.luau"]);
	});

	/** Reclassing changes the suffix and nothing else. */
	it("catches a Script that became a ModuleScript", () => {
		const stale = supersededOutputs(
			index({ "src/Tank/Config.server.luau": ME, "src/Tank/Config.luau": ME }),
			ME,
			"src/Tank/Config.luau",
		);
		expect(stale).toEqual(["src/Tank/Config.server.luau"]);
	});

	it("catches more than one, for a graph that has moved twice", () => {
		const stale = supersededOutputs(
			index({
				"src/Config.server.luau": ME,
				"src/Tank/Config.server.luau": ME,
				"src/Tank/Config.luau": ME,
			}),
			ME,
			"src/Tank/Config.luau",
		);
		expect(stale).toEqual(["src/Config.server.luau", "src/Tank/Config.server.luau"]);
	});
});

/**
 * The half that matters more. A rule that deletes too much here deletes
 * somebody's working code, and it does it during an ordinary save.
 */
describe("what it must never touch", () => {
	it("leaves the file the graph just wrote", () => {
		const here = "src/Tank/Config.luau";
		expect(supersededOutputs(index({ [here]: ME }), ME, here)).toEqual([]);
	});

	it("leaves another graph's output alone, wherever it sits", () => {
		const stale = supersededOutputs(
			index({
				"src/Tank/Rig.luau": SOMEONE_ELSE,
				"src/Rig.luau": SOMEONE_ELSE,
				"src/Tank/Config.luau": ME,
			}),
			ME,
			"src/Tank/Config.luau",
		);
		expect(stale).toEqual([]);
	});

	/**
	 * The index only ever holds files carrying a `roswaal-graph` header, so
	 * hand-written Luau is not in it to begin with — but the rule should be
	 * unable to reach it even if it were passed one.
	 */
	it("has nothing to say about a file no graph claims", () => {
		const stale = supersededOutputs(
			index({ "src/Tank/HandWritten.luau": "", "src/Tank/Config.luau": ME }),
			ME,
			"src/Tank/Config.luau",
		);
		expect(stale).toEqual([]);
	});

	it("does nothing on the first compile of a new graph", () => {
		expect(supersededOutputs(index({}), ME, "src/Tank/Config.luau")).toEqual([]);
	});

	/**
	 * Two graphs that both compile to the same path is a real situation — it is
	 * what `outputCollision` exists for — and it must not turn into one of them
	 * deleting the other's file as a side effect.
	 */
	it("does not resolve a collision by deleting the other graph's file", () => {
		const shared = "src/Tank/Config.luau";
		expect(supersededOutputs(index({ [shared]: SOMEONE_ELSE }), ME, shared)).toEqual([]);
	});
});
