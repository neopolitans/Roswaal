/**
 * Doc comments above declarations, as Moonwave and luau-lsp read them, and the
 * hover that shows them -- including on a table's functions in a file that
 * also has function expressions, which used to take hover down with it.
 */

import { describe, expect, it } from "vitest";

import { docCommentBefore, parseDoc } from "../src/core/luau/docComment.js";
import { hoverAt, withDocTypes } from "../src/core/luau/hover.js";
import { parseChunk } from "../src/core/luau/parser.js";
import { moduleExports } from "../src/core/luau/requires.js";
import { docRegistry } from "../src/core/luau/docComment.js";
import { membersInCode } from "../src/core/luau/infer.js";

const QUEUE = [
	"local Queue = {}",
	"Queue.prototype = {}",
	"",
	"--[=[",
	"\tMakes a queue holding the given items.",
	"",
	"\t```lua",
	"\tlocal q = Queue.from(1, 2)",
	"\t```",
	"",
	"\t@param ... any -- the first items",
	"\t@return Queue",
	"\t@within Queue",
	"]=]",
	"function Queue.from(...)",
	"\treturn setmetatable({ ... }, { __index = Queue.prototype })",
	"end",
	"",
	"Queue.of = Queue.from",
	"",
	"--- Runs `callback` on each item.",
	"--- @param callback? (item: any) -> () -- called once an item",
	"--- @yields",
	"function Queue.prototype:each(callback)",
	"\ttask.spawn(function()",
	"\t\tfor _, item in self do callback(item) end",
	"\tend)",
	"end",
	"",
	"-- Not documentation: a plain comment.",
	"local function helper(x)",
	"\treturn x",
	"end",
	"",
	"return Queue",
].join("\n");

const at = (needle: string, word: string, src = QUEUE) => {
	const i = src.indexOf(needle);
	expect(i).toBeGreaterThanOrEqual(0);
	return hoverAt(src, i + needle.indexOf(word) + 1, true);
};

describe("reading a doc comment", () => {
	it("takes the prose, the example and the tags from a block", () => {
		const doc = docCommentBefore(QUEUE, QUEUE.indexOf("function Queue.from"))!;
		expect(doc.text).toBe("Makes a queue holding the given items.\n\n```lua\nlocal q = Queue.from(1, 2)\n```");
		expect(doc.params).toEqual([{ name: "...", type: "any", description: "the first items" }]);
		expect(doc.returns).toEqual([{ type: "Queue" }]);
	});

	it("reads a run of --- lines", () => {
		const doc = docCommentBefore(QUEUE, QUEUE.indexOf("function Queue.prototype:each"))!;
		expect(doc.text).toBe("Runs `callback` on each item.");
		expect(doc.params[0]).toEqual({ name: "callback?", type: "(item: any) -> ()", description: "called once an item" });
		expect(doc.yields).toBe(true);
	});

	it("takes prose in plain comments, and leaves code switched off alone", () => {
		expect(docCommentBefore(QUEUE, QUEUE.indexOf("local function helper"))?.text).toBe("Not documentation: a plain comment.");
		const block = "--[[\n\tFired when a player's region changes.\n]]\nlocal changed = 1";
		expect(docCommentBefore(block, block.indexOf("local"))?.text).toBe("Fired when a player's region changes.");
		expect(docCommentBefore("-- local x = 1\nlocal y = 2", 15)).toBeUndefined();
		expect(docCommentBefore('--[[ print("off") ]]\nlocal y = 2', 21)).toBeUndefined();
		expect(docCommentBefore("--- about y\n\nlocal y = 1", 13)).toBeUndefined();
		expect(docCommentBefore("-- ------\nlocal y = 1", 10)).toBeUndefined();
	});

	it("keeps an @ inside a fenced example as code", () => {
		expect(parseDoc("```\n@param nope\n```").params).toEqual([]);
	});

	it("reads why something is deprecated", () => {
		expect(parseDoc("@deprecated v2 -- use Queue.from").deprecated).toBe("use Queue.from");
	});
});

