/**
 * That the playground opens on a whole project.
 *
 * Its starting project is `examples/demo`, globbed into the bundle at build
 * time — and a glob is a quiet way to lose files. `**` does not descend into a
 * dot directory, which in a Roswaal project is where *everything that is not
 * output* lives: the graphs, the node maps and the node packs are all under
 * `.roswaal/`. The first build of this mounted the compiled Luau and none of
 * its sources, and it did not fail. It came up as a project with a tree, with
 * generated files correctly marked as generated, and with no graphs — which
 * reads as an empty project somebody compiled once, and is the kind of wrong
 * that survives a look.
 *
 * So the assertion is against the demo on disk rather than a list written here:
 * whatever is in the project the daemon's own tests open has to be in the
 * project the website opens.
 */

import { readdir } from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PLAYGROUND_ROOT, playgroundFiles } from "../src/web/seed.js";

const DEMO = nodePath.resolve(
	nodePath.dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo",
);

async function filesOnDisk(dir: string): Promise<string[]> {
	const out: string[] = [];
	const walk = async (at: string): Promise<void> => {
		for (const entry of await readdir(at, { withFileTypes: true })) {
			const abs = nodePath.join(at, entry.name);
			if (entry.isDirectory()) await walk(abs);
			else out.push(nodePath.relative(dir, abs).split(nodePath.sep).join("/"));
		}
	};
	await walk(dir);
	return out.sort();
}

describe("the project the playground starts on", () => {
	it("carries every file the demo has on disk", async () => {
		const seeded = Object.keys(playgroundFiles())
			.map((path) => path.slice(`${PLAYGROUND_ROOT}/`.length))
			.sort();

		expect(seeded).toEqual(await filesOnDisk(DEMO));
	});

	/**
	 * Named explicitly as well, because the check above would still pass if the
	 * demo itself lost its graphs — and these three kinds of file are the ones a
	 * dot-directory glob silently drops.
	 */
	it("carries the graphs, the node map and the node packs", async () => {
		const seeded = Object.keys(playgroundFiles());

		expect(seeded.some((path) => path.endsWith(".nodescript"))).toBe(true);
		expect(seeded.some((path) => path.endsWith(".nodemap"))).toBe(true);
		expect(seeded.some((path) => path.endsWith(".nodedef.json"))).toBe(true);
		expect(seeded.some((path) => path.endsWith(".nodedef.luau"))).toBe(true);
		expect(seeded).toContain(`${PLAYGROUND_ROOT}/roswaal.json`);
	});

	it("keeps the contents, not just the names", () => {
		const seeded = playgroundFiles();
		const config = JSON.parse(seeded[`${PLAYGROUND_ROOT}/roswaal.json`]) as
			{ sourceDir: string; outDir: string };

		expect(config.sourceDir).toBe(".roswaal/scripts");
		expect(config.outDir).toBe("src");
	});
});
