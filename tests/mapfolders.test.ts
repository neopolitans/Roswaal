/**
 * Compiling a node map makes the folders it syncs: the one under `src` Rojo
 * reads, and the one under the graphs directory that mirrors it.
 */

import { mkdir, mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { emptyMap, type MapNode, serialiseMap } from "../src/core/nodemap.js";
import { removeEmptyFolders } from "../src/server/outputs.js";
import { buildTree, compileMap, openProject, type TreeEntry } from "../src/server/project.js";

const MAP = ".roswaal/scripts/Game.nodemap";

let n = 0;
const node = (name: string, extra: Partial<MapNode> = {}): MapNode => ({
	id: `m${n++}`,
	name,
	children: [],
	...extra,
});

/** Two services under `src`, Wally's Packages, and a script file. None on disk. */
async function project(): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "roswaal-mapfolders-"));
	await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	await mkdir(path.join(root, ".roswaal/scripts"), { recursive: true });
	await mkdir(path.join(root, "Packages"));
	await writeFile(path.join(root, "Packages", "x.lua"), "return 1\n");
	const map = emptyMap("Game", "map", () => `m${n++}`);
	map.root.children = [
		node("ReplicatedStorage", {
			path: "src/ReplicatedStorage",
			children: [node("Packages", { className: "Folder", path: "Packages" })],
		}),
		node("ServerScriptService", {
			path: "src/ServerScriptService",
			children: [node("Main", { className: "Script", path: "src/Main.server.luau" })],
		}),
	];
	await writeFile(path.join(root, MAP), serialiseMap(map));
	return root;
}

const exists = (root: string, rel: string) =>
	stat(path.join(root, rel)).then(
		() => true,
		() => false,
	);

describe("a node map's folders", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("are made when the map is compiled, with their mirrors", async () => {
		root = await project();
		const outcome = await compileMap(await openProject(root), MAP, { write: true });

		expect(outcome.made?.sort()).toEqual([
			".roswaal/scripts/ReplicatedStorage",
			".roswaal/scripts/ServerScriptService",
			"src/ReplicatedStorage",
			"src/ServerScriptService",
		]);
		for (const folder of outcome.made ?? []) expect(await exists(root, folder)).toBe(true);
	});

	it("leave a file, and a folder outside src, alone", async () => {
		root = await project();
		await compileMap(await openProject(root), MAP, { write: true });
		expect(await exists(root, "src/Main.server.luau")).toBe(false);
		expect(await exists(root, ".roswaal/scripts/Main.server.luau")).toBe(false);
		expect(await exists(root, ".roswaal/scripts/Packages")).toBe(false);
	});

	it("are made once, and not by a check", async () => {
		root = await project();
		const checked = await compileMap(await openProject(root), MAP);
		expect(checked.made).toBeUndefined();
		expect(await exists(root, "src/ReplicatedStorage")).toBe(false);

		await compileMap(await openProject(root), MAP, { write: true });
		const again = await compileMap(await openProject(root), MAP, { write: true });
		expect(again.made).toBeUndefined();
	});

	it("stay when the last script in one goes", async () => {
		root = await project();
		const opened = await openProject(root);
		await compileMap(opened, MAP, { write: true });
		await mkdir(path.join(root, "src/ReplicatedStorage/Shared"));
		await writeFile(path.join(root, "src/ReplicatedStorage/Shared/A.luau"), "return 1\n");
		await unlink(path.join(root, "src/ReplicatedStorage/Shared/A.luau"));

		await removeEmptyFolders(opened, "src/ReplicatedStorage/Shared/A.luau");
		expect(await exists(root, "src/ReplicatedStorage/Shared")).toBe(false);
		expect(await exists(root, "src/ReplicatedStorage")).toBe(true);
	});

	it("colour the graphs' mirror as the service it is", async () => {
		root = await project();
		const opened = await openProject(root);
		await compileMap(opened, MAP, { write: true });
		const roles = new Map<string, string | undefined>();
		const visit = (entries: TreeEntry[]) => {
			for (const entry of entries) {
				roles.set(entry.path, entry.role);
				if (entry.children) visit(entry.children);
			}
		};
		visit(await buildTree(opened));
		expect(roles.get("src/ReplicatedStorage")).toBe("service");
		expect(roles.get(".roswaal/scripts/ReplicatedStorage")).toBe("service");
		expect(roles.get(".roswaal/scripts")).toBeUndefined();
	});

	/** ReplicatedStorage with no path of its own, and a Folder in it that has one. */
	it("make a service of the folder above a synced Folder", async () => {
		root = await project();
		const map = emptyMap("Game", "map", () => `m${n++}`);
		map.root.children = [
			node("ReplicatedStorage", {
				children: [node("Tank", { className: "Folder", path: "src/ReplicatedStorage/Tank" })],
			}),
		];
		await writeFile(path.join(root, MAP), serialiseMap(map));
		const opened = await openProject(root);
		await compileMap(opened, MAP, { write: true });
		const roles = new Map<string, string | undefined>();
		const visit = (entries: TreeEntry[]) => {
			for (const entry of entries) {
				roles.set(entry.path, entry.role);
				if (entry.children) visit(entry.children);
			}
		};
		visit(await buildTree(opened));
		expect(roles.get("src/ReplicatedStorage/Tank")).toBe("synced");
		expect(roles.get(".roswaal/scripts/ReplicatedStorage/Tank")).toBe("synced");
		expect(roles.get("src/ReplicatedStorage")).toBe("service");
		expect(roles.get(".roswaal/scripts/ReplicatedStorage")).toBe("service");
	});
});
