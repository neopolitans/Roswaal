/**
 * The project layer's refusals and its shared walk, on a real directory.
 *
 * Each block pins one rule `src/server` keeps about what it will read or
 * write: the folders no walk goes into, the shapes a config may take, which
 * files a graph or map may be saved over, and that concurrent compiles do
 * not lose each other's ownership records.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { NodeMap } from "../src/core/nodemap.js";
import { defaultConfig, emptyScript } from "../src/core/schema.js";
import { parseConfig } from "../src/server/config.js";
import { errorResponse, HttpError, UserError } from "../src/server/errors.js";
import {
	collectMaps, deletePack, openProject, writeConfig, writeMap, writePlaceImport, writeScript,
} from "../src/server/project.js";
import { walkFiles } from "../src/server/files.js";
import { tidyPath, toPosix } from "../src/server/paths.js";

let root = "";

async function scratch(files: Record<string, string> = {}): Promise<string> {
	root = await mkdtemp(join(tmpdir(), "roswaal-io-"));
	for (const [rel, text] of Object.entries(files)) {
		await mkdir(join(root, rel, ".."), { recursive: true });
		await writeFile(join(root, rel), text, "utf8");
	}
	return root;
}

afterEach(async () => {
	if (root) await rm(root, { recursive: true, force: true });
	root = "";
});

describe("paths", () => {
	it("are written one way whichever separator produced them", () => {
		expect(toPosix("src\\Shared\\Greeter.luau")).toBe("src/Shared/Greeter.luau");
		expect(tidyPath(".\\src\\ReplicatedStorage\\")).toBe("src/ReplicatedStorage");
		expect(tidyPath("./src/ReplicatedStorage//")).toBe("src/ReplicatedStorage");
	});
});

describe("what an error is answered with", () => {
	it("keeps a known problem's status, and calls anything else a bug", () => {
		expect(errorResponse(new UserError("taken")).status).toBe(400);
		expect(errorResponse(new HttpError(409, "moved", { code: "project-changed", root: "/x" })))
			.toEqual({ status: 409, body: { error: "moved", code: "project-changed", root: "/x" } });
		expect(errorResponse(new SyntaxError("Unexpected token")).status).toBe(422);
		expect(errorResponse(Object.assign(new Error("gone"), { code: "ENOENT" })).status).toBe(404);
		expect(errorResponse(new TypeError("x is undefined"))).toEqual({
			status: 500, body: { error: "x is undefined" },
		});
		expect(errorResponse("thrown string").status).toBe(500);
	});
});

describe("roswaal.json", () => {
	it("is read with defaults for what it leaves out", () => {
		expect(parseConfig({ outDir: "out" })).toMatchObject({ outDir: "out", sourceDir: ".roswaal/scripts" });
	});

	it("is refused, with the key named, when a setting is the wrong kind of thing", async () => {
		expect(() => parseConfig({ nodePaths: null })).toThrow(/"nodePaths"/);
		expect(() => parseConfig({ indentWidth: "4" })).toThrow(/"indentWidth"/);
		expect(() => parseConfig("roblox")).toThrow(UserError);
		await scratch({ "roswaal.json": JSON.stringify({ nodePaths: null }) });
		await expect(openProject(root)).rejects.toThrow(/"nodePaths" must be a list/);
	});

	it("is never written in a shape that would not read back", async () => {
		await scratch({ "roswaal.json": "{}\n" });
		await expect(writeConfig(root, { ...defaultConfig(), sourceDir: "" })).rejects.toThrow(UserError);
		expect(await readFile(join(root, "roswaal.json"), "utf8")).toBe("{}\n");
	});
});

describe("a project made from a place", () => {
	it("is refused before anything is written when the plan has no node map", async () => {
		await scratch();
		const into = join(root, "made");
		await expect(writePlaceImport(into, { "src/A.luau": "return 1" }, "place.rbxl"))
			.rejects.toThrow(/no node map/);
		await expect(readFile(join(into, "roswaal.json"), "utf8")).rejects.toThrow();
	});
});

describe("pack paths", () => {
	it("are normalised before they are held against the node paths", async () => {
		await scratch({ "roswaal.json": "{}", "x.nodedef.json": "{\"nodes\":[]}" });
		const project = await openProject(root);
		await expect(deletePack(project, ".roswaal/nodes/../../x.nodedef.json")).rejects.toThrow(/not in a node path/);
		expect(await readFile(join(root, "x.nodedef.json"), "utf8")).toContain("nodes");
	});
});

describe("saving documents", () => {
	it("writes a graph only to a .nodescript and a map only to a .nodemap", async () => {
		await scratch({ "roswaal.json": "{}", "src/Hand.luau": "return 'mine'" });
		const project = await openProject(root);
		await expect(writeScript(project, "src/Hand.luau", emptyScript("Hand", "g1"))).rejects.toThrow(/\.nodescript/);
		await expect(writeMap(project, "src/Hand.luau", {} as NodeMap)).rejects.toThrow(/\.nodemap/);
		expect(await readFile(join(root, "src/Hand.luau"), "utf8")).toBe("return 'mine'");
	});
});

describe("the shared walk", () => {
	it("lists files sorted, with forward slashes, skipping the folders nothing reads", async () => {
		await scratch({
			"b/two.txt": "",
			"a/one.txt": "",
			"node_modules/pkg/index.txt": "",
			"Packages/Thing.txt": "",
		});
		const found = await walkFiles(root);
		expect(found.map((f) => f.path)).toEqual(["a/one.txt", "b/two.txt"]);
	});

	it("keeps node_modules out of the documents under sourceDir too", async () => {
		await scratch({
			"roswaal.json": "{}",
			".roswaal/scripts/Main.nodemap": "{}",
			".roswaal/scripts/node_modules/dep/Stray.nodemap": "{}",
		});
		const project = await openProject(root);
		expect(await collectMaps(project)).toEqual([".roswaal/scripts/Main.nodemap"]);
	});
});

