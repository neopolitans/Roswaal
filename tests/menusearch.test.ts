/**
 * The node palette's search, without the menu around it.
 *
 * What is listed while browsing and while searching, the order the headings
 * come in, and the presets a graph contributes.
 */

import { describe, expect, it } from "vitest";

import {
	buildPresets,
	flattenGroups,
	groupMenu,
	libraryItems,
	type MenuItem,
	type MenuSources,
	searchMenu,
} from "../src/app/menuSearch.js";
import { createRegistry } from "../src/core/nodes/index.js";

const registry = createRegistry();

function sources(items: MenuItem[]): MenuSources {
	return { items, services: [], lune: [], names: [], draggedService: [], draggedMembers: [] };
}

describe("searching the palette", () => {
	const presets = buildPresets({
		variables: [{ id: "v1", name: "health", type: "number" }],
		nodes: [],
	});
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
			registry,
			searching: true,
			service: "RunService",
		});
		expect(groups[0].category).toBe("RunService");
	});
});

describe("presets", () => {
	it("names a parameter by its owner when two owners share it", () => {
		const handler = (id: string, name?: string) => ({
			id,
			def: "event.connect",
			config: { ...(name ? { name } : {}), params: [{ name: "character" }] },
		});
		const presets = buildPresets({ variables: [], nodes: [handler("a", "added"), handler("b")] });
		const params = presets.filter((p) => p.defId === "function.getParam").map((p) => p.title);
		expect(params).toEqual(["Get character (added)", "Get character (handler)"]);
	});

	it("offers a function's parameters only inside that function", () => {
		const fn = {
			id: "f",
			def: "function.entry",
			config: { name: "show", params: [{ name: "who" }] },
		};
		const params = (graph: string | null) =>
			buildPresets({ variables: [], nodes: [fn] }, graph)
				.filter((p) => p.defId === "function.getParam")
				.map((p) => p.title);
		expect(params(null)).toEqual([]);
		expect(params("f")).toEqual(["Get who"]);
	});

	it("offers a Get and a Set per variable", () => {
		const presets = buildPresets({
			variables: [{ id: "v", name: "hp", type: "number" }],
			nodes: [],
		});
		expect(presets.map((p) => p.title)).toEqual(["Get hp", "Set hp"]);
	});
});

/**
 * Off a pin, the thing itself before its members.
 *
 * Typing `wea` with a wire from an Instance input listed `weapon.Archivable`
 * and five more members above `Get weapon`: a member's title starts with the
 * query and the getter's only contains it, and the members' own types were
 * never checked against the wire.
 */
describe("a wire asking for a value", async () => {
	const { buildPresets, libraryItems, searchMenu } = await import("../src/app/menuSearch.js");
	const { memberPresets } = await import("../src/app/memberPresets.js");
	const { createRegistry: makeRegistry } = await import("../src/core/nodes/index.js");
	const { Builder } = await import("./helpers.js");

	const registry = makeRegistry();
	const b = new Builder();
	const local = b.node("local.declare", { config: { type: "Instance" } });
	b.lit(local, "name", { t: "string", v: "weapon" });
	const script = b.build();
	const base = buildPresets(script, null, registry);
	const presets = [...base, ...memberPresets(base, script, registry, [])];
	const items = libraryItems(registry, "roblox", presets);
	const from = {
		ref: { node: "need", pin: "a0" },
		side: "in" as const,
		pin: { id: "a0", name: "parent", kind: "data" as const, type: "Instance" },
	};
	const results = searchMenu(
		"wea",
		{ items, services: [], lune: [], names: [], draggedService: [], draggedMembers: [] },
		from,
	).map((item) => item.title);

	it("offers the getter first", () => {
		expect(results[0]).toBe("Get weapon");
	});

	it("leaves out members the pin cannot take", () => {
		expect(results).not.toContain("weapon.Archivable");
		expect(results).not.toContain("weapon.Name");
		expect(results).toContain("weapon.Parent");
	});
});
