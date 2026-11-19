/**
 * A node map as a graph: where its nodes sit, what the file keeps of them,
 * and moving one under another.
 */

import { describe, expect, it } from "vitest";

import {
	alignMap,
	autoLayout,
	MAP_NODE,
	mapNodeHeight,
	mapPins,
	mapPositions,
	realignMap,
} from "../src/core/mapLayout.js";
import { moveByRule, movedIn } from "../src/core/mapRule.js";
import {
	compileNodeMap,
	findMapNode,
	isModelFile,
	type MapNode,
	type NodeMap,
	serialiseMap,
} from "../src/core/nodemap.js";
import { projectToMap } from "../src/core/rojoImport.js";

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

/** A place the layout gave, failing the test where it gave none. */
function must(
	at: ReadonlyMap<string, { x: number; y: number }>,
	id: string,
): { x: number; y: number } {
	const found = at.get(id);
	if (!found) throw new Error(`no place for ${id}`);
	return found;
}

/** M103's Tank map. */
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

describe("laying a map out", () => {
	it("puts each level in a column, leaves one under another, parents in the middle", () => {
		const at = autoLayout(tank());
		const column = MAP_NODE.width + MAP_NODE.columnGap;
		expect(at.get("dm")?.x).toBe(0);
		expect(at.get("rs")?.x).toBe(column);
		expect(at.get("tank")?.x).toBe(column * 2);
		expect(at.get("rs")?.y).toBe(at.get("tank")?.y);
		expect(must(at, "sss").y).toBeGreaterThan(must(at, "tank").y);
		expect(must(at, "sps").y).toBeGreaterThan(must(at, "sss").y);
		expect(at.get("dm")?.y).toBe((must(at, "rs").y + must(at, "sp").y) / 2);
	});

	it("keeps a node's own place, and puts one without beside its parent", () => {
		const map = tank();
		map.root.children[0].pos = { x: 1000, y: 500 };
		const at = mapPositions(map);
		expect(at.get("rs")).toEqual({ x: 1000, y: 500 });
		const laid = autoLayout(map);
		expect(at.get("tank")).toEqual({
			x: 1000 + must(laid, "tank").x - must(laid, "rs").x,
			y: 500 + must(laid, "tank").y - must(laid, "rs").y,
		});
	});

	it("gives every node the layout's place on Realign", () => {
		const root = realignMap(tank());
		expect(root.pos).toEqual({ x: 0, y: must(autoLayout(tank()), "dm").y });
		expect(root.children[0].children[0].pos).toEqual(autoLayout(tank()).get("tank"));
	});

	it("draws nodes the canvas's size, with pins at the header's middle", () => {
		expect(mapNodeHeight(true)).toBe(66);
		expect(mapNodeHeight(false)).toBe(90);
		expect(mapPins({ x: 0, y: 0 })).toEqual({ in: { x: -11, y: 15 }, out: { x: 263, y: 15 } });
	});
});

describe("what the file keeps", () => {
	it("keeps places, optional paths and comments, and the project file sees none but the path", () => {
		const map = tank();
		map.root.children[0].children[0].pos = { x: 600.4, y: 10 };
		map.root.children[1].optional = true;
		map.comments = [
			{
				id: "c1",
				x: 0,
				y: -40,
				w: 300,
				h: 120,
				color: "#5f8f6a",
				title: "Shared",
				note: "Both sides.",
			},
		];
		const saved = JSON.parse(serialiseMap(map));
		expect(saved.comments[0].title).toBe("Shared");
		expect(saved.root.children[0].children[0].pos).toEqual({ x: 600, y: 10 });
		expect(saved.root.children[1].optional).toBe(true);
		const project = JSON.parse(compileNodeMap(map).json);
		expect(project.tree.ServerScriptService.$path).toEqual({ optional: "src/ServerScriptService" });
		expect(JSON.stringify(project)).not.toContain("Shared");
		expect(JSON.stringify(project)).not.toContain("pos");
	});

	it("reads Rojo's optional path back as an optional path", () => {
		const project = {
			name: "Game",
			tree: { $className: "DataModel", ServerScriptService: { $path: { optional: "src/server" } } },
		};
		let n = 0;
		const imported = projectToMap(project, {
			output: "default.project.json",
			fallbackName: "Game",
			makeId: () => `n${n++}`,
		});
		const sss = imported.map.root.children[0];
		expect(sss.path).toBe("src/server");
		expect(sss.optional).toBe(true);
		expect(JSON.parse(compileNodeMap(imported.map).json).tree).toEqual(project.tree);
	});
});

