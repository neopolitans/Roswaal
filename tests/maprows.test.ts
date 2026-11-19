/**
 * What a node map's row in the Project panel says: the project file it
 * writes, whether that file is written, serve, what it syncs, and two maps
 * writing one file, which neither may write.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { emptyMap, type MapNode, serialiseMap } from "../src/core/nodemap.js";
import { buildTree, compileMap, openProject, type TreeEntry } from "../src/server/project.js";

let n = 0;
const node = (name: string, extra: Partial<MapNode> = {}): MapNode => ({
	id: `m${n++}`,
	name,
	children: [],
	...extra,
});

async function project(maps: Record<string, string>): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "roswaal-maprows-"));
	await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	await mkdir(path.join(root, ".roswaal/scripts"), { recursive: true });
	for (const [file, output] of Object.entries(maps)) {
		const map = emptyMap(file, "map", () => `m${n++}`);
		map.output = output;
		map.root.children = [
			node("ReplicatedStorage", {
				children: [
					node("Tank", { id: "tank", className: "Folder", path: "src/ReplicatedStorage/Tank" }),
				],
			}),
		];
		await writeFile(path.join(root, `.roswaal/scripts/${file}.nodemap`), serialiseMap(map));
	}
	return root;
}

function find(entries: readonly TreeEntry[], name: string): TreeEntry | undefined {
	for (const e of entries) {
		if (e.name === name) return e;
		const below = e.children ? find(e.children, name) : undefined;
		if (below) return below;
	}
	return undefined;
}

describe("a node map's row", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("names the file it writes, says it is not written yet, and marks serve", async () => {
		root = await project({ Game: "default.project.json" });
		const facts = find(await buildTree(await openProject(root)), "Game.nodemap")?.mapFacts;
		expect(facts?.output).toBe("default.project.json");
		expect(facts?.state).toBe("missing");
		expect(facts?.serves).toBe(true);
		expect(facts?.syncs).toEqual([
			{
				id: "tank",
				trail: "ReplicatedStorage › Tank",
				className: "Folder",
				service: false,
				path: "src/ReplicatedStorage/Tank",
			},
		]);
	});

	it("says the file is written once the map has written it", async () => {
		root = await project({ Lobby: "lobby.project.json" });
		const opened = await openProject(root);
		await compileMap(opened, ".roswaal/scripts/Lobby.nodemap", { write: true });
		const facts = find(await buildTree(opened), "Lobby.nodemap")?.mapFacts;
		expect(facts?.state).toBe("same");
		expect(facts?.serves).toBeUndefined();
	});

	it("flags two maps writing one file, and neither writes it", async () => {
		root = await project({ A: "default.project.json", B: "default.project.json" });
		const opened = await openProject(root);
		const tree = await buildTree(opened);
		expect(find(tree, "A.nodemap")?.mapFacts?.clash).toBe(".roswaal/scripts/B.nodemap");
		expect(find(tree, "B.nodemap")?.mapFacts?.clash).toBe(".roswaal/scripts/A.nodemap");
		const outcome = await compileMap(opened, ".roswaal/scripts/A.nodemap", { write: true });
		expect(outcome.written).toBe(false);
		expect(
			outcome.diagnostics.some((d) => d.message.includes("writes default.project.json too")),
		).toBe(true);
	});
});
