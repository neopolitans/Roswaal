/**
 * A file's comments, imported (0.174.0).
 *
 * The comments above a statement become a comment box around its nodes, and
 * one at the end of its line joins them. Compiled with comments on, each box's
 * text is written back above the statement, in the form the file wrote it: a
 * run of `--` lines, a `---` doc comment or a `--[=[ ]=]` doc block. A comment
 * with nothing after it, at the end of a block, has nothing to be drawn around
 * and is reported as left out.
 */

import { describe, expect, it } from "vitest";

import { commentLines } from "../src/core/comments.js";
import { compile } from "../src/core/compiler/index.js";
import { viewOf } from "../src/core/functionGraph.js";
import { graphNameOf, importLuau } from "../src/core/import/fromLuau.js";
import { nodeBounds } from "../src/core/nodeBox.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();

function imported(src: string, file = "Test.server.luau") {
	const { name, scriptClass } = graphNameOf(file);
	const result = importLuau(src, { name, scriptClass, target: "roblox", idPrefix: "t" });
	if (!result.ok) throw new Error(result.error);
	return result;
}

/** The compiled file below its generated banner. */
function body(src: string): string {
	const { code } = compile(imported(src).script, registry, { comments: true });
	return code.replace(/^[\s\S]*?-- roswaal-output: \w+\n\n/, "");
}

const SAMPLE = `-- Greets the player
local Players = game:GetService("Players")

--- How many greetings went out
local count = 0

-- When someone joins
-- say hello
Players.PlayerAdded:Connect(function(player)
\t-- bump the tally
\tcount += 1 -- one more
\tprint("Hello", player.Name)
\t-- nothing after this
end)

--[=[
\tSays goodbye.
]=]
local function bye()
\twarn("bye")
end
bye() -- call it
`;

describe("comments in an imported file", () => {
	it("come back above what they described, in the form the file wrote", () => {
		expect(body(SAMPLE)).toBe(
			[
				"-- Greets the player",
				'local Players = game:GetService("Players")',
				"",
				"--- How many greetings went out",
				"local count = 0",
				"",
				"-- When someone joins",
				"-- say hello",
				"Players.PlayerAdded:Connect(function(player)",
				"\t-- bump the tally",
				"\t-- one more",
				"\tcount += 1",
				'\tprint("Hello", player.Name)',
				"end)",
				"",
				"--[=[",
				"\tSays goodbye.",
				"]=]",
				"local function bye()",
				'\twarn("bye")',
				"end",
				"",
				"-- call it",
				"bye()",
				"",
			].join("\n"),
		);
	});

	it("are counted: drawn, moved from a line's end, and left out", () => {
		expect(imported(SAMPLE).report.comments).toEqual({ kept: 6, moved: 2, dropped: 1 });
	});

	it("leave the --! lines to the file's own header", () => {
		const out = imported("--!strict\nlocal a = 1\n");
		expect(out.script.comments).toEqual([]);
		expect(out.report.comments).toEqual({ kept: 0, moved: 0, dropped: 0 });
	});

	it("inside a statement kept as code stay in its code, not counted as left out", () => {
		const out = imported("local a, b = 1, 2 -- pair\nrepeat\n\t-- spin\n\ta += 1\nuntil a > 3\n");
		expect(out.report.comments.dropped).toBe(0);
		expect(body("repeat\n\t-- spin\n\tx = 1\nuntil true\n")).toContain("\t-- spin\n");
	});

	it("are boxes holding their statement's nodes and nothing else", () => {
		const { script } = imported(SAMPLE);
		const graphs = [
			null,
			...script.nodes.filter((n) => n.def === "function.declareHere").map((n) => n.id),
		];
		for (const graph of graphs) {
			const nodes = viewOf(script, graph).nodes.map((n) => nodeBounds(n, registry, true));
			for (const box of script.comments.filter((c) => (c.graph ?? null) === graph)) {
				for (const n of nodes) {
					const crosses =
						n.x < box.x + box.w && box.x < n.x + n.w && n.y < box.y + box.h && box.y < n.y + n.h;
					const inside =
						n.x >= box.x &&
						n.y >= box.y &&
						n.x + n.w <= box.x + box.w &&
						n.y + n.h <= box.y + box.h;
					expect(!crosses || inside).toBe(true);
				}
			}
		}
		expect(script.comments.map((c) => c.text)).toContain("When someone joins\nsay hello");
	});
});

describe("a comment's header style", () => {
	it("writes a -- line each, a --- line each, or a doc block", () => {
		expect(commentLines("one\ntwo", "lines")).toEqual(["-- one", "-- two"]);
		expect(commentLines("one\ntwo", "doc")).toEqual(["--- one", "--- two"]);
		expect(commentLines("one\n\ntwo", "docBlock")).toEqual(["--[=[", "\tone", "", "\ttwo", "]=]"]);
	});

	it("is the default without one: a -- line, or a block for more", () => {
		expect(commentLines("one")).toEqual(["-- one"]);
		expect(commentLines("one\ntwo")[0]).toBe("--[[");
	});
});
