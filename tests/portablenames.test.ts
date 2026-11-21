/**
 * RAS-0013: names Windows reads as something else are never created, and the
 * guards that refuse a place by its name see it as a case-insensitive disk
 * does.
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { nameProblem, pathKey, pathProblem } from "../src/core/portableNames.js";
import { createFolder, renameEntry } from "../src/server/entries.js";
import { fs } from "../src/server/host.js";
import { safeJoin } from "../src/server/paths.js";
import { openProject } from "../src/server/project.js";

describe("names Roswaal will not make", () => {
	it("refuses device names, with or without an extension", () => {
		for (const name of ["con", "CON.luau", "nul.txt", "com1", "LPT9.lua", "conin$", "aux.tar.gz"])
			expect(nameProblem(name, false), name).toMatch(/device/);
	});

	it("refuses streams and trailing dots and spaces", () => {
		expect(nameProblem("x.luau:hidden", false)).toMatch(/colon/);
		expect(nameProblem("src.", false)).toMatch(/dot or a space/);
		expect(nameProblem("Tank ", false)).toMatch(/dot or a space/);
	});

	it("refuses short names on Windows only", () => {
		expect(nameProblem("SOURCE~1", true)).toMatch(/short name/);
		expect(nameProblem("SOURCE~1", false)).toBeNull();
	});

	it("lets ordinary names through, dots and versions included", () => {
		for (const name of [
			"Main.server.luau",
			"console",
			"connect.luau",
			"sleitnick_signal@2.0.3",
			"..",
			".roswaal",
		])
			expect(nameProblem(name, true), name).toBeNull();
		expect(pathProblem(".roswaal/scripts/ReplicatedStorage/Tank.nodescript", true)).toBeNull();
		expect(pathProblem("src/ReplicatedStorage/con.luau", false)).toMatch(/device/);
	});

	it("judges a save's temporary copy as the file it becomes", () => {
		expect(pathProblem("scripts/aux.nodescript.k3j9x0a2.tmp", false)).toMatch(/^"aux.nodescript"/);
		expect(pathProblem("scripts/Main.nodescript.k3j9x0a2.tmp", false)).toBeNull();
		// Only the save's own suffix: a file of that name made on purpose is judged whole.
		expect(pathProblem("scripts/notes.tmp", false)).toBeNull();
	});

	it("keys a path as a case-insensitive disk sees it", () => {
		expect(pathKey("SRC./Shared /x.luau")).toBe("src/shared/x.luau");
		expect(pathKey("src/../x")).toBe("src/../x");
	});
});

describe("a project on disk", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function project() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-names-"));
		await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
		await mkdir(path.join(root, "src"), { recursive: true });
		await mkdir(path.join(root, ".roswaal/scripts"), { recursive: true });
		return openProject(root);
	}

	it("will not write, make or rename to a device name or a stream", async () => {
		const opened = await project();
		await expect(fs.writeFile(safeJoin(opened.root, "con.luau"), "x", "utf8")).rejects.toThrow(
			/device/,
		);
		await expect(fs.mkdir(safeJoin(opened.root, "Tank."), { recursive: true })).rejects.toThrow(
			/dot/,
		);
		await writeFile(path.join(root, "a.luau"), "x");
		await expect(
			fs.rename(safeJoin(opened.root, "a.luau"), safeJoin(opened.root, "a.luau:hidden")),
		).rejects.toThrow(/colon/);
		expect((await readdir(root)).sort()).toEqual([".roswaal", "a.luau", "roswaal.json", "src"]);
	});

	it("names the graph a save refuses, not its temporary copy (1.0.1)", async () => {
		const opened = await project();
		const { writeTextAtomically } = await import("../src/server/files.js");
		const refused = writeTextAtomically(
			safeJoin(opened.root, ".roswaal/scripts/aux.nodescript"),
			"{}",
		);
		await expect(refused).rejects.toThrow('"aux.nodescript" is a name Windows keeps for a device');
		await expect(refused).rejects.not.toThrow(/\.tmp/);
		expect(await readdir(path.join(root, ".roswaal/scripts"))).toEqual([]);
	});

	it("refuses SRC/ and src./ as it refuses src/, the generated files' folder", async () => {
		const opened = await project();
		await expect(createFolder(opened, "SRC/New")).rejects.toThrow(/generated files/);
		await expect(createFolder(opened, "src./New")).rejects.toThrow(/generated files/);
		await writeFile(path.join(root, "src/x.luau"), "x");
		await expect(renameEntry(opened, "SRC/x.luau", "y.luau")).rejects.toThrow(/generated files/);
	});
});
