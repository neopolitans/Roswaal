/**
 * A project from nothing, since 0.148.0: what `roswaal new`, the daemon's
 * start page and the web editor's New project all write.
 *
 * What matters is that it is a working project the moment it exists: its node
 * map writes the Rojo project `rojo init` would, its first graph compiles, and
 * its place opens in Studio and takes the project's scripts on export.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compile } from "../src/core/compiler/index.js";
import { NEW_PLACE_FILE, newProject, projectNameProblem } from "../src/core/newProject.js";
import { compileNodeMap, type NodeMap } from "../src/core/nodemap.js";
import { createRegistry } from "../src/core/nodes/index.js";
import {
	BASEPLATE,
	BLANK_PLACE_SERVICES,
	blankPlaceXml,
	SPAWN,
} from "../src/core/rbx/blankPlace.js";
import { readRbx } from "../src/core/rbx/index.js";
import type { NodeScript } from "../src/core/schema.js";
import { createProject } from "../src/server/newProject.js";
import { exportPlace } from "../src/server/place.js";

const counter = () => {
	let n = 0;
	return () => `id-${++n}`;
};

describe("a new Roblox project", () => {
	const made = newProject({ name: "My Game", target: "roblox", place: true }, counter());

	it("writes a node map, a first graph and a place", () => {
		expect(Object.keys(made.files).sort()).toEqual(
			[
				".gitignore",
				".roswaal/scripts/Game.nodemap",
				".roswaal/scripts/ServerScriptService/Server/Main.nodescript",
				NEW_PLACE_FILE,
			].sort(),
		);
		expect(made.config.target).toBe("roblox");
		expect(made.config.place).toBe(NEW_PLACE_FILE);
		expect(made.config.rojoProject).toBe("default.project.json");
	});

	/** The three folders `rojo init` makes, where it puts them. */
	it("maps Rojo's three folders", () => {
		const map = JSON.parse(made.files[".roswaal/scripts/Game.nodemap"]!) as NodeMap;
		const compiled = compileNodeMap(map);
		expect(compiled.ok).toBe(true);
		// biome-ignore lint/suspicious/noExplicitAny: a Rojo tree, read by key.
		const project = JSON.parse(compiled.json) as { name: string; tree: Record<string, any> };
		expect(project.name).toBe("My Game");
		expect(project.tree.ServerScriptService.Server.$path).toBe("src/ServerScriptService/Server");
		expect(project.tree.ReplicatedStorage.Shared.$path).toBe("src/ReplicatedStorage/Shared");
		expect(project.tree.StarterPlayer.StarterPlayerScripts.Client.$path).toBe(
			"src/StarterPlayer/StarterPlayerScripts/Client",
		);
	});

	it("starts with a graph that compiles to Hello world", () => {
		const main = JSON.parse(
			made.files[".roswaal/scripts/ServerScriptService/Server/Main.nodescript"]!,
		) as NodeScript;
		const result = compile(main, createRegistry());
		expect(result.ok).toBe(true);
		expect(result.code).toContain('print("Hello world")');
	});

	it("leaves the place out when asked", () => {
		const bare = newProject({ name: "Bare", target: "roblox", place: false }, counter());
		expect(bare.files[NEW_PLACE_FILE]).toBeUndefined();
		expect(bare.config.place).toBeUndefined();
	});
});

describe("a new Lune project", () => {
	const made = newProject({ name: "tool", target: "lune", place: true }, counter());

	it("is one main graph, with no map and no place", () => {
		expect(Object.keys(made.files).sort()).toEqual([
			".gitignore",
			".roswaal/scripts/main.nodescript",
		]);
		expect(made.config.target).toBe("lune");
		expect(made.config.place).toBeUndefined();
	});
});

describe("a project's name", () => {
	it("is letters, numbers, spaces, dots, dashes and underscores", () => {
		expect(projectNameProblem("My Game")).toBeNull();
		expect(projectNameProblem("obby_2.0-final")).toBeNull();
		expect(projectNameProblem("")).toMatch(/needs a name/);
		expect(projectNameProblem(" padded")).toMatch(/space/);
		expect(projectNameProblem("a/b")).toMatch(/letters/);
		expect(projectNameProblem("..")).toMatch(/not a name/);
		expect(projectNameProblem("x".repeat(65))).toMatch(/64/);
	});
});

