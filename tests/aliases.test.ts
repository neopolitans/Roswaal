/**
 * Other names a node is found by.
 *
 * The same risk the keyword table carries — a renamed node leaving an entry
 * that silently stops answering — and the same check against the registry.
 * Then the ranking, through both searches' own `score`, since an alias that
 * outranks the title it stands in for would be worse than no alias.
 */

import { describe, expect, it } from "vitest";

import { NODE_ALIASES, aliasScore } from "../src/core/aliases.js";
import { createRegistry } from "../src/core/nodes/index.js";
import { classify } from "../src/core/nodes/runtimes.js";
import { score as menuScore } from "../src/app/NodeMenu.jsx";
import { score as pickerScore } from "../src/app/NodePicker.jsx";

const registry = createRegistry();

describe("the alias table", () => {
	it("names nodes that exist", () => {
		for (const id of Object.keys(NODE_ALIASES)) {
			expect(registry.get(id), id).toBeDefined();
		}
	});

	it("gives no node its own title as an alias", () => {
		for (const [id, aliases] of Object.entries(NODE_ALIASES)) {
			const title = registry.get(id)!.title.toLowerCase();
			for (const alias of aliases) expect(alias.toLowerCase(), id).not.toBe(title);
		}
	});

	it("scores exact, then prefix, then substring", () => {
		expect(aliasScore("function.entry", "define function")).toBe(450);
		expect(aliasScore("function.entry", "define")).toBe(90);
		expect(aliasScore("function.entry", "hoisted")).toBe(90);
		expect(aliasScore("function.entry", "at top")).toBe(55);
		expect(aliasScore("function.entry", "banana")).toBe(0);
	});
});

const library = [...registry.values()];

/** Ids at the top of both searches, which must agree. */
function top(query: string, count: number): { menu: string[]; picker: string[] } {
	const q = query.toLowerCase();
	const rank = (scored: { id: string; score: number }[]) =>
		scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, count).map((x) => x.id);
	return {
		menu: rank(library.map((def) => ({
			id: def.id,
			score: menuScore({
				key: def.id, title: def.title, category: def.category, color: "",
				pure: def.pure === true, runtime: classify(def), def,
			}, q),
		}))),
		picker: rank(library.map((def) => ({
			id: def.id,
			score: pickerScore({
				key: def.id, title: def.title, category: def.category, def, filter: classify(def),
			}, q),
		}))),
	};
}

describe("searching by an alias", () => {
	it("finds both function nodes for Define Function, in either search", () => {
		for (const ids of Object.values(top("Define Function", 2))) {
			expect([...ids].sort()).toEqual(["function.declareHere", "function.entry"]);
		}
	});

	it("finds the hoisted one for Declare Function at Top", () => {
		const { menu, picker } = top("Declare Function at Top", 1);
		expect(menu).toEqual(["function.entry"]);
		expect(picker).toEqual(["function.entry"]);
	});

	it("finds the type nodes by their old name", () => {
		expect(top("Define Type", 1).menu).toEqual(["type.declareHere"]);
	});

	/** An alias stands in for a name; it never beats the name it stands in for. */
	it("leaves a real title ahead of an alias", () => {
		// "Remove Instance" is Destroy's alias; Remove is Table's own title.
		expect(top("Remove", 1).menu).toEqual(["table.remove"]);
		// "Declare Function" is a title, and a prefix of Function's alias.
		expect(top("Declare Function", 1).menu).toEqual(["function.declareHere"]);
	});

	it("does not reach a preset, whose title is a name somebody chose", () => {
		const def = registry.get("function.entry")!;
		expect(menuScore({
			key: "preset", title: "greet", category: def.category, color: "",
			pure: false, runtime: "graph", def,
		}, "define function")).toBe(0);
		expect(pickerScore({
			key: "preset", title: "greet", category: def.category, def, filter: "graph",
		}, "define function")).toBe(0);
	});
});
