/**
 * Making a project from a place: which scripts Rojo can sync, where each file
 * goes, what is merged, and that nothing in the place is left for Rojo to
 * delete.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileNodeMap } from "../src/core/nodemap.js";
import { readRbx } from "../src/core/rbx/index.js";
import { type PlaceImportOptions, planImport, surveyPlace } from "../src/core/rbx/placeImport.js";
import { defaultConfig } from "../src/core/schema.js";
import { findPlaceFile, writePlaceImport } from "../src/server/project.js";
import { buildPlace, folder, script, service } from "./rbxfixture.js";

const open = (id: string) => script("Script", "Open", "door:Open()", { UniqueId: { type: 31, value: id.repeat(32) } });

const PLACE = buildPlace([
	service("ServerScriptService", [
		script("Script", "Main", "print('main')"),
		script("Script", "ClientSide", "print('client')", { RunContext: { type: 18, value: 2 } }),
		script("Script", "Off", "print('off')", { Disabled: { type: 2, value: true } }),
	]),
	service("ReplicatedStorage", [
		folder("Shared", [
			script("ModuleScript", "Util", "return {}", {}, [script("ModuleScript", "Inner", "return 1")]),
			{ className: "RemoteEvent", name: "Ping" },
		]),
		folder("Empty"),
		folder("Pkg", [folder("thing@1.2.0", [script("ModuleScript", "Lib", "return 'lib'")])]),
	]),
	service("StarterPlayer", [
		folder("StarterPlayerScripts", [script("LocalScript", "Controls", "print('controls')")], "StarterPlayerScripts"),
	]),
	service("Workspace", [
		folder("Door1", [open("a")], "Model"),
		folder("Door2", [open("b")], "Model"),
		folder("Coin", [script("Script", "Spin", "spin()")], "Part"),
		folder("Stuff", [script("Script", "A", "a()")]),
		folder("stuff", [script("Script", "B", "b()")]),
		folder("Odd", [script("ModuleScript", "Config.server", "return 0")]),
	]),
]);

const options = (over: Partial<PlaceImportOptions> = {}): PlaceImportOptions => ({
	scope: "rojo", dedupe: true, outDir: "src", placeFile: "place.rbxl", name: "Game", ...over,
});

describe("surveying a place", () => {
	const survey = surveyPlace(readRbx(PLACE));
	const why = (name: string) => survey.scripts.find((s) => s.inst.name === name)?.placeOnly;

	it("sorts scripts into those Rojo can sync and those it cannot", () => {
		expect(survey.scripts).toHaveLength(13);
		expect(survey.rojo).toBe(7);
		expect(survey.placeOnly).toBe(6);
		expect(why("Main")).toBeUndefined();
		expect(why("Inner")).toBeUndefined();
		expect(why("Lib")).toBeUndefined();
		expect(why("Controls")).toBeUndefined();
		expect(why("Spin")).toMatch(/inside Part "Coin"/);
		expect(why("A")).toMatch(/shares its name with a sibling/);
		expect(why("Config.server")).toMatch(/ends like a file type Rojo reads/);
	});

	it("counts identical copies", () => {
		expect(survey.duplicated).toBe(1);
		expect(survey.mostCopies).toBe(2);
		expect(survey.placeOnlyDistinct).toBe(5);
	});
});

describe("planning the files", () => {
	const survey = surveyPlace(readRbx(PLACE));

	it("writes Rojo-syncable scripts in Rojo's layout", () => {
		const { files, skipped } = planImport(survey, options());
		expect(files["src/ServerScriptService/Main.server.luau"]).toBe("print('main')");
		expect(files["src/ReplicatedStorage/Shared/Util/init.luau"]).toBe("return {}");
		expect(files["src/ReplicatedStorage/Shared/Util/Inner.luau"]).toBe("return 1");
		expect(files["src/ReplicatedStorage/Pkg/thing@1.2.0/Lib.luau"]).toBe("return 'lib'");
		expect(files["src/StarterPlayer/StarterPlayerScripts/Controls.client.luau"]).toBe("print('controls')");
		expect(Object.keys(files).some((f) => f.startsWith("place/"))).toBe(false);
		expect(skipped).toHaveLength(6);
	});

	it("says in a meta file what a file name cannot", () => {
		const { files } = planImport(survey, options());
		expect(JSON.parse(files["src/ServerScriptService/ClientSide.meta.json"])).toEqual({ properties: { RunContext: "Client" } });
		expect(JSON.parse(files["src/ServerScriptService/Off.meta.json"])).toEqual({ properties: { Disabled: true } });
	});

	it("keeps what the import leaves in a folder", () => {
		const { files } = planImport(survey, options());
		// Shared holds a RemoteEvent the import does not bring out.
		expect(JSON.parse(files["src/ReplicatedStorage/Shared/init.meta.json"])).toEqual({ ignoreUnknownInstances: true });
		// Util's only child is imported, so it needs no meta file.
		expect(files["src/ReplicatedStorage/Shared/Util/init.meta.json"]).toBeUndefined();
		expect(files["src/ReplicatedStorage/Pkg/init.meta.json"]).toBeUndefined();
	});

	it("maps each service to its folder, ignoring what it does not know", () => {
		const { map } = planImport(survey, options());
		const project = JSON.parse(compileNodeMap(map).json);
		expect(project.tree.ServerScriptService).toEqual({ $path: "src/ServerScriptService", $ignoreUnknownInstances: true });
		expect(project.tree.ReplicatedStorage).toEqual({ $path: "src/ReplicatedStorage", $ignoreUnknownInstances: true });
		expect(project.tree.StarterPlayer.StarterPlayerScripts).toEqual({
			$className: "StarterPlayerScripts",
			$path: "src/StarterPlayer/StarterPlayerScripts",
			$ignoreUnknownInstances: true,
		});
		expect(project.tree.Workspace).toBeUndefined();
		expect(compileNodeMap(map).ok).toBe(true);
	});

	it("merges identical place-only scripts into one file", () => {
		const { files, links } = planImport(survey, options({ scope: "all" }));
		expect(files["place/Shared/Open.server.luau"]).toBe("door:Open()");
		const shared = links.scripts.find((l) => l.file === "place/Shared/Open.server.luau")!;
		expect(shared.instances.map((i) => i.path.join("."))).toEqual(["Workspace.Door1.Open", "Workspace.Door2.Open"]);
		expect(shared.instances.map((i) => i.id)).toEqual(["a".repeat(32), "b".repeat(32)]);
		expect(files["place/Workspace/Coin/Spin.server.luau"]).toBe("spin()");
		// Two folders whose names differ only by case stay apart on disk.
		expect(files["place/Workspace/Stuff/A.server.luau"]).toBe("a()");
		expect(files["place/Workspace/stuff (2)/B.server.luau"]).toBe("b()");
	});

	it("names merged scripts that share a name for where their copies live", () => {
		const lamp = () => script("Script", "Script", "glow()");
		const door = () => script("Script", "Script", "open()");
		const place = buildPlace([
			service("Workspace", [
				folder("Street Light", [lamp()], "Model"),
				folder("Street Light", [lamp()], "Model"),
				folder("Door", [door()], "Model"),
				folder("Door", [door()], "Model"),
			]),
		]);
		const { files } = planImport(surveyPlace(readRbx(place)), options({ scope: "all" }));
		expect(files["place/Shared/Script (Street Light).server.luau"]).toBe("glow()");
		expect(files["place/Shared/Script (Door).server.luau"]).toBe("open()");
	});

	it("keeps copies apart when asked", () => {
		const { files } = planImport(survey, options({ scope: "all", dedupe: false }));
		expect(files["place/Workspace/Door1/Open.server.luau"]).toBe("door:Open()");
		expect(files["place/Workspace/Door2/Open.server.luau"]).toBe("door:Open()");
		expect(files["place/Shared/Open.server.luau"]).toBeUndefined();
	});

	it("links every file to the place", () => {
		const { files, links } = planImport(survey, options({ scope: "all" }));
		expect(JSON.parse(files[".roswaal/place.json"]).place).toBe("place.rbxl");
		expect(links.scripts.reduce((n, l) => n + l.instances.length, 0)).toBe(13);
		for (const link of links.scripts) expect(files[link.file]).toBeDefined();
	});
});

describe("writing the project", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("writes the files, the config and the Rojo project", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-import-"));
		await writeFile(path.join(root, "Game.rbxl"), PLACE);
		const plan = planImport(surveyPlace(readRbx(PLACE)), options({ placeFile: "Game.rbxl" }));
		const outcome = await writePlaceImport(root, plan.files, "Game.rbxl");
		expect(outcome.written).toBe(true);
		const config = JSON.parse(await readFile(path.join(root, "roswaal.json"), "utf8"));
		expect(config.place).toBe("Game.rbxl");
		const project = JSON.parse(await readFile(path.join(root, "default.project.json"), "utf8"));
		expect(project.tree.ServerScriptService.$ignoreUnknownInstances).toBe(true);
		expect(await readFile(path.join(root, "src/ServerScriptService/Main.server.luau"), "utf8")).toBe("print('main')");
		expect(await findPlaceFile(root, config)).toBe("Game.rbxl");
	});
});

describe("finding a project's place", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("prefers the setting, then place.rbxl, then the first by name", async () => {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-place-"));
		const config = defaultConfig();
		expect(await findPlaceFile(root, config)).toBeNull();
		await writeFile(path.join(root, "b.rbxlx"), "");
		await writeFile(path.join(root, "a.rbxl"), "");
		expect(await findPlaceFile(root, config)).toBe("a.rbxl");
		await writeFile(path.join(root, "place.rbxl"), "");
		expect(await findPlaceFile(root, config)).toBe("place.rbxl");
		expect(await findPlaceFile(root, { ...config, place: "b.rbxlx" })).toBe("b.rbxlx");
		expect(await findPlaceFile(root, { ...config, place: "missing.rbxl" })).toBeNull();
	});
});