describe("a table's functions", () => {
	it("are found in a file with function expressions in it", () => {
		expect(membersInCode(QUEUE, "Queue").map((m) => m.name)).toEqual(["prototype", "from", "of"]);
	});

	it("hover with their doc comment, and the types it gives", () => {
		const hover = at("function Queue.from", "from")!;
		expect(hover.code).toBe("Queue.from: (...: any) -> Queue");
		expect(hover.doc?.text).toContain("Makes a queue");
	});

	it("describe a field set to another of them as that one", () => {
		const hover = at("Queue.of =", "of")!;
		expect(hover).toMatchObject({ code: "Queue.of: (...: any) -> Queue", role: "function" });
		expect(hover.doc?.returns).toEqual([{ type: "Queue" }]);
	});

	it("include a method on a table inside the table", () => {
		const hover = at("function Queue.prototype:each", "each")!;
		expect(hover).toMatchObject({ code: "Queue.prototype:each: (callback: ((item: any) -> ())?) -> ()", role: "method" });
		expect(hover.doc?.yields).toBe(true);
	});
});

describe("a local's doc comment", () => {
	it("shows on the local", () => {
		const src = "--- Doubles it.\n--- @param n number\n--- @return number\nlocal function double(n)\n\treturn n * 2\nend\nprint(double(2))";
		const hover = hoverAt(src, src.lastIndexOf("double") + 1, true)!;
		expect(hover.code).toBe("double: (n: number) -> number");
		expect(hover.doc?.text).toBe("Doubles it.");
	});
});

describe("types from a doc comment", () => {
	it("never replace types the code writes", () => {
		expect(withDocTypes("(n: string) -> (boolean)", parseDoc("@param n number\n@return number"))).toBe("(n: string) -> (boolean)");
	});

	it("give several returns as a tuple", () => {
		expect(withDocTypes("() -> ()", parseDoc("@return boolean\n@return string"))).toBe("() -> (boolean, string)");
	});
});

describe("declarations the first sweep missed", () => {
	const hoverOn = (src: string, needle: string, word: string) =>
		hoverAt(src, src.indexOf(needle) + needle.indexOf(word) + 1, true);

	it("shows a local function's doc where it is declared", () => {
		const src = "--- Counts them.\nlocal function count(list)\n\treturn #list\nend";
		expect(hoverOn(src, "local function count", "count")?.doc?.text).toBe("Counts them.");
	});

	it("finds a local function whose parameters run onto the next lines", () => {
		const src = "--- Counts matches.\nlocal function count<T>(\n\tlist: { T },\n\tpredicate: (T) -> boolean\n): number\n\treturn 0\nend";
		const hover = hoverOn(src, "local function count", "count")!;
		expect(hover.code).toBe("count: (list: { T }, predicate: (T) -> boolean) -> (number)");
		expect(hover.doc?.text).toBe("Counts matches.");
	});

	it("describes a global function, where it is declared and where it is called", () => {
		const src = "--- Says hello.\n--- @return string\nfunction greet()\n\treturn \"hi\"\nend\nprint(greet())";
		expect(hoverOn(src, "function greet", "greet")).toMatchObject({ code: "greet: () -> string", role: "function" });
		expect(hoverAt(src, src.lastIndexOf("greet") + 1, true)?.doc?.text).toBe("Says hello.");
	});

	it("reads const function, and hovers it", () => {
		const src = "--- Ready.\nconst function onReady(instance: Instance)\nend";
		expect(parseChunk(src).errors).toEqual([]);
		expect(hoverOn(src, "onReady", "onReady")?.doc?.text).toBe("Ready.");
	});
});

describe("a comment about something else", () => {
	it("is not given to the declaration under it", () => {
		const src = "local Store = {}\n--[=[\n\t@class Store\n\tKeeps things.\n]=]\nfunction Store:init() end";
		expect(hoverAt(src, src.indexOf(":init") + 2, true)?.doc).toBeUndefined();
	});

	it("is given when @function names that declaration, and not when it names another", () => {
		const doc = (name: string) => `local Store = {}\n--[=[\n\t@function ${name}\n\t@within Store\n\tOpens it.\n]=]\nfunction Store.open() end`;
		expect(hoverAt(doc("open"), doc("open").indexOf(".open") + 2, true)?.doc?.text).toBe("Opens it.");
		expect(hoverAt(doc("close"), doc("close").indexOf(".open") + 2, true)?.doc).toBeUndefined();
	});
});

