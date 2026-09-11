/**
 * A node map with a `$path` that is not on disk is not written.
 *
 * Rojo builds an empty instance for a path that is not there rather than
 * complaining, so the path check is the only warning anybody gets. It was
 * reported and then ignored: `result.ok` was worked out before the check added
 * its errors, so the project file went out anyway.
 *
 * Against a real directory, because the decision is the order of two awaits
 * inside `compileMap` and a pure function would not have caught it.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { emptyMap, serialiseMap } from "../src/core/nodemap.js";
import { compileMap, openProject } from "../src/server/project.js";

const MAP = ".roswaal/scripts/Game.nodemap";

async function project(): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "roswaal-map-"));
	await writeFile(path.join(root, "roswaal.json"), JSON.stringify({ schemaVersion: 1 }));
	await mkdir(path.join(root, ".roswaal/scripts"), { recursive: true });
	let n = 0;
	// Points ServerScriptService.Source at `src`, which is not there yet.
	await writeFile(path.join(root, MAP), serialiseMap(emptyMap("Game", "map", () => `m${n++}`)));
	return root;
}

describe("writing a node map", () => {
	let root = "";
	afterEach(async () => {
		if (root) await rm(root, { recursive: true, force: true });
	});

	it("refuses a map whose path is not on disk", async () => {
		root = await project();
		const outcome = await compileMap(await openProject(root), MAP, { write: true });

		expect(outcome.written).toBe(false);
		expect(outcome.diagnostics.some((d) => d.severity === "error" && /not on disk/.test(d.message)))
			.toBe(true);
		await expect(readFile(path.join(root, "default.project.json"), "utf8")).rejects.toThrow();
	});

	it("writes it once the path exists", async () => {
		root = await project();
		await mkdir(path.join(root, "src"));
		await writeFile(path.join(root, "src", "Main.server.luau"), "print(1)\n");
		const outcome = await compileMap(await openProject(root), MAP, { write: true });

		expect(outcome.written).toBe(true);
		expect(await readFile(path.join(root, "default.project.json"), "utf8")).toContain('"$path": "src"');
	});
});
