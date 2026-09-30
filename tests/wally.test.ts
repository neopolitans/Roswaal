/**
 * Wally in a project: what `wally.toml` lists, where each package's thunk
 * sends a require, and how the project tree shows both. The layout is made
 * up; it is the one `wally install` writes.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { indexVersion, parseWallyToml, thunkTarget } from "../src/core/wally.js";
import { buildTree, collectProject, openProject, type TreeEntry } from "../src/server/project.js";

const TOML = [
	"[package]",
	'name = "someone/orchard"',
	'version = "0.1.0"',
	"",
	"[dependencies]",
	'Signal = "sleitnick/signal@2.0.0" # events',
	'Sift = "csqrl/sift@0.0.11"',
	"",
	"[server-dependencies]",
	'Store = "someone/store@1.0.0"',
	"",
	"[dev-dependencies]",
	'TestEZ = "roblox/testez@0.4.1"',
].join("\n");

describe("reading wally.toml", () => {
	it("lists each table's dependencies by the name they are required by", () => {
		expect(parseWallyToml(TOML)).toEqual([
			{ alias: "Signal", realm: "shared", spec: "sleitnick/signal@2.0.0" },
			{ alias: "Sift", realm: "shared", spec: "csqrl/sift@0.0.11" },
			{ alias: "Store", realm: "server", spec: "someone/store@1.0.0" },
			{ alias: "TestEZ", realm: "dev", spec: "roblox/testez@0.4.1" },
		]);
	});

	it("follows a thunk to the names below script.Parent", () => {
		expect(thunkTarget('return require(script.Parent._Index["sleitnick_signal@2.0.0"]["signal"])\n'))
			.toEqual(["_Index", "sleitnick_signal@2.0.0", "signal"]);
		expect(thunkTarget("return {}")).toBeUndefined();
		expect(indexVersion("sleitnick_signal@2.0.0")).toBe("2.0.0");
	});
});

describe("Wally in the project tree", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	async function project() {
		root = await mkdtemp(path.join(os.tmpdir(), "roswaal-wally-"));
		const put = async (rel: string, text: string) => {
			await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
			await writeFile(path.join(root, rel), text);
		};
		await put("roswaal.json", JSON.stringify({ schemaVersion: 1 }));
		await put("wally.toml", TOML);
		// A package with its module at the top of its folder.
		await put("Packages/Signal.lua", 'return require(script.Parent._Index["sleitnick_signal@2.0.3"]["signal"])\n');
		await put("Packages/_Index/sleitnick_signal@2.0.3/signal/init.luau", "return {}\n");
		// One that is a Rojo project of its own, its module under src/.
		await put("Packages/Sift.lua", 'return require(script.Parent._Index["csqrl_sift@0.0.11"]["sift"])\n');
		await put("Packages/_Index/csqrl_sift@0.0.11/sift/default.project.json", '{ "name": "sift", "tree": { "$path": "src" } }');
		await put("Packages/_Index/csqrl_sift@0.0.11/sift/src/init.lua", "return {}\n");
		await put("src/main.server.luau", "print('hi')\n");
		// Store and TestEZ are listed, not installed.
		return openProject(root);
	}

	it("lists wally.toml's packages with their versions and modules", async () => {
		const tree = await buildTree(await project());
		const wally = tree.find((e) => e.kind === "wally")!;
		expect(wally.children!.map((p: TreeEntry) => [p.name, p.version ?? null, p.target ?? null, p.missing ?? false])).toEqual([
			["Signal", "2.0.3", "Packages/_Index/sleitnick_signal@2.0.3/signal/init.luau", false],
			["Sift", "0.0.11", "Packages/_Index/csqrl_sift@0.0.11/sift/src/init.lua", false],
			["Store", null, null, true],
			["TestEZ", null, null, true],
		]);
	});

	it("shows Packages as Wally's folder, and leaves it out of the export", async () => {
		const opened = await project();
		const packages = (await buildTree(opened)).find((e) => e.name === "Packages")!;
		expect(packages.role).toBe("packages");
		const exported = Object.keys(await collectProject(opened));
		expect(exported).toContain("src/main.server.luau");
		expect(exported.some((file) => file.startsWith("Packages/"))).toBe(false);
	});
});
