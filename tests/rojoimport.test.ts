/**
 * Reading a Rojo project file into a node map, and taking the file over only
 * when the map says the same thing. The project files here are made up; the
 * shapes are the ones hand-written projects use.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	compileNodeMap,
	emptyFilesystemMap,
	type NodeMap,
	serialiseMap,
} from "../src/core/nodemap.js";
import { formatLike, projectToMap, sameProject } from "../src/core/rojoImport.js";
import {
	compileMap,
	findRojoProjects,
	importRojoProject,
	openProject,
	readMap,
	writeMap,
} from "../src/server/project.js";
import { ApiSession } from "../src/server/routes.js";

let n = 0;
const makeId = () => `id${n++}`;
const read = (json: unknown) =>
	projectToMap(json, { output: "default.project.json", fallbackName: "Game", makeId });
const roundTrip = (json: unknown) => JSON.parse(compileNodeMap(read(json).map).json);

const GAME = {
	name: "Orchard",
	servePort: 34873,
	tree: {
		$className: "DataModel",
		ReplicatedStorage: {
			$className: "ReplicatedStorage",
			Shared: { $path: "src/shared" },
			Assets: { $className: "Folder", $path: "assets" },
		},
		ServerScriptService: { Server: { $path: "src/server" } },
		StarterPlayer: {
			StarterPlayerScripts: { $className: "StarterPlayerScripts", Client: { $path: "src/client" } },
		},
		Lighting: { $properties: { Brightness: 2, Ambient: [0, 0, 0], GlobalShadows: true } },
		Workspace: {
			$className: "Workspace",
			$ignoreUnknownInstances: true,
			$attributes: { Season: "Autumn" },
		},
	},
	globIgnorePaths: ["**/*.spec.luau"],
};

describe("reading a project file", () => {
	it("gives back the same project when the map is compiled", () => {
		expect(sameProject(roundTrip(GAME), GAME)).toBe(true);
	});

	it("keeps a service's class as written, and knows it is a service", () => {
		const { map } = read(GAME);
		const storage = map.root.children.find((c) => c.name === "ReplicatedStorage")!;
		expect(storage).toMatchObject({ statedClass: true });
		expect(storage.className).toBeUndefined();
		const server = map.root.children.find((c) => c.name === "ServerScriptService")!;
		expect(server.statedClass).toBeUndefined();
	});

	it("models what a map has, and carries the rest", () => {
		const { map } = read(GAME);
		expect(map.name).toBe("Orchard");
		expect(map.rojo).toEqual({ servePort: 34873 });
		expect(map.globIgnorePaths).toEqual(["**/*.spec.luau"]);
		const workspace = map.root.children.find((c) => c.name === "Workspace")!;
		expect(workspace).toMatchObject({
			ignoreUnknown: true,
			rojo: { $attributes: { Season: "Autumn" } },
		});
		const lighting = map.root.children.find((c) => c.name === "Lighting")!;
		expect(lighting.properties).toEqual({ Brightness: 2, Ambient: [0, 0, 0], GlobalShadows: true });
	});

	it("carries a $path given as an object, which the map has no field for", () => {
		const json = {
			name: "X",
			tree: { $className: "DataModel", ServerStorage: { Maybe: { $path: { optional: "extra" } } } },
		};
		expect(sameProject(roundTrip(json), json)).toBe(true);
	});

	it("reads a model project, whose root is not a DataModel", () => {
		const json = { name: "Lib", tree: { $path: "src" } };
		const { map } = read(json);
		expect(map.root.name).toBe("Lib");
		expect(sameProject(roundTrip(json), json)).toBe(true);
	});

	it("says a value in the tree is not an instance, and keeps it", () => {
		const json = { name: "X", tree: { $className: "DataModel", Stray: 3 } };
		const { problems } = read(json);
		expect(problems).toHaveLength(1);
		expect(sameProject(roundTrip(json), json)).toBe(true);
	});

	it("does not warn that a node with only properties does nothing", () => {
		expect(compileNodeMap(read(GAME).map).diagnostics).toEqual([]);
	});
});

