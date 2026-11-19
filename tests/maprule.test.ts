import { describe, expect, it } from "vitest";

import { mapFigure, mapPanelHtml } from "../src/core/docs/mapFigure.js";
import {
	landingOf,
	mapAt,
	newFolderFor,
	passThrough,
	renameByRule,
	ruleExceptions,
	ruleLanding,
	rulePath,
	rulePaths,
	syncedFolderOf,
	syncHere,
	trailOf,
} from "../src/core/mapRule.js";
import {
	compileNodeMap,
	emptyMap,
	type MapNode,
	mapNodeMove,
	type NodeMap,
} from "../src/core/nodemap.js";

const node = (
	id: string,
	name: string,
	extra: Partial<MapNode> = {},
	children: MapNode[] = [],
): MapNode => ({
	id,
	name,
	children,
	...extra,
});

/** M103's Tank map, as its file has it. */
function tank(): NodeMap {
	return {
		schemaVersion: 1,
		kind: "map",
		id: "tank",
		name: "m103-graph",
		output: "default.project.json",
		root: node("dm", "DataModel", { className: "DataModel" }, [
			node("rs", "ReplicatedStorage", {}, [
				node("tank", "Tank", { className: "Folder", path: "src/ReplicatedStorage/Tank" }),
			]),
			node("sss", "ServerScriptService", { path: "src/ServerScriptService" }),
			node("sp", "StarterPlayer", {}, [
				node("sps", "StarterPlayerScripts", { path: "src/StarterPlayer/StarterPlayerScripts" }),
			]),
		]),
	};
}

describe("the reading rule", () => {
	it("gives an instance the folder its names spell under the output folder", () => {
		expect(rulePath("src", ["ReplicatedStorage", "Tank"])).toBe("src/ReplicatedStorage/Tank");
		expect(rulePath("src/", [])).toBe("src");
	});

	it("also accepts the folders Rojo's template and Wally name", () => {
		expect(rulePaths("src", ["ReplicatedStorage"])).toEqual([
			"src/ReplicatedStorage",
			"src/shared",
		]);
		expect(rulePaths("src", ["StarterPlayer", "StarterPlayerScripts"])).toContain("src/client");
		expect(rulePaths("src", ["ReplicatedStorage", "Packages"])).toContain("Packages");
	});

	it("reads a folder back to where it lands", () => {
		expect(ruleLanding("src", "src/ReplicatedStorage/Tank")).toEqual(["ReplicatedStorage", "Tank"]);
		expect(ruleLanding("src", "src/shared/Util")).toEqual(["ReplicatedStorage", "Util"]);
		expect(ruleLanding("src", "src/client")).toEqual(["StarterPlayer", "StarterPlayerScripts"]);
		expect(ruleLanding("src", "Packages")).toEqual(["ReplicatedStorage", "Packages"]);
	});

	it("says nothing for a folder named for no service", () => {
		expect(ruleLanding("src", "src/Stuff")).toBeNull();
		expect(ruleLanding("src", "src")).toBeNull();
		expect(ruleLanding("src", "assets/ReplicatedStorage")).toBeNull();
	});

	it("finds no exception in a map that follows it", () => {
		expect(ruleExceptions(tank(), "src")).toEqual([]);
	});

	it("names a mapping whose folder it would not have given", () => {
		const map = tank();
		map.root.children[1].path = "src/server-code";
		expect(ruleExceptions(map, "src")).toEqual([
			{
				node: "sss",
				name: "ServerScriptService",
				trail: ["ServerScriptService"],
				path: "src/server-code",
				expected: "src/ServerScriptService",
			},
		]);
	});

	it("counts the first map shape as one exception, and a new map's as none", () => {
		let n = 0;
		const id = () => `n${n++}`;
		expect(ruleExceptions(emptyMap("Game", "g", id), "src")).toHaveLength(1);
		expect(ruleExceptions(emptyMap("Game", "g", id, "src"), "src")).toEqual([]);
		expect(compileNodeMap(emptyMap("Game", "g", id, "src")).ok).toBe(true);
	});
});

describe("where folders land under a map", () => {
	it("lands a folder inside a synced one beneath it", () => {
		expect(landingOf(tank(), "src/ReplicatedStorage/Tank/Signals")).toEqual([
			"ReplicatedStorage",
			"Tank",
			"Signals",
		]);
		expect(landingOf(tank(), "src/ServerScriptService")).toEqual(["ServerScriptService"]);
	});

	it("lands nothing no mapping reaches", () => {
		expect(landingOf(tank(), "src/ReplicatedStorage")).toBeNull();
		expect(landingOf(tank(), "src/Workspace/Map")).toBeNull();
	});

	it("knows the folder each node's contents come from", () => {
		expect(syncedFolderOf(tank(), "tank")).toBe("src/ReplicatedStorage/Tank");
		expect(syncedFolderOf(tank(), "rs")).toBeUndefined();
		expect(trailOf(tank(), "sps")).toEqual(["StarterPlayer", "StarterPlayerScripts"]);
	});
});

describe("adding a folder", () => {
	it("makes a folder on disk under a node something syncs", () => {
		expect(newFolderFor(tank(), "src", "tank", "Signals")).toEqual({
			kind: "disk",
			path: "src/ReplicatedStorage/Tank/Signals",
		});
	});

	it("makes a mapping with the rule's folder anywhere else", () => {
		expect(newFolderFor(tank(), "src", "rs", "Shared")).toEqual({
			kind: "map",
			path: "src/ReplicatedStorage/Shared",
		});
		expect(newFolderFor(tank(), "src", "dm", "Workspace")).toEqual({
			kind: "map",
			path: "src/Workspace",
		});
	});
});

