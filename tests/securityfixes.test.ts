/**
 * The fixes from the file-access review (Nov 2026): what Delete refuses (F1),
 * a file opened and then checked again (F3), and place and rojoProject kept
 * inside the project from the moment roswaal.json is read (F8), and the
 * daemon's key (F2), whose routes are tried in daemon.test.ts and
 * daemonsocket.test.ts. F4 is in mapmove.test.ts, F5 in getreadonly.test.ts.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultConfig } from "../src/core/schema.js";
import { parseConfig } from "../src/server/config.js";
import { deleteEntry } from "../src/server/entries.js";
import { fs } from "../src/server/host.js";
import { findPlaceFile } from "../src/server/place.js";
import { openProject } from "../src/server/project.js";

let root = "";

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "roswaal-fixes-"));
	await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	for (const dir of [".git", "Packages", "src/Shared", ".roswaal/backups", ".roswaal/scripts"])
		await mkdir(path.join(root, dir), { recursive: true });
	await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
	await writeFile(path.join(root, "Packages", "Thing.lua"), "return {}\n");
	await writeFile(path.join(root, "src", "Shared", "Old.luau"), "return 1\n");
	await writeFile(path.join(root, ".roswaal", "backups", "place.rbxl.bak"), "");
	await writeFile(path.join(root, ".roswaal", "scripts", "Main.nodescript"), "{}");
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const exists = (rel: string) =>
	stat(path.join(root, rel)).then(
		() => true,
		() => false,
	);

describe("Delete (F1)", () => {
	it.each([
		[".git", "another tool"],
		[".git/HEAD", "another tool"],
		["Packages/Thing.lua", "another tool"],
		["roswaal.json", "settings"],
		[".roswaal/backups", "copies kept"],
		[".roswaal/backups/place.rbxl.bak", "copies kept"],
		["src", "where the project's Luau is written"],
	])("refuses %s", async (target, says) => {
		const project = await openProject(root);
		await expect(deleteEntry(project, target)).rejects.toThrow(says);
		expect(await exists(target)).toBe(true);
	});

	it("still deletes a graph, and a generated file", async () => {
		const project = await openProject(root);
		await deleteEntry(project, ".roswaal/scripts/Main.nodescript");
		await deleteEntry(project, "src/Shared/Old.luau");
		expect(await exists(".roswaal/scripts/Main.nodescript")).toBe(false);
		expect(await exists("src/Shared/Old.luau")).toBe(false);
	});
});

describe("a file opened and checked again (F3)", () => {
	it("writes over a longer file without leaving its tail", async () => {
		const file = path.join(root, "src", "Shared", "Old.luau");
		await writeFile(file, "a much longer file than what replaces it\n");
		await openProject(root);
		await fs.writeFile(file, "short\n", "utf8");
		expect(await readFile(file, "utf8")).toBe("short\n");
	});

	it("reads text and bytes, and makes a file that is not there", async () => {
		await openProject(root);
		const made = path.join(root, "src", "Shared", "New.luau");
		await fs.writeFile(made, "return 2\n", "utf8");
		expect(await fs.readFile(made, "utf8")).toBe("return 2\n");
		expect([...(await fs.readFile(made))].length).toBe(9);
	});
});

describe("place and rojoProject (F8)", () => {
	it.each(["../elsewhere.rbxl", "/etc/passwd", "C:/Users/x.rbxl", "places/../../out.rbxl", ""])(
		"refuse %j as soon as roswaal.json is read",
		(place) => {
			expect(() => parseConfig({ schemaVersion: 1, place })).toThrow(/place/);
			expect(() => parseConfig({ schemaVersion: 1, rojoProject: place })).toThrow(/rojoProject/);
		},
	);

	it("take a file inside the project", () => {
		expect(parseConfig({ schemaVersion: 1, place: "places/game.rbxl" }).place).toBe(
			"places/game.rbxl",
		);
	});

	it("find no place outside the project, even from a config made in code", async () => {
		await writeFile(path.join(root, "..", "outside.rbxl"), "");
		const config = { ...defaultConfig(), place: "../outside.rbxl" };
		expect(await findPlaceFile(root, config)).toBeNull();
		await rm(path.join(root, "..", "outside.rbxl"), { force: true });
	});
});

describe("the daemon's key (F2)", () => {
	it("is new each start, kept per port, readable by this account only", async () => {
		const { keepToken, newToken, readToken, tokenFileFor } = await import("../src/server/token.js");
		const home = path.join(root, "home");
		const file = tokenFileFor(4471, home);
		expect(file).toBe(path.join(home, ".roswaal", "daemon-4471.token"));
		expect(tokenFileFor(4480, home)).not.toBe(file);
		const first = newToken();
		const second = newToken();
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(second).not.toBe(first);
		keepToken(file, first);
		expect(readToken(file)).toBe(first);
		keepToken(file, second);
		expect(readToken(file)).toBe(second);
		if (process.platform !== "win32") {
			expect((await stat(file)).mode & 0o777).toBe(0o600);
			expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);
		}
	});

	it("is read from the header and nothing else", async () => {
		const { isToken, tokenOf } = await import("../src/server/token.js");
		expect(tokenOf({ "x-roswaal-token": "abc" })).toBe("abc");
		expect(tokenOf({ "x-roswaal-token": "" })).toBeUndefined();
		expect(tokenOf({ cookie: "roswaal_token=abc" })).toBeUndefined();
		expect(isToken("abc", "abc")).toBe(true);
		expect(isToken("abd", "abc")).toBe(false);
		expect(isToken("ab", "abc")).toBe(false);
		expect(isToken(undefined, "abc")).toBe(false);
	});
});
