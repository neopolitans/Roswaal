/**
 * One map is served and writes default.project.json; the others write their
 * own under .roswaal, with paths written from there, as Rojo reads them.
 * Serving another swaps them.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	compileNodeMap,
	emptyMap,
	fromOutput,
	intoProject,
	type MapNode,
	parkedOutput,
	serialiseMap,
} from "../src/core/nodemap.js";
import { projectToMap } from "../src/core/rojoImport.js";
import { ApiSession } from "../src/server/routes.js";

let n = 0;
const node = (name: string, extra: Partial<MapNode> = {}): MapNode => ({
	id: `m${n++}`,
	name,
	children: [],
	...extra,
});

describe("paths in a project file", () => {
	it("are written from the file's folder, and read back into the project's", () => {
		expect(fromOutput("default.project.json", "src/Server")).toBe("src/Server");
		expect(fromOutput(".roswaal/projects/Lobby.project.json", "src/Server")).toBe(
			"../../src/Server",
		);
		expect(fromOutput(".roswaal/projects/Lobby.project.json", ".roswaal/x")).toBe("../x");
		expect(intoProject(".roswaal/projects/Lobby.project.json", "../../src/Server")).toBe(
			"src/Server",
		);
		expect(intoProject("default.project.json", "src/Server")).toBe("src/Server");
	});

	it("are rewritten for a map that writes under .roswaal, and the ignore globs too", () => {
		const map = emptyMap("Lobby", "lobby", () => `m${n++}`);
		map.output = parkedOutput(".roswaal/scripts/Lobby.nodemap");
		map.globIgnorePaths = ["src/**/*.spec.luau"];
		map.root.children = [node("ServerScriptService", { path: "src/ServerScriptService" })];
		const project = JSON.parse(compileNodeMap(map).json);
		expect(map.output).toBe(".roswaal/projects/Lobby.project.json");
		expect(project.tree.ServerScriptService.$path).toBe("../../src/ServerScriptService");
		expect(project.globIgnorePaths).toEqual(["../../src/**/*.spec.luau"]);
	});

	it("come back as the project's when a project file in a folder is imported", () => {
		const json = {
			name: "Lobby",
			tree: { $className: "DataModel", Workspace: { $path: "../../src/Lobby" } },
		};
		const { map } = projectToMap(json, {
			output: ".roswaal/projects/Lobby.project.json",
			fallbackName: "Lobby",
			makeId: () => `i${n++}`,
		});
		expect(map.root.children[0].path).toBe("src/Lobby");
		expect(JSON.parse(compileNodeMap(map).json).tree).toEqual(json.tree);
	});
});

describe("serving a map", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function project(): Promise<string> {
		const at = await mkdtemp(path.join(os.tmpdir(), "roswaal-serve-"));
		await writeFile(path.join(at, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await mkdir(path.join(at, ".roswaal/scripts"), { recursive: true });
		for (const [name, output] of [
			["Game", "default.project.json"],
			["Lobby", ".roswaal/projects/Lobby.project.json"],
		]) {
			const map = emptyMap(name, name, () => `m${n++}`);
			map.output = output;
			map.root.children = [node("ServerScriptService", { path: `src/${name}` })];
			await writeFile(path.join(at, `.roswaal/scripts/${name}.nodemap`), serialiseMap(map));
			await mkdir(path.join(at, `src/${name}`), { recursive: true });
			await writeFile(path.join(at, `src/${name}/Main.server.luau`), "print(1)");
		}
		return at;
	}

	it("swaps which map writes default.project.json, and the other writes its own", async () => {
		root = await project();
		const session = new ApiSession({});
		await session.openAt(root);
		await session.handle("POST", "/map/serve", {
			body: { path: ".roswaal/scripts/Lobby.nodemap" },
		});

		const served = JSON.parse(await readFile(path.join(root, "default.project.json"), "utf8"));
		expect(served.name).toBe("Lobby");
		const parked = JSON.parse(
			await readFile(path.join(root, ".roswaal/projects/Game.project.json"), "utf8"),
		);
		expect(parked.name).toBe("Game");
		expect(parked.tree.ServerScriptService.$path).toBe("../../src/Game");
		const gone = await stat(path.join(root, ".roswaal/projects/Lobby.project.json")).then(
			() => false,
			() => true,
		);
		expect(gone).toBe(true);
	});

	it("starts a new map unserved while another serves", async () => {
		root = await project();
		const session = new ApiSession({});
		await session.openAt(root);
		const made = (await session.handle("POST", "/map/create", {
			body: { dir: ".roswaal/scripts", name: "Arena" },
		})) as { map: { output: string } };
		expect(made.map.output).toBe(".roswaal/projects/Arena.project.json");
	});

	it("takes a map's own project file with it when the map is deleted", async () => {
		root = await project();
		const session = new ApiSession({});
		await session.openAt(root);
		const parked = path.join(root, ".roswaal/projects/Lobby.project.json");
		await mkdir(path.dirname(parked), { recursive: true });
		await writeFile(parked, "{}");
		await session.handle("POST", "/script/delete", {
			body: { path: ".roswaal/scripts/Lobby.nodemap" },
		});
		const gone = await stat(parked).then(
			() => false,
			() => true,
		);
		expect(gone).toBe(true);
	});
});
