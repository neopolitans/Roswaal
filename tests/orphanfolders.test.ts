/**
 * Removing a stale output takes the folders it leaves empty with it.
 *
 * A graph in a folder of its own compiles into a matching folder, and deleting
 * the graph and then its output left `src/StarterPlayer/StarterPlayerScripts`
 * behind, empty, for Rojo to sync as empty Folders.
 */

import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultConfig } from "../src/core/schema.js";
import { removeOutputs, type OpenProject } from "../src/server/project.js";

const GENERATED = "-- roswaal-graph: g1\nreturn nil\n";
let root = "";

async function project(): Promise<OpenProject> {
	root = await mkdtemp(join(tmpdir(), "roswaal-orphans-"));
	return { root, config: { ...defaultConfig(), outDir: "src" } } as unknown as OpenProject;
}

afterEach(async () => {
	if (root) await rm(root, { recursive: true, force: true });
});

describe("removing a stale output", () => {
	it("removes the folders it leaves empty, up to the out directory", async () => {
		const open = await project();
		await mkdir(join(root, "src/StarterPlayer/StarterPlayerScripts"), { recursive: true });
		await writeFile(join(root, "src/StarterPlayer/StarterPlayerScripts/Demo.server.luau"), GENERATED);
		await mkdir(join(root, "src/ReplicatedStorage"), { recursive: true });

		expect(await removeOutputs(open, ["src/StarterPlayer/StarterPlayerScripts/Demo.server.luau"])).toBe(1);
		expect((await readdir(join(root, "src"))).sort()).toEqual(["ReplicatedStorage"]);
	});

	it("stops at a folder that still holds something", async () => {
		const open = await project();
		await mkdir(join(root, "src/Shared/Deep"), { recursive: true });
		await writeFile(join(root, "src/Shared/Deep/Gone.luau"), GENERATED);
		await writeFile(join(root, "src/Shared/Kept.luau"), GENERATED);

		await removeOutputs(open, ["src/Shared/Deep/Gone.luau"]);
		expect(await readdir(join(root, "src/Shared"))).toEqual(["Kept.luau"]);
	});

	it("never removes the out directory itself", async () => {
		const open = await project();
		await mkdir(join(root, "src"), { recursive: true });
		await writeFile(join(root, "src/Only.luau"), GENERATED);

		await removeOutputs(open, ["src/Only.luau"]);
		expect(await readdir(root)).toContain("src");
	});
});
