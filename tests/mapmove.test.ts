/**
 * A node map entry whose path changes takes its folder with it: the output
 * folder Rojo syncs and the graphs that compile there. And a graph whose Luau
 * goes where no map syncs it is named, rather than left for Studio to show as
 * a script that never arrived.
 *
 * On a copy of the demo project, whose map syncs `Source` under
 * ServerScriptService and `Shared` under ReplicatedStorage.
 */

import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileMap, openProject, unsyncedGraphs } from "../src/server/project.js";

const DEMO = path.resolve("examples/demo");
const MAP = ".roswaal/scripts/Game.nodemap";
const SOURCE = "src/ServerScriptService/Source";
const LOGIC = "src/ServerScriptService/Logic";

let root = "";
afterEach(async () => {
	if (root) await rm(root, { recursive: true, force: true });
	root = "";
});

async function demo(): Promise<string> {
	root = await mkdtemp(path.join(os.tmpdir(), "roswaal-mapmove-"));
	await cp(DEMO, root, { recursive: true });
	return root;
}

type RawNode = { name: string; path?: string; children: RawNode[] };

/** Changes the map on disk, as saving it in the editor does. */
async function editMap(change: (rootNode: RawNode) => void): Promise<void> {
	const file = path.join(root, MAP);
	const map = JSON.parse(await readFile(file, "utf8")) as { root: RawNode };
	change(map.root);
	await writeFile(file, JSON.stringify(map, null, 2));
}

const child = (parent: RawNode, name: string) => parent.children.find((c) => c.name === name)!;
const moveSource = (to: string) =>
	editMap((r) => {
		child(child(r, "ServerScriptService"), "Source").path = to;
	});

const exists = (rel: string) =>
	stat(path.join(root, rel)).then(
		() => true,
		() => false,
	);

const compile = async (opts: { sync?: boolean; merge?: boolean } = {}) =>
	compileMap(await openProject(root), MAP, { write: true, ...opts });

describe("a map entry's path changing", () => {
	it("moves the folder, and its graphs, to the new path", async () => {
		await demo();
		await compile();
		await moveSource(LOGIC);
		const outcome = await compile();

		expect(outcome.moved).toEqual([
			expect.objectContaining({ name: "Source", from: SOURCE, to: LOGIC, kept: [] }),
		]);
		expect(await exists(`${LOGIC}/Main.server.luau`)).toBe(true);
		expect(await exists(".roswaal/scripts/ServerScriptService/Logic/Main.nodescript")).toBe(true);
		expect(await exists(SOURCE)).toBe(false);
		expect(await exists(".roswaal/scripts/ServerScriptService/Source")).toBe(false);
		// Still the demo's Main graph, by its id: the header follows the graph, not its folder.
		const luau = await readFile(path.join(root, `${LOGIC}/Main.server.luau`), "utf8");
		expect(luau).toContain("roswaal-graph: demo-main");
		const project = JSON.parse(await readFile(path.join(root, "default.project.json"), "utf8"));
		expect(project.tree.ServerScriptService.Source.$path).toBe(LOGIC);
	});

	it("moves on a project compiled before the folders were recorded, by its project file", async () => {
		await demo();
		await moveSource(LOGIC);
		const outcome = await compile();
		expect(outcome.moved?.map((m) => m.to)).toEqual([LOGIC]);
		expect(await exists(`${LOGIC}/Main.server.luau`)).toBe(true);
	});

	it("holds a move into a folder that has files, and moves beside them when asked", async () => {
		await demo();
		await compile();
		await mkdir(path.join(root, LOGIC), { recursive: true });
		await writeFile(path.join(root, LOGIC, "Main.server.luau"), "print('mine')\n");
		await moveSource(LOGIC);

		const held = await compile();
		expect(held.held).toEqual([{ name: "Source", from: SOURCE, to: LOGIC }]);
		expect(held.moved).toBeUndefined();
		expect(await exists(".roswaal/scripts/ServerScriptService/Source/Main.nodescript")).toBe(true);

		const merged = await compile({ merge: true });
		expect(merged.moved?.[0].kept).toEqual([`${SOURCE}/Main.server.luau`]);
		// The graph went; the Luau beside a file of its name stayed.
		expect(await exists(".roswaal/scripts/ServerScriptService/Logic/Main.nodescript")).toBe(true);
	});

	it("moves nothing in Dynamic mode, and keeps the last project file while the path is not there", async () => {
		await demo();
		await compile();
		await moveSource(LOGIC);
		const outcome = await compile({ sync: false });
		expect(outcome.moved).toBeUndefined();
		expect(outcome.made).toBeUndefined();
		expect(outcome.written).toBe(false);
		expect(await exists(LOGIC)).toBe(false);

		// The explicit compile after it still knows where the folder was.
		const later = await compile();
		expect(later.moved?.map((m) => m.to)).toEqual([LOGIC]);
	});
});

describe("graphs no map syncs", () => {
	it("are named with the folder their Luau goes to", async () => {
		await demo();
		const before = await unsyncedGraphs(await openProject(root));
		expect(before).toEqual([]);

		await editMap((r) => {
			const rs = child(r, "ReplicatedStorage");
			rs.children = rs.children.filter((c) => c.name !== "Shared");
		});
		expect(await unsyncedGraphs(await openProject(root))).toEqual([
			{
				graph: ".roswaal/scripts/ReplicatedStorage/Shared/Greeter.nodescript",
				folder: "src/ReplicatedStorage/Shared",
			},
		]);
	});
});
