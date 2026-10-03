/**
 * The node palette's search, without the menu around it.
 *
 * What is listed while browsing and while searching, the order the headings
 * come in, and the presets a graph contributes.
 */

import { describe, expect, it } from "vitest";

import {
	buildPresets, flattenGroups, groupMenu, libraryItems, searchMenu, type MenuItem,
	type MenuSources,
} from "../src/app/menuSearch.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();

function sources(items: MenuItem[]): MenuSources {
	return { items, services: [], lune: [], names: [], draggedService: [], draggedMembers: [] };
}

describe("searching the palette", () => {
	const presets = buildPresets({ variables: [{ id: "v1", name: "health", type: "number" }], nodes: [] });
	const items = libraryItems(registry, "roblox", presets);

	it("browses everything but the deep entries", () => {
		const deep = { ...items[0], key: "deep", deep: true };
		const browsed = searchMenu("", sources([deep, ...items]), undefined);
		expect(browsed.some((item) => item.key === "deep")).toBe(false);
		expect(browsed).toHaveLength(items.length);
	});

	it("finds a preset by the name it was given, ahead of the generic node", () => {
		const found = searchMenu("get health", sources(items), undefined);
		expect(found[0].title).toBe("Get health");
	});

	it("answers a Luau keyword with the node that writes it", () => {
		const found = searchMenu("not", sources(items), undefined);
		expect(found[0].def.id).toBe("logic.not");
	});

	it("matches nothing for nonsense", () => {
		expect(searchMenu("zzzqqq", sources(items), undefined)).toEqual([]);
	});
});

describe("grouping the matches", () => {
	const items = libraryItems(registry, "roblox", []);

	it("keeps the library's category order while browsing", () => {
		const groups = groupMenu(items, { registry, searching: false });
		const order = groups.map((g) => g.category);
		expect(order).toEqual([...order].filter((c, i) => order.indexOf(c) === i));
		expect(flattenGroups(groups)).toHaveLength(items.length);
	});

	it("puts the category of the best match first while searching", () => {
		const matches = searchMenu("not", sources(items), undefined);
		const groups = groupMenu(matches, { registry, searching: true });
		expect(groups[0].category).toBe(matches[0].category);
	});

	it("leads with the service a wire was dragged off", () => {
		const def = items[0].def;
		const service = { ...items[0], key: "svc", category: "RunService", def };
		const groups = groupMenu([...items.slice(1, 5), service], {
			registry, searching: true, service: "RunService",
		});
		expect(groups[0].category).toBe("RunService");
	});
});

describe("presets", () => {
	it("names a parameter by its owner when two owners share it", () => {
		const handler = (id: string, name?: string) => ({
			id, def: "event.connect", config: { ...(name ? { name } : {}), params: [{ name: "character" }] },
		});
		const presets = buildPresets({ variables: [], nodes: [handler("a", "added"), handler("b")] });
		const params = presets.filter((p) => p.defId === "function.getParam").map((p) => p.title);
		expect(params).toEqual(["Get character (added)", "Get character (handler)"]);
	});

	it("offers a function's parameters only inside that function", () => {
		const fn = { id: "f", def: "function.entry", config: { name: "show", params: [{ name: "who" }] } };
		const params = (graph: string | null) =>
			buildPresets({ variables: [], nodes: [fn] }, graph)
				.filter((p) => p.defId === "function.getParam")
				.map((p) => p.title);
		expect(params(null)).toEqual([]);
		expect(params("f")).toEqual(["Get who"]);
	});

	it("offers a Get and a Set per variable", () => {
		const presets = buildPresets({ variables: [{ id: "v", name: "hp", type: "number" }], nodes: [] });
		expect(presets.map((p) => p.title)).toEqual(["Get hp", "Set hp"]);
	});
});
