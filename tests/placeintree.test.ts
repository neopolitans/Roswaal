/**
 * A project's places and models in the tree, a place added to a project that
 * has none, and the graph folders a project's synced folders want, made as it
 * opens.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readRbx } from "../src/core/rbx/index.js";
import { createProject } from "../src/server/newProject.js";
import { ApiSession } from "../src/server/routes.js";
import type { TreeEntry } from "../src/server/tree.js";

const counter = () => {
	let n = 0;
	return () => `id-${++n}`;
};

const flat = (entries: TreeEntry[]): TreeEntry[] =>
	entries.flatMap((e) => [e, ...flat(e.children ?? [])]);

let base = "";
afterEach(async () => {
	if (base) await fs.rm(base, { recursive: true, force: true });
	base = "";
});

async function made(place: boolean) {
	base = await fs.mkdtemp(path.join(os.tmpdir(), "roswaal-tree-"));
	const root = path.join(base, "Game");
	await createProject(root, { name: "Game", target: "roblox", place }, counter());
	const session = new ApiSession({});
	await session.openAt(root);
	return { root, session };
}

describe("places and models in the tree", () => {
	it("lists the place and a model, and leaves the property editor's backups out", async () => {
		const { root, session } = await made(true);
		await fs.mkdir(path.join(root, "assets"), { recursive: true });
		await fs.writeFile(path.join(root, "assets", "Tank.rbxm"), "");
		await fs.mkdir(path.join(root, ".roswaal", "backups"), { recursive: true });
		await fs.copyFile(
			path.join(root, "place.rbxl"),
			path.join(root, ".roswaal", "backups", "place.1.rbxl"),
		);
		const { tree } = (await session.handle("GET", "/tree")) as { tree: TreeEntry[] };
		const all = flat(tree);
		expect(all.find((e) => e.path === "place.rbxl")?.kind).toBe("place");
		expect(all.find((e) => e.path === "assets/Tank.rbxm")?.kind).toBe("model");
		expect(all.some((e) => e.path.startsWith(".roswaal/backups"))).toBe(false);
	});
});

describe("adding a place", () => {
	it("writes the place a new project starts with, and only once", async () => {
		const { root, session } = await made(false);
		expect(((await session.handle("GET", "/tree")) as { place: string | null }).place).toBeNull();
		expect(await session.handle("POST", "/place/new", {})).toEqual({ file: "place.rbxl" });
		const doc = readRbx(await fs.readFile(path.join(root, "place.rbxl")));
		expect(doc.roots.map((r) => r.className)).toContain("Workspace");
		expect(((await session.handle("GET", "/tree")) as { place: string | null }).place).toBe(
			"place.rbxl",
		);
		await expect(session.handle("POST", "/place/new", {})).rejects.toMatchObject({ status: 409 });
	});
});

describe("graph folders for a map's synced folders", () => {
	it("are made as a project opens, for the synced folders on disk", async () => {
		const { root } = await made(false);
		// As a project imported from Rojo has it: the map and its folders, no graph folders.
		await fs.rm(path.join(root, ".roswaal", "scripts", "ReplicatedStorage"), { recursive: true });
		await fs.rm(path.join(root, ".roswaal", "scripts", "StarterPlayer"), { recursive: true });
		await fs.rm(path.join(root, "src", "StarterPlayer"), { recursive: true });
		const session = new ApiSession({});
		await session.openAt(root);
		const has = (rel: string) =>
			fs.stat(path.join(root, rel)).then(
				() => true,
				() => false,
			);
		expect(await has(".roswaal/scripts/ReplicatedStorage/Shared")).toBe(true);
		// Its output folder is gone, so its graph folder is not made: that is the map's to report.
		expect(await has(".roswaal/scripts/StarterPlayer/StarterPlayerScripts/Client")).toBe(false);
		expect(await has("src/StarterPlayer")).toBe(false);
	});
});

describe("importing a place file", () => {
	const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

	it("keeps it under its own name, as the project's place", async () => {
		const { root, session } = await made(false);
		const { blankPlaceBytes } = await import("../src/core/rbx/blankPlace.js");
		const data = encode(blankPlaceBytes());
		expect(
			await session.handle("POST", "/place/import", { body: { fileName: "Lobby.rbxl", data } }),
		).toEqual({
			file: "Lobby.rbxl",
		});
		expect(readRbx(await fs.readFile(path.join(root, "Lobby.rbxl"))).roots.length).toBeGreaterThan(
			0,
		);
		expect(((await session.handle("GET", "/tree")) as { place: string | null }).place).toBe(
			"Lobby.rbxl",
		);
		await expect(
			session.handle("POST", "/place/import", { body: { fileName: "Lobby.rbxl", data } }),
		).rejects.toMatchObject({ status: 409 });
	});

	it("is written at the place roswaal.json names, in that format", async () => {
		const { root, session } = await made(false);
		const { blankPlaceBytes } = await import("../src/core/rbx/blankPlace.js");
		await session.handle("PUT", "/project/config", {
			body: {
				...JSON.parse(await fs.readFile(path.join(root, "roswaal.json"), "utf8")),
				place: "game.rbxlx",
			},
		});
		const data = encode(blankPlaceBytes());
		expect(
			await session.handle("POST", "/place/import", { body: { fileName: "Lobby.rbxl", data } }),
		).toEqual({
			file: "game.rbxlx",
		});
		expect((await fs.readFile(path.join(root, "game.rbxlx"), "utf8")).trimStart()).toMatch(
			/^<roblox/,
		);
	});

	it("refuses what is not a place, before writing anything", async () => {
		const { root, session } = await made(false);
		const junk = encode(new TextEncoder().encode("not a place"));
		await expect(
			session.handle("POST", "/place/import", { body: { fileName: "Lobby.rbxl", data: junk } }),
		).rejects.toThrow(/could not be read/);
		await expect(
			session.handle("POST", "/place/import", { body: { fileName: "Tank.rbxm", data: junk } }),
		).rejects.toThrow(/choose a \.rbxl or \.rbxlx/);
		expect(await fs.readdir(root)).not.toContain("Lobby.rbxl");
	});
});
