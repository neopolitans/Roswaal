/**
 * The Instance node's path: steps that fold from the start to fit the Path
 * row, the leaf named in the title, and the row grown to hold it all under
 * Long names › Widen.
 */

import { describe, expect, it } from "vitest";

import { addNode } from "../src/app/edits.js";

import {
	foldSteps,
	PATH_ROW_CHARS,
	pathLeaf,
	pathRowWidth,
	pathSteps,
} from "../src/core/instancePathFace.js";
import { migrateScript } from "../src/core/migrate.js";
import { nodeWidth } from "../src/core/nodeBox.js";
import { BUILTIN_NODES, createRegistry, nodeTitle } from "../src/core/nodes/index.js";
import { emptyScript, type GraphNode } from "../src/core/schema.js";

const fold = (path: string) => foldSteps(pathSteps(path), PATH_ROW_CHARS);

describe("folding a path to the Path row", () => {
	it("shows a short path whole", () => {
		expect(fold("Tank.Remotes")).toEqual({ shown: ["Tank", "Remotes"], hidden: [] });
	});

	it("folds from the start, keeping the last step whole", () => {
		expect(fold("Tanks.Remotes.TankExit")).toEqual({
			shown: ["Remotes", "TankExit"],
			hidden: ["Tanks"],
		});
		expect(fold("Map.Lobby.Spawns.SpawnLocation")).toEqual({
			shown: ["SpawnLocation"],
			hidden: ["Map", "Lobby", "Spawns"],
		});
	});

	it("never cuts the leaf, however long", () => {
		expect(fold("A.ThisIsAVeryLongInstanceNameIndeed").shown).toEqual([
			"ThisIsAVeryLongInstanceNameIndeed",
		]);
		expect(pathLeaf("Tanks.Remotes.TankExit")).toBe("TankExit");
		expect(pathLeaf("")).toBe("");
	});
});

describe("the Instance node", () => {
	const registry = createRegistry(BUILTIN_NODES);
	const def = registry.get("roblox.instancePath")!;
	const node = (path: string): GraphNode => ({
		id: "n",
		def: def.id,
		x: 0,
		y: 0,
		literals: { root: { t: "string", v: "ReplicatedStorage" }, path: { t: "string", v: path } },
	});

	it("is named for the instance it reaches", () => {
		expect(nodeTitle(def, node("Tanks.Remotes.TankExit"))).toBe("Instance (TankExit)");
		expect(nodeTitle(def, node(""))).toBe("Instance");
	});

	it("grows under Widen to show every step, and not otherwise", () => {
		const long = node("Tanks.Remotes.Exits.Primary.TankExit");
		expect(nodeWidth(def, long, false)).toBe(nodeWidth(def, node("A"), false));
		expect(nodeWidth(def, long, true)).toBe(pathRowWidth("Tanks.Remotes.Exits.Primary.TankExit"));
		expect(nodeWidth(def, long, true)).toBeGreaterThan(nodeWidth(def, long, false));
	});

	it("starts with no path, and names nothing until one is picked", () => {
		const fresh: GraphNode = { id: "f", def: def.id, x: 0, y: 0 };
		expect(nodeTitle(def, fresh)).toBe("Instance");
		expect(def.inputs.find((p) => p.id === "path")?.default).toEqual({ t: "string", v: "" });
	});

	it("is placed storing its empty path, so loading it again leaves it empty", () => {
		const placed = addNode(emptyScript("New", "new"), def, 0, 0);
		const node = placed.script.nodes.find((n) => n.id === placed.id)!;
		expect(node.literals?.path).toEqual({ t: "string", v: "" });
		expect(migrateScript(placed.script, registry).script.nodes[0].literals?.path).toEqual({
			t: "string",
			v: "",
		});
	});

	it("keeps an older node that leaned on Modules.Combat compiling as it did", () => {
		const old = { ...emptyScript("Old", "old"), nodes: [{ id: "i", def: def.id, x: 0, y: 0 }] };
		const { script } = migrateScript(old, registry);
		expect(script.nodes[0].literals?.path).toEqual({ t: "string", v: "Modules.Combat" });
		const set = {
			...old,
			nodes: [{ ...old.nodes[0], literals: { path: { t: "string" as const, v: "" } } }],
		};
		expect(migrateScript(set, registry).script.nodes[0].literals?.path).toEqual({
			t: "string",
			v: "",
		});
	});
});