describe("moving a node under another", () => {
	it("moves it, and the folders the rule gave it go with it", () => {
		const root = moveByRule(tank(), "src", "tank", "sp");
		const moved = root.children[2].children[1];
		expect(moved.id).toBe("tank");
		expect(moved.path).toBe("src/StarterPlayer/Tank");
		expect(root.children[0].children).toEqual([]);
	});

	it("folds a plain folder into a parent that syncs its folder, as Sync does", () => {
		const map = tank();
		expect(movedIn(map, "src", "tank", "sss")).toEqual({
			folded: true,
			path: "src/ServerScriptService/Tank",
		});
		const root = moveByRule(map, "src", "tank", "sss");
		expect(findMapNode(root, "tank")).toBeNull();
		expect(root.children[1].children).toEqual([]);
	});

	it("leaves an exception's folder where it is, and keeps its entry", () => {
		const map = tank();
		map.root.children[0].children[0].path = "assets/Tank";
		expect(movedIn(map, "src", "tank", "sss")?.folded).toBe(false);
		const root = moveByRule(map, "src", "tank", "sss");
		expect(root.children[1].children[0].path).toBe("assets/Tank");
	});

	it("will not move the root, into itself, or where it already is", () => {
		const map = tank();
		expect(moveByRule(map, "src", "dm", "rs")).toBe(map.root);
		expect(moveByRule(map, "src", "sp", "sps")).toBe(map.root);
		expect(moveByRule(map, "src", "tank", "rs")).toBe(map.root);
	});
});

describe("aligning a selection", () => {
	it("keeps the anchor, levels wired nodes on their neighbour, and moves only height", () => {
		const map = tank();
		const at = new Map([
			["rs", { x: 320, y: 0 }],
			["tank", { x: 640, y: 90 }],
			["sss", { x: 320, y: 300 }],
		]);
		const out = alignMap(map, at, ["rs", "tank", "sss"]);
		expect(out.get("rs")).toEqual({ x: 320, y: 0 });
		expect(out.get("tank")).toEqual({ x: 640, y: 0 });
		expect(out.get("sss")).toEqual({ x: 320, y: 0 });
	});

	it("follows wires hop by hop from the anchor", () => {
		const map = tank();
		const at = new Map([
			["tank", { x: 640, y: 50 }],
			["rs", { x: 320, y: 10 }],
			["dm", { x: 0, y: 400 }],
		]);
		const out = alignMap(map, at, ["tank", "dm", "rs"]);
		expect(out.get("rs")?.y).toBe(50);
		expect(out.get("dm")?.y).toBe(50);
	});
});

describe("a node synced from a model file", () => {
	it("knows a model file", () => {
		expect(isModelFile("src/Tank.rbxm")).toBe(true);
		expect(isModelFile("src/Tank.rbxmx")).toBe(true);
		expect(isModelFile("src/Tank.model.json")).toBe(true);
		expect(isModelFile("src/Tank")).toBe(false);
		expect(isModelFile("src/Tankxrbxm")).toBe(false);
	});

	it("leaves the class to the file", () => {
		const map = tank();
		map.root.children[0].children[0] = node("tank", "Tank", {
			className: "Model",
			path: "src/ReplicatedStorage/Tank.rbxm",
		});
		const tree = JSON.parse(compileNodeMap(map).json).tree;
		expect(tree.ReplicatedStorage.Tank).toEqual({ $path: "src/ReplicatedStorage/Tank.rbxm" });
	});
});