describe("plain comments as documentation", () => {
	it("documents a field set on a table, from a --[[ ]] block", () => {
		const src = "local Region = {}\n\n--[[\n\tFired when a player's region changes.\n\n\tSends Player and Region (string)\n]]\nRegion.Changed = Signal.new()\nRegion.Changed:Fire()";
		const hover = hoverAt(src, src.lastIndexOf("Changed") + 1, true)!;
		expect(hover.doc?.text).toBe("Fired when a player's region changes.\n\nSends Player and Region (string)");
	});

	it("reads a run of -- lines, with a bare -- as a paragraph break", () => {
		const src = "-- Detects the character.\n--\n-- Returns nil for anything else.\nlocal function detect(part) end";
		expect(docCommentBefore(src, src.indexOf("local"))?.text).toBe("Detects the character.\n\nReturns nil for anything else.");
	});

	it("gives a forward-declared local the comment above the function that defines it", () => {
		const src = "local Clean: (obj: any) -> ()\n\n--[[\n\tCleans it up.\n]]\nfunction Clean(obj)\nend\nClean(1)";
		expect(hoverAt(src, src.lastIndexOf("Clean") + 1, true)?.doc?.text).toBe("Cleans it up.");
	});

	it("finds a local called from inside a callback passed to a call", () => {
		const src = "-- Tries again.\nlocal function retry(n)\n\ttask.spawn(function()\n\t\tretry(n - 1)\n\tend)\nend";
		expect(hoverAt(src, src.lastIndexOf("retry") + 1, true)?.doc?.text).toBe("Tries again.");
	});
});

describe("Moonwave comments that name what they are about", () => {
	const LIB = [
		"--[=[",
		"\t@class Crate",
		"",
		"\tHolds things.",
		"]=]",
		"local Crate = {",
		"\tShelf = require(script.Shelf),",
		"}",
		"",
		"--- @prop Shelf Shelf",
		"--- @within Crate",
		"",
		"--[=[",
		"\t@within Crate",
		"\t@interface Lid",
		"\t.Open boolean -- whether it is",
		"\t.Close (Lid) -> ()",
		"",
		"\tThe top of a crate.",
		"]=]",
		"",
		"--[=[",
		"\t@return Lid",
		"]=]",
		"function Crate.lid() end",
		"",
		"return Crate",
	].join("\n");

	it("take a type named with a bracket in it as a name, not a pattern", () => {
		const src = ["--- @type Foo[ string", "", "--[=[", "\t@return Foo[", "]=]", "local function make() end"].join("\n");
		const hover = hoverAt(src, src.indexOf("make") + 1, true);
		expect(hover?.doc?.related?.map((r) => r.name)).toEqual(["Foo["]);
	});

	it("are read wherever they stand, by name", () => {
		expect(docRegistry(LIB).map((e) => `${e.tag} ${e.name}${e.within ? ` in ${e.within}` : ""}`))
			.toEqual(["class Crate", "prop Shelf in Crate", "interface Lid in Crate"]);
	});

	it("describe a module by its @class and a field by its @prop", () => {
		const exports = moduleExports(LIB);
		expect(exports.doc?.text).toBe("Holds things.");
		const shelf = exports.members.find((m) => m.name === "Shelf")!;
		expect(shelf.doc?.subject).toEqual({ tag: "prop", name: "Shelf", type: "Shelf" });
	});

	it("give the local its @class, and the field its @prop's type", () => {
		expect(hoverAt(LIB, LIB.indexOf("local Crate") + 7, true)?.doc?.text).toBe("Holds things.");
		const use = `${LIB}\nprint(Crate.Shelf)`;
		expect(hoverAt(use, use.lastIndexOf("Shelf") + 1, true)?.code).toBe("Crate.Shelf: Shelf");
	});

	it("give a key written in the table the same, where it is written", () => {
		const hover = hoverAt(LIB, LIB.indexOf("\tShelf = ") + 2, true)!;
		expect(hover).toMatchObject({ code: "Crate.Shelf: Shelf", role: "field" });
		expect(hover.doc?.subject).toEqual({ tag: "prop", name: "Shelf", type: "Shelf" });
	});

	it("describe a key of a table no name holds by the comment above it", () => {
		const src = "print({\n\t-- How many.\n\tcount = 3,\n})";
		expect(hoverAt(src, src.indexOf("count") + 1, true)).toMatchObject({ code: "count: number", role: "field", doc: { text: "How many." } });
	});

	it("list an @interface's fields where a return names it", () => {
		const hover = hoverAt(LIB, LIB.indexOf("Crate.lid") + 7, true)!;
		expect(hover.doc?.related).toEqual([{
			name: "Lid",
			text: "The top of a crate.",
			fields: [{ name: "Open", type: "boolean", description: "whether it is" }, { name: "Close", type: "(Lid) -> ()" }],
		}]);
		expect(hoverAt(LIB, LIB.indexOf("@return Lid") + 9, true)).toMatchObject({ code: "type Lid", role: "interface" });
	});
});
