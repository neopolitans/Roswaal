/**
 * Wally's folders kept synced where roswaal.json's packageSync says: made
 * where there is no mapping, moved where there is one elsewhere, left alone
 * where it is already right, and only once the folder is installed.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { emptyMap, type MapNode, serialiseMap } from "../src/core/nodemap.js";
import { syncPackageFolders } from "../src/core/packageSync.js";
import { parseConfig } from "../src/server/config.js";
import { ApiSession } from "../src/server/routes.js";

let n = 0;
const makeId = () => `n${n++}`;
const node = (name: string, extra: Partial<MapNode> = {}, children: MapNode[] = []): MapNode => ({
	id: makeId(),
	name,
	children,
	...extra,
});
const all = () => true;

const find = (root: MapNode, trail: string[]): MapNode | undefined => {
	let at: MapNode | undefined = root;
	for (const name of trail) at = at?.children.find((c) => c.name === name);
	return at;
};

describe("keeping a realm's folder where it goes", () => {
	it("maps it where there is no mapping, a service and a Folder", () => {
		const root = node("DataModel", { className: "DataModel" });
		const next = syncPackageFolders(root, { shared: "ReplicatedStorage.Packages" }, all, makeId);
		const made = find(next, ["ReplicatedStorage", "Packages"]);
		expect(made?.path).toBe("Packages");
		expect(made?.className).toBe("Folder");
		expect(find(next, ["ReplicatedStorage"])?.className).toBeUndefined();
	});

	it("moves a mapping from somewhere else, and changes nothing when it is right", () => {
		const root = node("DataModel", { className: "DataModel" }, [
			node("ServerScriptService", {}, [
				node("ServerPackages", { className: "Folder", path: "ServerPackages" }),
			]),
		]);
		const next = syncPackageFolders(root, { server: "ServerStorage.ServerPackages" }, all, makeId);
		expect(find(next, ["ServerScriptService", "ServerPackages"])).toBeUndefined();
		expect(find(next, ["ServerStorage", "ServerPackages"])?.path).toBe("ServerPackages");
		expect(syncPackageFolders(next, { server: "ServerStorage.ServerPackages" }, all, makeId)).toBe(
			next,
		);
	});

	it("keeps what a moved mapping holds, and waits for the folder to be installed", () => {
		const root = node("DataModel", { className: "DataModel" }, [
			node("ReplicatedStorage", {}, [
				node("Packages", { className: "Folder", path: "Packages" }, [
					node("Extra", { className: "Folder" }),
				]),
			]),
		]);
		const next = syncPackageFolders(
			root,
			{ shared: "ReplicatedStorage.Shared.Packages" },
			all,
			makeId,
		);
		expect(find(next, ["ReplicatedStorage", "Packages"])?.path).toBeUndefined();
		expect(find(next, ["ReplicatedStorage", "Packages", "Extra"])).toBeDefined();
		expect(find(next, ["ReplicatedStorage", "Shared", "Packages"])?.path).toBe("Packages");
		expect(
			syncPackageFolders(root, { shared: "ReplicatedStorage.Packages" }, () => false, makeId),
		).toBe(root);
	});
});

describe("packageSync in roswaal.json", () => {
	it("takes a DataModel path for each realm, and refuses anything else", () => {
		expect(
			parseConfig({ packageSync: { shared: "ReplicatedStorage.Packages" } }).packageSync,
		).toEqual({
			shared: "ReplicatedStorage.Packages",
		});
		expect(() => parseConfig({ packageSync: { shared: "Packages" } })).toThrow(/DataModel path/);
		expect(() => parseConfig({ packageSync: { client: "ReplicatedStorage.X" } })).toThrow(
			/shared, server/,
		);
	});
});

describe("a project with packageSync", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("has its installed folders mapped in the served map as it opens", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-pkgsync-"));
		await writeFile(
			path.join(root, "roswaal.json"),
			JSON.stringify({ schemaVersion: 1, packageSync: { shared: "ReplicatedStorage.Packages" } }),
		);
		await mkdir(path.join(root, ".roswaal/scripts"), { recursive: true });
		await mkdir(path.join(root, "Packages"), { recursive: true });
		await writeFile(path.join(root, "Packages", "Signal.lua"), "return {}");
		const map = emptyMap("Game", "game", makeId);
		map.root.children = [];
		await writeFile(path.join(root, ".roswaal/scripts/Game.nodemap"), serialiseMap(map));
		const session = new ApiSession({});
		await session.openAt(root);
		const project = JSON.parse(await readFile(path.join(root, "default.project.json"), "utf8"));
		expect(project.tree.ReplicatedStorage.Packages.$path).toBe("Packages");
	});
});
