/**
 * Doc comments above declarations, as Moonwave and luau-lsp read them, and the
 * hover that shows them -- including on a table's functions in a file that
 * also has function expressions, which used to take hover down with it.
 */

import { describe, expect, it } from "vitest";

import { docCommentBefore, parseDoc } from "../src/core/luau/docComment.js";
import { hoverAt, withDocTypes } from "../src/core/luau/hover.js";
import { parseChunk } from "../src/core/luau/parser.js";
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

	it("leaves plain comments, --[[ blocks and comments a blank line away alone", () => {
		expect(docCommentBefore(QUEUE, QUEUE.indexOf("local function helper"))).toBeUndefined();
		expect(docCommentBefore("--[[ off ]]\nlocal x = 1", 12)).toBeUndefined();
		expect(docCommentBefore("--- about y\n\nlocal y = 1", 13)).toBeUndefined();
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
