/**
 * The project layer's refusals and its shared walk, on a real directory.
 *
 * Each block pins one rule `src/server` keeps about what it will read or
 * write: the folders no walk goes into, the shapes a config may take, which
 * files a graph or map may be saved over, and that concurrent compiles do
 * not lose each other's ownership records.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectMaps, openProject } from "../src/server/project.js";
import { walkFiles } from "../src/server/files.js";

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