describe("a map's file", () => {
	it("keeps every field it has", () => {
		const back = JSON.parse(serialiseMap(read(GAME).map)) as NodeMap;
		expect(sameProject(JSON.parse(compileNodeMap(back).json), GAME)).toBe(true);
	});

	it("keeps a Lune map a Lune map", () => {
		const back = JSON.parse(serialiseMap(emptyFilesystemMap("Tool", "t", makeId))) as NodeMap;
		expect(back.target).toBe("lune");
		expect(back.root.children.find((c) => c.name === "main")!.file).toBe(true);
	});
});

describe("layout", () => {
	it("follows the file it replaces: tabs, CRLF and no final newline", () => {
		const out = formatLike('{\n  "a": 1\n}\n', '{\r\n\t"b": 2\r\n}');
		expect(out).toBe('{\r\n\t"a": 1\r\n}');
	});
});

describe("importing into a project", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function project(json: unknown, text = JSON.stringify(json, null, "\t")) {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-rojo-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		for (const dir of ["src/shared", "src/server", "src/client", "assets"])
			await mkdir(path.join(root, dir), { recursive: true });
		await writeFile(path.join(root, "default.project.json"), text);
		return text;
	}

	it("takes the file over, and a compile leaves it byte for byte", async () => {
		const text = await project(GAME);
		const out = await importRojoProject(await openProject(root), "default.project.json");
		expect(out).toMatchObject({ file: "default.project.json", takenOver: true, problems: [] });
		const compiled = await compileMap(await openProject(root), out.mapPath, { write: true });
		expect(compiled).toMatchObject({ written: true, unchanged: true });
		expect(await readFile(path.join(root, "default.project.json"), "utf8")).toBe(text);
	});

	it("rewrites it in its own layout once the map changes", async () => {
		await project(GAME);
		const opened = await openProject(root);
		const { mapPath } = await importRojoProject(opened, "default.project.json");
		const map = await readMap(opened, mapPath);
		map.root.children.push({
			id: "new",
			name: "ServerStorage",
			children: [{ id: "n2", name: "Kept", className: "Folder", children: [] }],
		});
		await writeMap(opened, mapPath, map);
		const compiled = await compileMap(opened, mapPath, { write: true });
		expect(compiled.unchanged).toBeUndefined();
		const written = await readFile(path.join(root, "default.project.json"), "utf8");
		expect(written).toContain('\t"tree"');
		expect(JSON.parse(written).tree.ServerStorage).toEqual({ Kept: { $className: "Folder" } });
	});

	it("leaves a file alone that the map would write differently", async () => {
		// Two keys of one name: JSON keeps the last, so the map cannot say the first.
		await project(
			null,
			'{ "name": "Dup", "tree": { "$className": "DataModel", "A": { "$path": "src/shared" }, "A": { "$path": "src/server" } }, "globIgnorePaths": [] }',
		);
		const out = await importRojoProject(await openProject(root), "default.project.json");
		expect(out.takenOver).toBe(false);
		const compiled = await compileMap(await openProject(root), out.mapPath, { write: true });
		expect(compiled.written).toBe(false);
	});

	it("lists the project files, and which a map already writes", async () => {
		await project(GAME);
		const opened = await openProject(root);
		expect(await findRojoProjects(opened)).toEqual([
			{ file: "default.project.json", mappedBy: null },
		]);
		const { mapPath } = await importRojoProject(opened, "default.project.json");
		expect(await findRojoProjects(opened)).toEqual([
			{ file: "default.project.json", mappedBy: mapPath },
		]);
		await expect(importRojoProject(opened, "default.project.json")).rejects.toThrow(
			/already written/,
		);
	});

	it("is reached through the routes both hosts answer", async () => {
		await project(GAME);
		const session = new ApiSession({});
		await session.openAt(root);
		const listed = (await session.handle("GET", "/rojo/projects")) as { projects: unknown[] };
		expect(listed.projects).toHaveLength(1);
		const out = (await session.handle("POST", "/rojo/import", {
			body: { file: "default.project.json" },
		})) as { mapPath: string; takenOver: boolean };
		expect(out.takenOver).toBe(true);
		expect(out.mapPath).toMatch(/Orchard\.nodemap$/);
	});
});
