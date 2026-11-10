/**
 * A node map's paths stay inside the project (F12).
 *
 * roswaal.json's folders have been held inside the project since they were
 * added; a node map's were not, and `../shared` compiled with no word into the
 * Rojo project file, pointing Rojo outside the project. Now any path, `$path`
 * kept from an imported file, or output that leads out is an error: the map
 * says so as it is edited, and no project file is written.
 */

import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	compileNodeMap,
	emptyFilesystemMap,
	type MapNode,
	type NodeMap,
} from "../src/core/nodemap.js";
import { staysInside } from "../src/core/rojoPaths.js";
import { compileMap, openProject } from "../src/server/project.js";

function mapWith(shared: Partial<MapNode>, output = "default.project.json"): NodeMap {
	return {
		schemaVersion: 1,
		kind: "map",
		id: "m",
		name: "Game",
		output,
		root: {
			id: "root",
			name: "Game",
			className: "DataModel",
			children: [
				{
					id: "rs",
					name: "ReplicatedStorage",
					children: [
						{ id: "shared", name: "Shared", className: "Folder", children: [], ...shared },
					],
				},
			],
		},
	};
}

const outsideErrors = (map: NodeMap) =>
	compileNodeMap(map).diagnostics.filter(
		(d) => d.severity === "error" && /outside the project/.test(d.message),
	);

describe("a map path that leads out of the project", () => {
	it.each([
		"../shared",
		"/etc/roblox",
		"C:/Users/someone/shared",
		"C:\\Users\\someone",
		"src/../../outside",
	])("%s is an error on the entry, and the map is not ok", (where) => {
		const map = mapWith({ path: where });
		const errors = outsideErrors(map);
		expect(errors).toHaveLength(1);
		expect(errors[0].node).toBe("shared");
		expect(errors[0].message).toContain(where);
		expect(compileNodeMap(map).ok).toBe(false);
	});

	it.each(["src/Shared", "src/../src/Shared", "./Packages", "Packages"])("%s is not", (where) => {
		expect(outsideErrors(mapWith({ path: where }))).toEqual([]);
	});

	it("is an error in the object form an imported project file kept, too", () => {
		expect(outsideErrors(mapWith({ rojo: { $path: { optional: "../shared" } } }))).toHaveLength(1);
		expect(outsideErrors(mapWith({ rojo: { $path: "../shared" } }))).toHaveLength(1);
		expect(outsideErrors(mapWith({ rojo: { $path: { optional: "src/Shared" } } }))).toEqual([]);
	});

	it("and an output outside the project is an error of the map's", () => {
		expect(outsideErrors(mapWith({ path: "src/Shared" }, "../default.project.json"))).toHaveLength(
			1,
		);
		expect(compileNodeMap(mapWith({ path: "src/Shared" }, "out/default.project.json")).ok).toBe(
			true,
		);
	});

	it("staysInside reads either slash and any climb", () => {
		expect(staysInside("src/../src")).toBe(true);
		expect(staysInside("src\\..\\..\\x")).toBe(false);
		expect(staysInside("..")).toBe(false);
		expect(staysInside("\\\\server\\share")).toBe(false);
	});
});

describe("a Lune map's names", () => {
	it("refuse . and .., which name a folder rather than something in it", () => {
		let n = 0;
		const map = emptyFilesystemMap("Tool", "t", () => `id${n++}`);
		map.root.children = [
			{ id: "up", name: "..", children: [] },
			{ id: "here", name: ".", children: [] },
			{ id: "fine", name: "lib", children: [] },
		];
		const errors = compileNodeMap(map).diagnostics.filter((d) => d.severity === "error");
		expect(errors.map((d) => d.node).sort()).toEqual(["here", "up"]);
	});

	it("but the root, which is the project folder and is called . by design, is fine", () => {
		let n = 0;
		const map = emptyFilesystemMap("Tool", "t", () => `id${n++}`);
		expect(map.root.name).toBe(".");
		expect(compileNodeMap(map).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------

const DEMO = path.resolve("examples/demo");
const MAP = ".roswaal/scripts/Game.nodemap";
let root = "";

afterEach(async () => {
	if (root) await rm(path.dirname(root), { recursive: true, force: true });
	root = "";
});

const exists = (abs: string) =>
	stat(abs).then(
		() => true,
		() => false,
	);

describe("compiling a map whose path leads out", () => {
	it("writes no project file, makes and moves nothing, and looks for nothing outside", async () => {
		const base = await mkdtemp(path.join(os.tmpdir(), "roswaal-mappaths-"));
		root = path.join(base, "project");
		await cp(DEMO, root, { recursive: true });
		await compileMap(await openProject(root), MAP, { write: true });
		const projectFile = path.join(root, "default.project.json");
		const before = await readFile(projectFile, "utf8");

		// Starts with the output folder, so it once passed as a folder Roswaal makes.
		const file = path.join(root, MAP);
		const map = JSON.parse(await readFile(file, "utf8")) as { root: MapNode };
		const sss = map.root.children.find((c) => c.name === "ServerScriptService")!;
		sss.children.find((c) => c.name === "Source")!.path = "src/../../outside";
		await writeFile(file, JSON.stringify(map, null, 2));

		const outcome = await compileMap(await openProject(root), MAP, { write: true });
		expect(outcome.written).toBe(false);
		expect(outcome.skipped).toMatch(/errors/);
		expect(outcome.diagnostics.filter((d) => /outside the project/.test(d.message))).toHaveLength(
			1,
		);
		expect(outcome.diagnostics.some((d) => /not on disk/.test(d.message))).toBe(false);
		expect(outcome.made).toBeUndefined();
		expect(outcome.moved).toBeUndefined();
		expect(await exists(path.join(base, "outside"))).toBe(false);
		expect(await readFile(projectFile, "utf8")).toBe(before);
		// The folder the entry synced before is where it was.
		expect(await exists(path.join(root, "src/ServerScriptService/Source"))).toBe(true);
	});
});
