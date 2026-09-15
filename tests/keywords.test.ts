/**
 * Luau spelt in the search box.
 *
 * The table names node ids, so the risk it carries is a renamed node leaving an
 * entry pointing at nothing — a keyword that silently stops answering. Every id
 * is held against the registry here, which is the check the table cannot do for
 * itself.
 */

import { describe, expect, it } from "vitest";

import { LUAU_KEYWORDS, keywordNodes } from "../src/core/keywords.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { score } from "../src/app/NodeMenu.jsx";

const registry = createRegistry();

describe("the keyword table", () => {
	it("names nodes that exist", () => {
		for (const [keyword, ids] of Object.entries(LUAU_KEYWORDS)) {
			expect(ids.length, keyword).toBeGreaterThan(0);
			for (const id of ids) expect(registry.get(id), `${keyword} -> ${id}`).toBeDefined();
		}
	});

	it("answers the logic words with the pills that write them", () => {
		expect(keywordNodes("and")).toEqual(["logic.and"]);
		expect(keywordNodes("or")).toEqual(["logic.or"]);
		expect(keywordNodes("not")).toEqual(["logic.not"]);
		expect(keywordNodes("==")).toEqual(["compare.eq"]);
	});

	/** Typed as `if`, `elseif` or `else`, it is the same node either way. */
	it("sends the whole if-chain to Branch", () => {
		for (const word of ["if", "then", "else", "elseif"]) {
			expect(keywordNodes(word), word).toEqual(["flow.branch"]);
		}
	});

	it("is case-insensitive and ignores surrounding space", () => {
		expect(keywordNodes("  NOT  ")).toEqual(["logic.not"]);
	});

	it("says nothing about a word that is not Luau", () => {
		for (const word of ["loop", "compare", "check", "branch", ""]) {
			expect(keywordNodes(word), word).toEqual([]);
		}
	});
});

/**
 * The ranking the palette applies, exercised through the same `score` the menu
 * uses. The menu is a component and this is the part of it worth a test: which
 * node is top of the list for a given query is the whole of the feature.
 */
describe("what the palette puts first", () => {
	const items = [...registry.values()].map((def) => ({
		key: def.id,
		title: def.title,
		category: def.category,
		color: "",
		pure: def.pure === true,
		def,
	}));

	const top = (query: string, count = 3) =>
		items
			.map((item) => ({ item, score: score(item, query.toLowerCase()) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, count)
			.map((x) => x.item.def.id);

	it("answers a logic word with its own node", () => {
		expect(top("and")[0]).toBe("logic.and");
		expect(top("or")[0]).toBe("logic.or");
		// The one that was wrong: Not Equal is declared first and starts with the
		// same three letters, so it won on a prefix match.
		expect(top("not")[0]).toBe("logic.not");
	});

	it("answers an operator symbol", () => {
		expect(top("==")[0]).toBe("compare.eq");
		expect(top("~=")[0]).toBe("compare.neq");
		expect(top("..")[0]).toBe("string.concat");
		expect(top("::")[0]).toBe("cast.as");
	});

	it("answers if with Branch, and for with the loops in order", () => {
		expect(top("if")[0]).toBe("flow.branch");
		expect(top("for", 3)).toEqual(["flow.forRange", "flow.forEach", "flow.forIndex"]);
	});

	/** A title typed in full is not an ambiguous question. */
	it("prefers an exact title to a longer one that starts the same", () => {
		expect(top("print")[0]).toBe("debug.print");
		expect(top("branch")[0]).toBe("flow.branch");
	});

	it("leaves an ordinary query ranking as it did", () => {
		expect(top("vector3")[0]).toBe("roblox.vector3");
	});
});