describe("renaming and mapping by the rule", () => {
	it("moves the folder the rule gave a node, with what is under it", () => {
		const map = tank();
		map.root.children[0].children[0].children = [
			node("sig", "Signals", { className: "Folder", path: "src/ReplicatedStorage/Tank/Signals" }),
		];
		const root = renameByRule(map, "src", "tank", "Vehicle");
		const vehicle = root.children[0].children[0];
		expect(vehicle.name).toBe("Vehicle");
		expect(vehicle.path).toBe("src/ReplicatedStorage/Vehicle");
		expect(vehicle.children[0].path).toBe("src/ReplicatedStorage/Vehicle/Signals");
	});

	it("leaves an exception's folder where the author put it", () => {
		const map = tank();
		map.root.children[0].children[0].path = "src/vehicles";
		const root = renameByRule(map, "src", "tank", "Vehicle");
		expect(root.children[0].children[0].path).toBe("src/vehicles");
	});

	it("makes the mappings down to a folder the rule places", () => {
		let n = 0;
		const map = tank();
		const made = mapAt(map.root, ["Workspace", "Map"], "src/Workspace/Map", () => `new${n++}`);
		const workspace = made.root.children.find((c) => c.name === "Workspace");
		expect(workspace?.className).toBeUndefined();
		expect(workspace?.children[0]).toMatchObject({
			name: "Map",
			className: "Folder",
			path: "src/Workspace/Map",
		});
		expect(made.id).toBe(workspace?.children[0].id);
	});

	it("reuses a node already there", () => {
		const map = tank();
		const made = mapAt(map.root, ["ReplicatedStorage"], "src/ReplicatedStorage", () => "x");
		expect(made.id).toBe("rs");
		expect(made.root.children[0].path).toBe("src/ReplicatedStorage");
		expect(made.root.children[0].children[0].id).toBe("tank");
	});
});

describe("syncing a node, or passing through", () => {
	it("gives a node its rule folder and folds in what only named a folder inside it", () => {
		const root = syncHere(tank(), "src", "rs");
		const rs = root.children[0];
		expect(rs.path).toBe("src/ReplicatedStorage");
		expect(rs.children).toEqual([]);
	});

	it("keeps what says more than a folder would", () => {
		const map = tank();
		map.root.children[0].children[0].className = "Model";
		map.root.children[0].children.push(
			node("far", "Far", { className: "Folder", path: "assets/Far" }),
		);
		const rs = syncHere(map, "src", "rs").children[0];
		expect(rs.children.map((c) => c.id)).toEqual(["tank", "far"]);
	});

	it("folds in a folder with no path whose own children can go", () => {
		const map = tank();
		map.root.children[2].children = [
			node("sps", "StarterPlayerScripts", { className: "Folder" }, [
				node("ui", "UI", {
					className: "Folder",
					path: "src/StarterPlayer/StarterPlayerScripts/UI",
				}),
			]),
		];
		expect(syncHere(map, "src", "sp").children[2].children).toEqual([]);
	});

	it("maps each folder inside on its own when a node stops syncing", () => {
		let n = 0;
		const root = passThrough(tank(), "sss", ["Source", "Combat"], () => `p${n++}`);
		const sss = root.children[1];
		expect(sss.path).toBeUndefined();
		expect(sss.children.map((c) => [c.name, c.path])).toEqual([
			["Source", "src/ServerScriptService/Source"],
			["Combat", "src/ServerScriptService/Combat"],
		]);
	});

	it("adds nothing for a node that synced nothing", () => {
		const root = passThrough(tank(), "rs", ["Other"], () => "x");
		expect(root.children[0].children.map((c) => c.id)).toEqual(["tank"]);
	});
});

describe("moving a node", () => {
	it("moves before, after and inside", () => {
		const map = tank();
		const after = mapNodeMove(map.root, "sp", "rs", "before");
		expect(after.children.map((c) => c.id)).toEqual(["sp", "rs", "sss"]);
		const inside = mapNodeMove(map.root, "sss", "rs", "inside");
		expect(inside.children[0].children.map((c) => c.id)).toEqual(["tank", "sss"]);
		const last = mapNodeMove(map.root, "rs", "sp", "after");
		expect(last.children.map((c) => c.id)).toEqual(["sss", "sp", "rs"]);
	});

	it("will not move a node into itself, or the root", () => {
		const map = tank();
		expect(mapNodeMove(map.root, "sp", "sps", "inside")).toBe(map.root);
		expect(mapNodeMove(map.root, "dm", "rs", "inside")).toBe(map.root);
		expect(mapNodeMove(map.root, "rs", "rs", "after")).toBe(map.root);
	});
});

describe("the docs' drawing of the editor", () => {
	it("draws the tree, Instance, This map and the project file, with the hooks its script fills", () => {
		const html = mapPanelHtml(mapFigure(tank()));
		for (const hook of [
			'class="map-card map-tree"',
			"map-docs-side",
			"map-docs-foot",
			"data-map-heading",
			'data-map-field="name"',
			'data-map-field="class"',
			'data-map-field="path"',
			'data-map-field="ignoreUnknown"',
			'data-map-list="ignorePaths"',
			"Follows the reading rule",
		]) {
			expect(html).toContain(hook);
		}
	});

	it("counts the exceptions it draws", () => {
		const map = tank();
		map.root.children[1].path = "src/server-code";
		expect(mapFigure(map).exceptions).toBe(1);
		expect(mapPanelHtml(mapFigure(map))).toContain("1 exception to the reading rule");
	});
});