describe("the place a new project starts with", () => {
	const doc = readRbx(new TextEncoder().encode(blankPlaceXml()));

	it("has the usual services, in Explorer's order", () => {
		expect(doc.roots.map((root) => root.className)).toEqual([...BLANK_PLACE_SERVICES]);
		expect(doc.undecoded.size).toBe(0);
		const player = doc.roots.find((root) => root.className === "StarterPlayer")!;
		expect(player.children.map((child) => child.className)).toEqual([
			"StarterPlayerScripts",
			"StarterCharacterScripts",
		]);
	});

	/** A 512-stud baseplate with its top at 0, and a 12-stud spawn standing on it. */
	it("has a baseplate and a spawn, where and as big as they are meant to be", () => {
		const workspace = doc.roots.find((root) => root.className === "Workspace")!;
		const [ground, spawn] = workspace.children;
		expect(ground!.className).toBe("Part");
		expect(ground!.name).toBe(BASEPLATE.name);
		expect(ground!.props.get("size")?.value).toEqual([512, 16, 512]);
		expect((ground!.props.get("CFrame")?.value as { position: number[] }).position).toEqual([
			0, -8, 0,
		]);
		expect(ground!.props.get("Anchored")?.value).toBe(true);
		expect(spawn!.className).toBe("SpawnLocation");
		expect(spawn!.props.get("size")?.value).toEqual([...SPAWN.size]);
		expect((spawn!.props.get("CFrame")?.value as { position: number[] }).position).toEqual([
			0, 0.5, 0,
		]);
	});

	it("is written the same way every time", () => {
		expect(blankPlaceXml()).toBe(blankPlaceXml());
	});
});

describe("making a project on disk", () => {
	const scratch = () => fs.mkdtemp(path.join(os.tmpdir(), "roswaal-new-"));

	it("compiles it, so it opens as a working project", async () => {
		const base = await scratch();
		try {
			const root = path.join(base, "My Game");
			await createProject(root, { name: "My Game", target: "roblox", place: true }, counter());
			const rojo = JSON.parse(await fs.readFile(path.join(root, "default.project.json"), "utf8"));
			expect(rojo.name).toBe("My Game");
			const main = await fs.readFile(
				path.join(root, "src/ServerScriptService/Server/Main.server.luau"),
				"utf8",
			);
			expect(main).toContain('print("Hello world")');
			// The folders Rojo syncs exist, so `rojo serve` finds every $path.
			for (const folder of [
				"src/ReplicatedStorage/Shared",
				"src/StarterPlayer/StarterPlayerScripts/Client",
			]) {
				expect((await fs.stat(path.join(root, folder))).isDirectory()).toBe(true);
			}
		} finally {
			await fs.rm(base, { recursive: true, force: true });
		}
	});

	/** Export adds what the place does not have yet: the Server folder and Main. */
	it("exports its first script into its place", async () => {
		const base = await scratch();
		try {
			const project = await createProject(
				path.join(base, "Obby"),
				{ name: "Obby", target: "roblox", place: true },
				counter(),
			);
			const exported = await exportPlace(project);
			const doc = readRbx(exported!.bytes);
			const sss = doc.roots.find((root) => root.className === "ServerScriptService")!;
			const server = sss.children.find((child) => child.name === "Server")!;
			expect(server.children.map((child) => `${child.className} ${child.name}`)).toEqual([
				"Script Main",
			]);
		} finally {
			await fs.rm(base, { recursive: true, force: true });
		}
	});

	it("refuses a folder that has files in it", async () => {
		const base = await scratch();
		try {
			await fs.writeFile(path.join(base, "keep.txt"), "mine", "utf8");
			await expect(
				createProject(base, { name: "x", target: "roblox", place: false }),
			).rejects.toThrow(/already has files in it/);
			expect(await fs.readdir(base)).toEqual(["keep.txt"]);
		} finally {
			await fs.rm(base, { recursive: true, force: true });
		}
	});
});

describe("the spawn, since 0.148.1", () => {
	/** Its bottom face is the baseplate's top face: standing on it, not floating. */
	it("stands on the baseplate", () => {
		const top = BASEPLATE.position[1] + BASEPLATE.size[1] / 2;
		const bottom = SPAWN.position[1] - SPAWN.size[1] / 2;
		expect(bottom).toBe(top);
	});
});
